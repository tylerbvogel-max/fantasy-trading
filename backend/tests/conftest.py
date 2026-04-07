"""
Test infrastructure — NASA NPR 7150.2D compliant.

Session-scoped engine creates/drops all tables once per test run.
Function-scoped sessions use transaction rollback for zero-leak isolation.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import NullPool

# Set test environment BEFORE any app imports.
# Force DATABASE_URL to point at the test database (override .env).
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://tylerbvogel@localhost:5432/fantasy_trading_test",
)

# Clear lru_cache so Settings picks up our env overrides
from app.config import get_settings  # noqa: E402
get_settings.cache_clear()

from app.database import Base, get_db  # noqa: E402
from app.models import *  # noqa: F401,F403,E402 — register all models
from app.main import app  # noqa: E402
from app.services.auth_service import hash_token  # noqa: E402
from app.services.bounty_config import STARTING_DOUBLE_DOLLARS, STARTING_CHAMBERS  # noqa: E402


# ── Session-scoped event loop ──


# ── Per-test database session with fresh engine ──
# Each test gets its own engine → connection → transaction → rollback.
# Tables are created once (idempotent via create_all) and left in place.


@pytest_asyncio.fixture
async def db_session():
    """Each test gets an isolated session rolled back on teardown."""
    settings = get_settings()
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        echo=False,
    )
    # Ensure tables exist (idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        yield session
        await session.close()
        await trans.rollback()

    await engine.dispose()


# ── httpx test client with DB override ──


@pytest_asyncio.fixture
async def client(db_session):
    """Async HTTP client bound to the FastAPI app with test DB session."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Entity fixtures ──

TEST_TOKEN = "test-token-for-unit-tests"
ADMIN_TOKEN = "admin-token-for-unit-tests"


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a regular user with a known token."""
    from app.models.user import User

    user = User(
        alias=f"testplayer_{uuid.uuid4().hex[:6]}",
        token_hash=hash_token(TEST_TOKEN),
        is_admin=False,
    )
    db_session.add(user)
    await db_session.flush()
    return {"user": user, "token": TEST_TOKEN}


@pytest_asyncio.fixture
async def admin_user(db_session):
    """Create an admin user with a known token."""
    from app.models.user import User

    user = User(
        alias=f"admin_{uuid.uuid4().hex[:6]}",
        token_hash=hash_token(ADMIN_TOKEN),
        is_admin=True,
    )
    db_session.add(user)
    await db_session.flush()
    return {"user": user, "token": ADMIN_TOKEN}


@pytest_asyncio.fixture
async def test_player_stats(db_session, test_user):
    """Create starting player stats for the test user."""
    from app.models.bounty import BountyPlayerStats

    stats = BountyPlayerStats(
        user_id=test_user["user"].id,
        double_dollars=STARTING_DOUBLE_DOLLARS,
        wanted_level=1,
        chambers=STARTING_CHAMBERS,
        notoriety=0.0,
        total_predictions=0,
        correct_predictions=0,
    )
    db_session.add(stats)
    await db_session.flush()
    return stats


@pytest_asyncio.fixture
async def test_window(db_session):
    """Create an active bounty window with 5 stock rows."""
    from app.models.bounty import BountyWindow, BountyWindowStock

    now = datetime.now(timezone.utc)
    window = BountyWindow(
        id=uuid.uuid4(),
        window_date=now.date(),
        window_index=1,
        start_time=now - timedelta(minutes=5),
        end_time=now + timedelta(minutes=55),
        is_settled=False,
    )
    db_session.add(window)
    await db_session.flush()

    for sym in ("SPY", "AAPL", "NVDA", "TSLA", "MSFT"):
        db_session.add(BountyWindowStock(
            bounty_window_id=window.id,
            symbol=sym,
            open_price=150.0000,
        ))
    await db_session.flush()
    return window


@pytest_asyncio.fixture
async def invite_code(db_session):
    """Create a valid invite code for auth tests."""
    from app.models.invite_code import InviteCode

    code = InviteCode(code="TEST-INVITE", max_uses=10, times_used=0)
    db_session.add(code)
    await db_session.flush()
    return code
