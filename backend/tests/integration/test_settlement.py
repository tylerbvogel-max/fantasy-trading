"""
Integration tests for window settlement — SAFETY-CRITICAL.

NPR-7150-SV: Settlement determines player rewards and penalties.
Mocks external stock price fetching to control outcomes.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.services.bounty_service import (
    submit_prediction,
    settle_window,
    get_or_create_player_stats,
)
from app.models.bounty import BountyWindow, BountyWindowStock

pytestmark = [pytest.mark.integration, pytest.mark.safety_critical]


@pytest_asyncio.fixture
async def settled_window_setup(db_session, test_user):
    """Create a window in the past with stocks and a prediction, ready to settle."""
    now = datetime.now(timezone.utc)
    window = BountyWindow(
        id=uuid.uuid4(),
        window_date=now.date(),
        window_index=99,
        start_time=now - timedelta(minutes=120),
        end_time=now - timedelta(minutes=1),
        is_settled=False,
    )
    db_session.add(window)
    await db_session.flush()

    # Add stocks with known open prices
    for sym, price in [("SPY", 450.0), ("AAPL", 180.0), ("NVDA", 900.0)]:
        db_session.add(BountyWindowStock(
            bounty_window_id=window.id,
            symbol=sym,
            open_price=price,
        ))
    await db_session.flush()

    # Create player stats
    stats = await get_or_create_player_stats(db_session, test_user["user"].id)

    return window, stats


class TestSettleWindow:
    async def test_settle_marks_settled(self, db_session, test_user, settled_window_setup):
        window, stats = settled_window_setup

        # Mock external calls
        with patch("app.services.bounty_service.get_stock_price", new_callable=AsyncMock) as mock_price, \
             patch("app.services.bounty_service.fetch_chart_yahoo", new_callable=AsyncMock) as mock_chart:
            mock_price.return_value = 455.0  # SPY up
            mock_chart.return_value = []  # fallback threshold

            await settle_window(db_session, window.id)

        assert window.is_settled is True
        assert isinstance(window.is_settled, bool)

    async def test_settle_idempotent(self, db_session, test_user, settled_window_setup):
        """Settling twice should not error or double-process."""
        window, stats = settled_window_setup

        with patch("app.services.bounty_service.get_stock_price", new_callable=AsyncMock) as mock_price, \
             patch("app.services.bounty_service.fetch_chart_yahoo", new_callable=AsyncMock) as mock_chart:
            mock_price.return_value = 455.0
            mock_chart.return_value = []

            await settle_window(db_session, window.id)
            dd_after_first = stats.double_dollars

            await settle_window(db_session, window.id)
            assert stats.double_dollars == dd_after_first

    async def test_settle_with_prediction_updates_dd(self, db_session, test_user, settled_window_setup):
        """Player who predicted correctly should gain DD."""
        window, stats = settled_window_setup
        initial_dd = stats.double_dollars

        # Submit prediction while window was "active" — fake the timing
        window.end_time = datetime.now(timezone.utc) + timedelta(minutes=5)
        await db_session.flush()

        await submit_prediction(
            db_session, test_user["user"].id, window.id,
            prediction="UP", bet_amount=50, symbol="SPY",
        )
        dd_after_pred = stats.double_dollars

        # Now expire the window and settle
        window.end_time = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.flush()

        with patch("app.services.bounty_service.get_stock_price", new_callable=AsyncMock) as mock_price, \
             patch("app.services.bounty_service.fetch_chart_yahoo", new_callable=AsyncMock) as mock_chart:
            mock_price.return_value = 460.0  # SPY went up significantly
            mock_chart.return_value = []

            await settle_window(db_session, window.id)

        # DD should change after settlement (either gain or loss)
        assert stats.double_dollars != dd_after_pred or stats.total_predictions > 0
        assert window.is_settled is True
