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
from app.services.news_regime_service import run_regime_assessment
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


async def job_bounty_cycle():
    """Settle expired windows and create new ones. Runs every 15 minutes."""
    async with async_session() as db:
        try:
            now = datetime.now(timezone.utc)
            # Settle any recently expired unsettled windows
            from sqlalchemy import and_
            from datetime import timedelta
            result = await db.execute(
                select(BountyWindow).where(
                    and_(
                        BountyWindow.end_time <= now,
                        BountyWindow.end_time > now - timedelta(minutes=15),
                        BountyWindow.is_settled == False,
                    )
                )
            )
            window = result.scalars().first()
            if window:
                await settle_window(db, window.id)
                logger.info(f"Settled bounty window {window.window_index}")

            # Create/ensure current window exists
            windows = await get_or_create_today_windows(db)
            if windows:
                await record_window_open_price(db, windows[0].id)
                logger.info(f"Bounty cycle: window {windows[0].window_index} active")
        except Exception as e:
            logger.error(f"Bounty cycle failed: {e}")


async def job_regime_assessment():
    """Assess market regime from news headlines + quantitative data."""
    async with async_session() as db:
        try:
            regime = await run_regime_assessment(db)
            logger.info(f"Regime assessment complete: {regime.final_regime}")
        except Exception as e:
            logger.error(f"Regime assessment failed: {e}")


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

    # Bounty cycle: settle + create every 15 minutes (1-min offset for settlement)
    scheduler.add_job(
        job_bounty_cycle,
        CronTrigger(minute="1,16,31,46", day_of_week="mon-fri"),
        id="bounty_cycle",
        replace_existing=True,
    )

    # Regime assessment: 3x daily Mon-Fri at ET 9:30am, 1:30pm, 5:30pm (UTC 14:30, 18:30, 22:30)
    scheduler.add_job(
        job_regime_assessment,
        CronTrigger(hour="14,18,22", minute=30, day_of_week="mon-fri"),
        id="regime_assessment",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background scheduler started")


def stop_scheduler():
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler stopped")
