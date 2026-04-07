from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import get_settings

settings = get_settings()

# Production-grade connection pool settings:
# - pool_pre_ping: detect and discard stale connections before use
# - pool_recycle: close connections after 5 min to avoid Render/PG idle timeouts
# - pool_size: base connections kept open (scales with workers)
# - max_overflow: burst connections beyond pool_size
_pool_kwargs = (
    {"poolclass": NullPool}
    if settings.environment == "test"
    else {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    **_pool_kwargs,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
