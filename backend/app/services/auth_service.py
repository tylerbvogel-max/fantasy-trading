import secrets
import hashlib
from uuid import UUID
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.models.user import User
from app.models.invite_code import InviteCode
from app.models.refresh_token import RefreshToken
from app.models.email_token import EmailVerificationToken, PasswordResetToken
from app.database import get_db
from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Pure helpers ──

def generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a token for storage (SHA-256)."""
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: UUID) -> str:
    """Create a short-lived JWT access token."""
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": str(user_id), "exp": expires}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> UUID | None:
    """Decode a JWT access token. Returns user_id or None."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id_str = payload.get("sub")
        if user_id_str:
            return UUID(user_id_str)
    except (JWTError, ValueError):
        pass
    return None


def validate_password(password: str) -> None:
    """Validate password meets minimum requirements. Raises ValueError."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")


# ── Invite code validation ──

async def _validate_invite_code(db: AsyncSession, code: str) -> InviteCode:
    """Validate an invite code. Returns the InviteCode or raises ValueError."""
    invite = await db.get(InviteCode, code.upper())
    if not invite:
        raise ValueError("Invalid invite code.")
    if invite.times_used >= invite.max_uses:
        raise ValueError("This invite code has been fully used.")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise ValueError("This invite code has expired.")
    return invite


async def _check_alias_unique(db: AsyncSession, alias: str) -> None:
    """Check alias is unique. Raises ValueError if taken."""
    result = await db.execute(
        select(User).where(User.alias == alias.lower().strip())
    )
    if result.scalar_one_or_none():
        raise ValueError("This alias is already taken.")


async def _check_email_unique(db: AsyncSession, email: str) -> None:
    """Check email is unique. Raises ValueError if taken."""
    result = await db.execute(
        select(User).where(User.email == email.lower().strip())
    )
    if result.scalar_one_or_none():
        raise ValueError("This email is already registered.")


# ── Legacy registration (invite code + opaque token) ──

async def register_user(
    db: AsyncSession, alias: str, invite_code: str
) -> tuple[User, str]:
    """Register a new user with an invite code. Returns (user, raw_token)."""
    code = await _validate_invite_code(db, invite_code)
    await _check_alias_unique(db, alias)

    raw_token = generate_token()
    user = User(
        alias=alias.lower().strip(),
        invite_code_used=invite_code.upper(),
        token_hash=hash_token(raw_token),
    )
    db.add(user)
    code.times_used += 1
    await db.commit()
    await db.refresh(user)
    return user, raw_token


# ── New registration (email + password) ──

async def register_user_v2(
    db: AsyncSession,
    alias: str,
    email: str,
    password: str,
    invite_code: str | None = None,
) -> tuple[User, str, str]:
    """Register with email/password. Returns (user, access_token, refresh_token)."""
    validate_password(password)
    settings = get_settings()

    if settings.require_invite_code:
        if not invite_code:
            raise ValueError("Invite code is required.")
        code = await _validate_invite_code(db, invite_code)
    else:
        code = None
        if invite_code:
            code = await _validate_invite_code(db, invite_code)

    await _check_alias_unique(db, alias)
    await _check_email_unique(db, email)

    user = User(
        alias=alias.lower().strip(),
        email=email.lower().strip(),
        password_hash=hash_password(password),
        invite_code_used=invite_code.upper() if invite_code else None,
    )
    db.add(user)
    if code:
        code.times_used += 1

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    raw_refresh = await _create_refresh_token(db, user.id)
    return user, access_token, raw_refresh


# ── Authentication ──

async def authenticate_user(db: AsyncSession, alias: str, token: str) -> User:
    """Authenticate a user by alias and legacy token."""
    result = await db.execute(
        select(User).where(User.alias == alias.lower().strip())
    )
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found.")
    if user.token_hash != hash_token(token):
        raise ValueError("Invalid token.")
    return user


async def login_with_password(
    db: AsyncSession, email_or_alias: str, password: str
) -> tuple[User, str, str]:
    """Login with email/alias + password. Returns (user, access_token, refresh_token)."""
    identifier = email_or_alias.lower().strip()
    result = await db.execute(
        select(User).where(
            (User.email == identifier) | (User.alias == identifier)
        )
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise ValueError("Invalid credentials.")
    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials.")

    access_token = create_access_token(user.id)
    raw_refresh = await _create_refresh_token(db, user.id)
    return user, access_token, raw_refresh


# ── Legacy token lookup ──

async def get_user_by_token(db: AsyncSession, token: str) -> User | None:
    """Look up user by their raw legacy token."""
    token_h = hash_token(token)
    result = await db.execute(select(User).where(User.token_hash == token_h))
    return result.scalar_one_or_none()


# ── Dual-mode get_current_user ──

async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency: JWT first, legacy token fallback."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    token = authorization.replace("Bearer ", "").strip()

    # Try JWT decode first (new path)
    user_id = decode_access_token(token)
    if user_id:
        user = await db.get(User, user_id)
        if user:
            return user

    # Fall back to legacy opaque token
    user = await get_user_by_token(db, token)
    if user:
        return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Refresh tokens ──

async def _create_refresh_token(
    db: AsyncSession, user_id: UUID, device_name: str | None = None
) -> str:
    """Create and store a refresh token. Returns the raw token."""
    settings = get_settings()
    raw_token = generate_token()
    rt = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        device_name=device_name,
        expires_at=datetime.now(timezone.utc) + timedelta(
            days=settings.refresh_token_expire_days
        ),
    )
    db.add(rt)
    await db.commit()
    return raw_token


async def rotate_refresh_token(
    db: AsyncSession, old_raw_token: str, device_name: str | None = None
) -> tuple[str, str]:
    """Rotate a refresh token. Returns (new_access_token, new_refresh_token)."""
    old_hash = hash_token(old_raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == old_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise ValueError("Invalid or revoked refresh token.")
    if rt.expires_at < datetime.now(timezone.utc):
        raise ValueError("Refresh token has expired.")

    # Revoke old token
    rt.revoked_at = datetime.now(timezone.utc)

    # Issue new pair
    access_token = create_access_token(rt.user_id)
    new_raw_refresh = await _create_refresh_token(
        db, rt.user_id, device_name or rt.device_name
    )
    return access_token, new_raw_refresh


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    """Revoke a specific refresh token (logout)."""
    token_h = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_h,
            RefreshToken.revoked_at.is_(None),
        )
    )
    rt = result.scalar_one_or_none()
    if rt:
        rt.revoked_at = datetime.now(timezone.utc)
        await db.commit()


async def revoke_all_user_tokens(db: AsyncSession, user_id: UUID) -> None:
    """Revoke all refresh tokens for a user."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    for rt in result.scalars():
        rt.revoked_at = datetime.now(timezone.utc)
    await db.commit()


# ── Account upgrade (legacy → email/password) ──

async def upgrade_legacy_user(
    db: AsyncSession, legacy_token: str, email: str, password: str
) -> tuple[User, str, str]:
    """Upgrade a legacy token-only user to email/password auth."""
    validate_password(password)
    user = await get_user_by_token(db, legacy_token)
    if not user:
        raise ValueError("Invalid legacy token.")
    if user.password_hash:
        raise ValueError("Account already has a password.")

    await _check_email_unique(db, email)

    user.email = email.lower().strip()
    user.password_hash = hash_password(password)

    access_token = create_access_token(user.id)
    raw_refresh = await _create_refresh_token(db, user.id)
    await db.commit()
    return user, access_token, raw_refresh


# ── Email verification ──

async def create_email_verification(
    db: AsyncSession, user_id: UUID
) -> str:
    """Create an email verification token. Returns the raw token."""
    raw_token = generate_token()
    evt = EmailVerificationToken(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(evt)
    await db.commit()
    return raw_token


async def verify_email(db: AsyncSession, raw_token: str) -> User:
    """Verify an email using the token. Returns the user."""
    token_h = hash_token(raw_token)
    result = await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_h,
            EmailVerificationToken.used_at.is_(None),
        )
    )
    evt = result.scalar_one_or_none()
    if not evt:
        raise ValueError("Invalid or already-used verification token.")
    if evt.expires_at < datetime.now(timezone.utc):
        raise ValueError("Verification token has expired.")

    evt.used_at = datetime.now(timezone.utc)
    user = await db.get(User, evt.user_id)
    if not user:
        raise ValueError("User not found.")
    user.email_verified = True
    await db.commit()
    return user


# ── Password reset ──

async def create_password_reset(db: AsyncSession, email: str) -> str | None:
    """Create a password reset token. Returns raw token or None if email not found."""
    result = await db.execute(
        select(User).where(User.email == email.lower().strip())
    )
    user = result.scalar_one_or_none()
    if not user:
        return None

    raw_token = generate_token()
    prt = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db.add(prt)
    await db.commit()
    return raw_token


async def reset_password(db: AsyncSession, raw_token: str, new_password: str) -> User:
    """Reset a password using the reset token."""
    validate_password(new_password)
    token_h = hash_token(raw_token)
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_h,
            PasswordResetToken.used_at.is_(None),
        )
    )
    prt = result.scalar_one_or_none()
    if not prt:
        raise ValueError("Invalid or already-used reset token.")
    if prt.expires_at < datetime.now(timezone.utc):
        raise ValueError("Reset token has expired.")

    prt.used_at = datetime.now(timezone.utc)
    user = await db.get(User, prt.user_id)
    if not user:
        raise ValueError("User not found.")
    user.password_hash = hash_password(new_password)

    # Revoke all refresh tokens (force re-login)
    await revoke_all_user_tokens(db, user.id)
    await db.commit()
    return user


# ── Invite code management ──

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
