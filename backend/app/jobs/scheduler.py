"""
Background jobs that replace the Apps Script triggers.
Uses APScheduler for task scheduling.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from app.database import async_session
from app.models.season import Season
from app.services.finnhub_service import refresh_all_prices, refresh_stock_price
from app.services.portfolio_service import capture_daily_snapshot
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def job_refresh_prices():
    """Refresh stock prices from Finnhub."""
    async with async_session() as db:
        try:
            count = await refresh_all_prices(db)
            logger.info(f"Price refresh complete: {count} stocks updated")
        except Exception as e:
            logger.error(f"Price refresh failed: {e}")


async def job_daily_snapshot():
    """Capture daily portfolio snapshots for all active seasons."""
    async with async_session() as db:
        try:
            # Ensure benchmark prices are fresh before snapshotting
            for symbol in ["SPY", "IWM"]:
                await refresh_stock_price(db, symbol)

            result = await db.execute(
                select(Season).where(Season.is_active == True)
            )
            seasons = list(result.scalars().all())

            total = 0
            for season in seasons:
                count = await capture_daily_snapshot(db, season.id)
                total += count
                logger.info(f"Snapshot for {season.id}: {count} players")

            logger.info(f"Daily snapshot complete: {total} total snapshots")
        except Exception as e:
            logger.error(f"Daily snapshot failed: {e}")


def start_scheduler():
    """Initialize and start the background job scheduler."""
    # Price refresh: every 15 min during market hours (Mon-Fri 9:30-16:00 ET)
    # Simplified: every 15 min Mon-Fri
    scheduler.add_job(
        job_refresh_prices,
        CronTrigger(minute="*/15", day_of_week="mon-fri"),
        id="price_refresh",
        replace_existing=True,
    )

    # Off-hours refresh: every hour on weekends and after market close
    scheduler.add_job(
        job_refresh_prices,
        CronTrigger(minute=0, day_of_week="sat-sun"),
        id="price_refresh_weekend",
        replace_existing=True,
    )

    # Daily snapshot: 4:30 PM ET (21:30 UTC)
    scheduler.add_job(
        job_daily_snapshot,
        CronTrigger(hour=21, minute=30),
        id="daily_snapshot",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background scheduler started")


def stop_scheduler():
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler stopped")
