"""Email service — sends verification and password reset emails.

Uses Resend API in production, logs to console in dev/test.
"""
import logging
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)

VERIFY_SUBJECT = "Verify your Bounty Hunter account"
RESET_SUBJECT = "Reset your Bounty Hunter password"


async def send_verification_email(email: str, token: str, alias: str) -> None:
    """Send an email verification link."""
    settings = get_settings()
    link = f"{settings.app_url}/auth/verify-email?token={token}"
    body = (
        f"Howdy {alias},\n\n"
        f"Verify your email by clicking this link:\n{link}\n\n"
        f"This link expires in 24 hours.\n\n"
        f"— The Bounty Hunter Posse"
    )
    await _send(email, VERIFY_SUBJECT, body)


async def send_password_reset_email(email: str, token: str, alias: str) -> None:
    """Send a password reset link."""
    settings = get_settings()
    link = f"{settings.app_url}/auth/reset-password?token={token}"
    body = (
        f"Howdy {alias},\n\n"
        f"Reset your password by clicking this link:\n{link}\n\n"
        f"This link expires in 1 hour. If you didn't request this, ignore it.\n\n"
        f"— The Bounty Hunter Posse"
    )
    await _send(email, RESET_SUBJECT, body)


async def _send(to: str, subject: str, body: str) -> None:
    """Send an email via Resend API, or log in dev/test."""
    settings = get_settings()

    if not settings.resend_api_key or settings.environment in ("dev", "test"):
        logger.info("EMAIL [%s] To: %s\n%s", subject, to, body)
        return

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "text": body,
            },
            timeout=10.0,
        )
        if resp.status_code not in (200, 201):
            logger.error("Resend API error: %s %s", resp.status_code, resp.text)
