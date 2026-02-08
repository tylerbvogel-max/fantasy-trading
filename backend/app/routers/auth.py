from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import register_user, authenticate_user, get_current_user
from app.models.user import User
from app.models.player_season import PlayerSeason
from app.models.season import Season
from app.schemas import (
    RegisterRequest, RegisterResponse, LoginRequest, LoginResponse,
    UserProfile, SeasonSummary,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
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
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
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
    # Load active seasons
    result = await db.execute(
        select(PlayerSeason)
        .options(selectinload(PlayerSeason.season))
        .where(PlayerSeason.user_id == user.id, PlayerSeason.is_active == True)
    )
    player_seasons = list(result.scalars().all())

    active_seasons = [
        SeasonSummary(
            id=ps.season.id,
            name=ps.season.name,
            season_type=ps.season.season_type,
            is_active=ps.season.is_active,
            starting_cash=float(ps.season.starting_cash),
            start_date=ps.season.start_date,
            end_date=ps.season.end_date,
        )
        for ps in player_seasons
    ]

    return UserProfile(
        id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        created_at=user.created_at,
        active_seasons=active_seasons,
    )
