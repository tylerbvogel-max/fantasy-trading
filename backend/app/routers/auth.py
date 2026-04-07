import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services import auth_service
from app.services.auth_service import get_current_user
from app.services import email_service
from app.models.user import User
from sqlalchemy import delete
from app.models.bounty import (
    BountyPrediction, BountyPlayerStats, BountyPlayerIron, BountyIronOffering,
    BountyRunHistory, BountyBadge, BountyTitle, BountyActivityEvent,
)
from app.models.refresh_token import RefreshToken
from app.models.email_token import EmailVerificationToken, PasswordResetToken
from app.schemas import (
    RegisterRequest, RegisterResponse, LoginRequest, LoginResponse,
    UserProfile, RegisterRequestV2, LoginRequestV2, AuthTokenResponse,
    RefreshRequest, ForgotPasswordRequest, ResetPasswordRequest,
    UpgradeAccountRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limiting is handled by RateLimitMiddleware (auth tier: 10 req/min/IP)


# ── Legacy endpoints (backwards compat) ──

@router.post("/register", response_model=RegisterResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        user, token = await auth_service.register_user(db, req.alias, req.invite_code)
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
        user = await auth_service.authenticate_user(db, req.alias, req.token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    return LoginResponse(
        user_id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        token=req.token,
    )


# ── New v2 endpoints (email/password + JWT) ──

@router.post("/v2/register", response_model=AuthTokenResponse)
async def register_v2(req: RegisterRequestV2, db: AsyncSession = Depends(get_db)):
    try:
        user, access_token, refresh_token = await auth_service.register_user_v2(
            db, req.alias, req.email, req.password, req.invite_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Send verification email (non-blocking — don't fail registration)
    try:
        verify_token = await auth_service.create_email_verification(db, user.id)
        await email_service.send_verification_email(user.email, verify_token, user.alias)
    except Exception:
        logger.exception("Failed to send verification email for %s", user.alias)

    return AuthTokenResponse(
        user_id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/v2/login", response_model=AuthTokenResponse)
async def login_v2(req: LoginRequestV2, db: AsyncSession = Depends(get_db)):
    try:
        user, access_token, refresh_token = await auth_service.login_with_password(
            db, req.email_or_alias, req.password,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    return AuthTokenResponse(
        user_id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        access_token, new_refresh = await auth_service.rotate_refresh_token(
            db, req.refresh_token,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Look up user from the new access token to populate response
    user_id = auth_service.decode_access_token(access_token)
    user = await db.get(User, user_id)

    return AuthTokenResponse(
        user_id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        access_token=access_token,
        refresh_token=new_refresh,
    )


@router.post("/logout")
async def logout(
    req: RefreshRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.revoke_refresh_token(db, req.refresh_token)
    return {"message": "Logged out."}


@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Send a password reset email. Always returns 200 (no email enumeration)."""
    raw_token = await auth_service.create_password_reset(db, req.email)
    if raw_token:
        # Look up user for alias in email
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == req.email.lower().strip()))
        user = result.scalar_one_or_none()
        alias = user.alias if user else "there"
        try:
            await email_service.send_password_reset_email(req.email, raw_token, alias)
        except Exception:
            logger.exception("Failed to send reset email to %s", req.email)

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def do_reset_password(
    req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    try:
        await auth_service.reset_password(db, req.token, req.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Password has been reset. Please log in again."}


@router.get("/verify-email", response_class=HTMLResponse)
async def verify_email_page(
    token: str = Query(...), db: AsyncSession = Depends(get_db)
):
    """Verify email via link click. Returns a simple HTML page."""
    try:
        user = await auth_service.verify_email(db, token)
        return HTMLResponse(
            f"<html><body><h2>Email verified!</h2>"
            f"<p>{user.alias}, your email has been verified. "
            f"You can close this page.</p></body></html>"
        )
    except ValueError as e:
        return HTMLResponse(
            f"<html><body><h2>Verification failed</h2>"
            f"<p>{str(e)}</p></body></html>",
            status_code=400,
        )


@router.post("/upgrade", response_model=AuthTokenResponse)
async def upgrade_account(
    req: UpgradeAccountRequest, db: AsyncSession = Depends(get_db)
):
    """Upgrade a legacy token-only account to email/password."""
    try:
        user, access_token, refresh_token = await auth_service.upgrade_legacy_user(
            db, req.legacy_token, req.email, req.password,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Send verification email
    try:
        verify_token = await auth_service.create_email_verification(db, user.id)
        await email_service.send_verification_email(user.email, verify_token, user.alias)
    except Exception:
        logger.exception("Failed to send verification email for %s", user.alias)

    return AuthTokenResponse(
        user_id=user.id,
        alias=user.alias,
        is_admin=user.is_admin,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.delete("/account")
async def delete_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete user account and all associated data. Required by Apple App Store."""
    uid = user.id
    # Delete child tables first (foreign key order)
    await db.execute(delete(BountyPrediction).where(BountyPrediction.user_id == uid))
    await db.execute(delete(BountyPlayerIron).where(BountyPlayerIron.user_id == uid))
    await db.execute(delete(BountyIronOffering).where(BountyIronOffering.user_id == uid))
    await db.execute(delete(BountyRunHistory).where(BountyRunHistory.user_id == uid))
    await db.execute(delete(BountyBadge).where(BountyBadge.user_id == uid))
    await db.execute(delete(BountyTitle).where(BountyTitle.user_id == uid))
    await db.execute(delete(BountyActivityEvent).where(BountyActivityEvent.user_id == uid))
    await db.execute(delete(BountyPlayerStats).where(BountyPlayerStats.user_id == uid))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == uid))
    await db.execute(delete(EmailVerificationToken).where(EmailVerificationToken.user_id == uid))
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == uid))
    # Finally delete the user
    await db.delete(user)
    await db.commit()
    logger.info("Account deleted: user_id=%s alias=%s", uid, user.alias)
    return {"message": "Account permanently deleted."}


# ── Shared endpoints ──

@router.get("/dev-token")
async def dev_token(db: AsyncSession = Depends(get_db)):
    """Auto-create a dev user and return a usable token. Disabled in production."""
    from app.config import get_settings
    if get_settings().is_prod:
        raise HTTPException(status_code=404, detail="Not found")
    from sqlalchemy import select
    DEV_TOKEN = "dev"
    result = await db.execute(select(User).where(User.alias == "dev"))
    user = result.scalar_one_or_none()
    if not user:
        user = User(alias="dev", is_admin=True, token_hash=auth_service.hash_token(DEV_TOKEN))
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
        email=user.email,
        email_verified=user.email_verified,
        is_admin=user.is_admin,
        has_password=user.password_hash is not None,
        created_at=user.created_at,
    )
