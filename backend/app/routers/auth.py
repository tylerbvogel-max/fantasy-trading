from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import register_user, authenticate_user, get_current_user
from app.models.user import User
from app.schemas import (
    RegisterRequest, RegisterResponse, LoginRequest, LoginResponse,
    UserProfile,
)
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


@router.get("/dev-token")
async def dev_token(db: AsyncSession = Depends(get_db)):
    """Auto-create a dev user and return a usable token. For local testing only."""
    from app.services.auth_service import hash_token
    from sqlalchemy import select
    DEV_TOKEN = "dev"
    result = await db.execute(select(User).where(User.alias == "dev"))
    user = result.scalar_one_or_none()
    if not user:
        user = User(alias="dev", is_admin=True, token_hash=hash_token(DEV_TOKEN))
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return {"alias": user.alias, "token": DEV_TOKEN}


@router.get("/me", response_model=UserProfile)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return UserProfile(
        id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )
