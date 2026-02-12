from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import register_user, authenticate_user, get_current_user
from app.services.education_service import _compute_knowledge_score
from app.models.user import User
from app.models.player_season import PlayerSeason
from app.models.season import Season
from app.schemas import (
    RegisterRequest, RegisterResponse, LoginRequest, LoginResponse,
    UserProfile, SeasonSummary,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from collections import defaultdict
from time import time

router = APIRouter(prefix="/auth", tags=["auth"])

# Simple in-memory rate limiter: max 10 auth attempts per IP per minute
_rate_limit: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time()
    # Prune old entries
    _rate_limit[ip] = [t for t in _rate_limit[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limit[ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")
    _rate_limit[ip].append(now)


@router.post("/register", response_model=RegisterResponse)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    _check_rate_limit(request)
    try:
        user, token = await register_user(db, req.alias, req.invite_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return RegisterResponse(
        user_id=user.id,
        alias=user.alias,
        token=token,
        message=f"Welcome, {user.alias}! Save your token — you'll need it to log in.",
    )


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    _check_rate_limit(request)
    try:
        user = await authenticate_user(db, req.alias, req.token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    return LoginResponse(
        user_id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        token=req.token,
    )


@router.get("/me", response_model=UserProfile)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    knowledge_score = await _compute_knowledge_score(db, user.id)

    # Load active seasons
    result = await db.execute(
        select(PlayerSeason)
        .options(selectinload(PlayerSeason.season))
        .where(PlayerSeason.user_id == user.id, PlayerSeason.is_active == True)
    )
    player_seasons = list(result.scalars().all())
    joined_season_ids = {ps.season_id for ps in player_seasons}

    # Auto-enroll in active classroom seasons
    cr = await db.execute(
        select(Season).where(Season.game_mode == "classroom", Season.is_active == True)
    )
    new_classroom_seasons = [s for s in cr.scalars().all() if s.id not in joined_season_ids]

    for cs in new_classroom_seasons:
        starting_cash = float(cs.starting_cash)
        max_bonus = starting_cash * 0.25
        bonus = min(knowledge_score * 25, max_bonus)
        db.add(PlayerSeason(
            user_id=user.id,
            season_id=cs.id,
            cash_balance=starting_cash + bonus,
        ))

    if new_classroom_seasons:
        await db.commit()

    active_seasons = [
        SeasonSummary(
            id=ps.season.id,
            name=ps.season.name,
            season_type=ps.season.season_type,
            mode=ps.season.game_mode,
            is_active=ps.season.is_active,
            starting_cash=float(ps.season.starting_cash),
            start_date=ps.season.start_date,
            end_date=ps.season.end_date,
            max_trades_per_player=ps.season.max_trades_per_player,
        )
        for ps in player_seasons
    ]

    for cs in new_classroom_seasons:
        active_seasons.append(SeasonSummary(
            id=cs.id,
            name=cs.name,
            season_type=cs.season_type,
            mode=cs.game_mode,
            is_active=cs.is_active,
            starting_cash=float(cs.starting_cash),
            start_date=cs.start_date,
            end_date=cs.end_date,
            max_trades_per_player=cs.max_trades_per_player,
        ))

    return UserProfile(
        id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        created_at=user.created_at,
        active_seasons=active_seasons,
        knowledge_score=knowledge_score,
    )
