"""
Background jobs for the Bounty Hunter app.
Uses APScheduler for task scheduling.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from app.database import async_session
from app.models.bounty import BountyWindow
from app.services.finnhub_service import refresh_all_prices, refresh_trending_stocks
from app.services.bounty_service import (
    get_or_create_today_windows,
    settle_window,
    record_window_open_price,
    get_current_window,
)
import logging
from datetime import datetime, timezone

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


async def job_refresh_trending():
    """Refresh trending stock rankings from Yahoo Finance."""
    async with async_session() as db:
        try:
            count = await refresh_trending_stocks(db)
            logger.info(f"Trending refresh complete: {count} stocks ranked")
        except Exception as e:
            logger.error(f"Trending refresh failed: {e}")


async def job_create_bounty_windows():
    """Create today's bounty windows (Mon-Fri, runs at 9:50 AM ET)."""
    async with async_session() as db:
        try:
            windows = await get_or_create_today_windows(db)
            logger.info(f"Bounty windows created: {len(windows)} windows")
            # Record open price for the first window if it starts soon
            if windows:
                await record_window_open_price(db, windows[0].id)
        except Exception as e:
            logger.error(f"Bounty window creation failed: {e}")


async def job_settle_bounty_window():
    """Settle the window that just ended and record open price for the new active window."""
    async with async_session() as db:
        try:
            now = datetime.now(timezone.utc)
            # Find the window that just ended (end_time within last 5 minutes)
            from sqlalchemy import and_
            from datetime import timedelta
            result = await db.execute(
                select(BountyWindow).where(
                    and_(
                        BountyWindow.end_time <= now,
                        BountyWindow.end_time > now - timedelta(minutes=5),
                        BountyWindow.is_settled == False,
                    )
                )
            )
            window = result.scalars().first()
            if window:
                await settle_window(db, window.id)
                logger.info(f"Settled bounty window {window.window_index} ({window.result})")

            # Record open price for the newly active window
            current = await get_current_window(db)
            if current:
                await record_window_open_price(db, current.id)
                logger.info(f"Recorded open price for window {current.window_index}")
        except Exception as e:
            logger.error(f"Bounty settlement failed: {e}")


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

    # Trending stocks: 10:00 AM ET (15:00 UTC), Mon-Fri
    scheduler.add_job(
        job_refresh_trending,
        CronTrigger(hour=15, minute=0, day_of_week="mon-fri"),
        id="trending_refresh",
        replace_existing=True,
    )

    # Off-hours refresh: every hour on weekends and after market close
    scheduler.add_job(
        job_refresh_prices,
        CronTrigger(minute=0, day_of_week="sat-sun"),
        id="price_refresh_weekend",
        replace_existing=True,
    )

    # Bounty: create today's windows at 8:50 AM ET (13:50 UTC)
    scheduler.add_job(
        job_create_bounty_windows,
        CronTrigger(hour=13, minute=50, day_of_week="mon-fri"),
        id="bounty_create_windows",
        replace_existing=True,
    )

    # Bounty: settle windows at :01 past each odd hour (ET: 11,13,15,17,19,21 → UTC: 16,18,20,22,0,2)
    scheduler.add_job(
        job_settle_bounty_window,
        CronTrigger(hour="0,2,16,18,20,22", minute=1, day_of_week="mon-fri"),
        id="bounty_settle_window",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background scheduler started")


def stop_scheduler():
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler stopped")
