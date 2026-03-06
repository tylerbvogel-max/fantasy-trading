import secrets
import hashlib
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, HTTPException, Header
from app.models.user import User
from app.models.invite_code import InviteCode
from app.database import get_db


def generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


async def register_user(
    db: AsyncSession, alias: str, invite_code: str
) -> tuple[User, str]:
    """Register a new user with an invite code. Returns (user, raw_token)."""
    # Validate invite code
    code = await db.get(InviteCode, invite_code.upper())
    if not code:
        raise ValueError("Invalid invite code.")
    if code.times_used >= code.max_uses:
        raise ValueError("This invite code has been fully used.")
    if code.expires_at and code.expires_at < datetime.now(timezone.utc):
        raise ValueError("This invite code has expired.")

    # Check alias uniqueness
    existing = await db.execute(select(User).where(User.alias == alias.lower().strip()))
    if existing.scalar_one_or_none():
        raise ValueError("This alias is already taken.")

    # Create user
    raw_token = generate_token()
    user = User(
        alias=alias.lower().strip(),
        invite_code_used=invite_code.upper(),
        token_hash=hash_token(raw_token),
    )
    db.add(user)

    # Increment invite code usage
    code.times_used += 1
    await db.commit()
    await db.refresh(user)

    return user, raw_token


async def authenticate_user(db: AsyncSession, alias: str, token: str) -> User:
    """Authenticate a user by alias and token."""
    result = await db.execute(select(User).where(User.alias == alias.lower().strip()))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found.")
    if user.token_hash != hash_token(token):
        raise ValueError("Invalid token.")
    return user


async def get_user_by_token(db: AsyncSession, token: str) -> User | None:
    """Look up user by their raw token."""
    token_h = hash_token(token)
    result = await db.execute(select(User).where(User.token_hash == token_h))
    return result.scalar_one_or_none()


async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency to get the authenticated user from the Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Support "Bearer <token>" format
    token = authorization.replace("Bearer ", "").strip()
    user = await get_user_by_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


async def create_invite_code(
    db: AsyncSession,
    code: str | None = None,
    max_uses: int = 1,
    created_by: UUID | None = None,
    expires_at: datetime | None = None,
) -> InviteCode:
    """Create a new invite code."""
    if not code:
        code = f"BETA-{secrets.token_hex(4).upper()}"

    invite = InviteCode(
        code=code.upper(),
        created_by=created_by,
        max_uses=max_uses,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return invite
