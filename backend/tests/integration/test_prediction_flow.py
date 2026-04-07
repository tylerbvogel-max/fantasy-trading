"""
Integration tests for prediction submission flow.

NPR-7150-SV: Core gameplay — submit prediction, skip, validation, ante/leverage.
Requires PostgreSQL test database.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone

from app.services.bounty_service import (
    submit_prediction,
    submit_skip,
    get_or_create_player_stats,
    BountyError,
)
from app.services.bounty_config import (
    ANTE_BASE,
    STARTING_DOUBLE_DOLLARS,
    CARRY_COST_PER_X,
)
from app.models.bounty import BountyWindow, BountyWindowStock, BountyPrediction

pytestmark = [pytest.mark.integration, pytest.mark.safety_critical]


class TestSubmitPrediction:
    async def test_success_directional(self, db_session, test_user, test_window):
        """Valid UP prediction creates a record and deducts ante."""
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        initial_dd = stats.double_dollars

        pred = await submit_prediction(
            db_session, test_user["user"].id, test_window.id,
            prediction="UP", bet_amount=50, symbol="SPY",
        )
        assert pred.prediction == "UP"
        assert pred.action_type == "directional"
        assert stats.double_dollars == initial_dd - ANTE_BASE

    async def test_hold_creates_holster(self, db_session, test_user, test_window):
        pred = await submit_prediction(
            db_session, test_user["user"].id, test_window.id,
            prediction="HOLD", bet_amount=30, symbol="SPY",
        )
        assert pred.action_type == "holster"
        assert pred.symbol == "SPY"

    async def test_duplicate_symbol_raises(self, db_session, test_user, test_window):
        await submit_prediction(
            db_session, test_user["user"].id, test_window.id,
            prediction="UP", bet_amount=50, symbol="SPY",
        )
        with pytest.raises(BountyError, match="already made a prediction"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="DOWN", bet_amount=50, symbol="SPY",
            )

    async def test_invalid_direction_raises(self, db_session, test_user, test_window):
        with pytest.raises(BountyError, match="Prediction must be UP, DOWN, or HOLD"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="SIDEWAYS", bet_amount=50, symbol="SPY",
            )

    async def test_bet_out_of_range_raises(self, db_session, test_user, test_window):
        with pytest.raises(BountyError, match="Bet amount must be between"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="UP", bet_amount=101, symbol="SPY",
            )

    async def test_settled_window_raises(self, db_session, test_user, test_window):
        test_window.is_settled = True
        await db_session.flush()
        with pytest.raises(BountyError, match="already been settled"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="UP", bet_amount=50, symbol="SPY",
            )

    async def test_busted_player_raises(self, db_session, test_user, test_window):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.is_busted = True
        await db_session.flush()
        with pytest.raises(BountyError, match="busted"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="UP", bet_amount=50, symbol="SPY",
            )

    async def test_ante_deducted_first_pick_only(self, db_session, test_user, test_window):
        """Second pick in same window does NOT deduct ante again."""
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)

        await submit_prediction(
            db_session, test_user["user"].id, test_window.id,
            prediction="UP", bet_amount=50, symbol="SPY",
        )
        dd_after_first = stats.double_dollars

        await submit_prediction(
            db_session, test_user["user"].id, test_window.id,
            prediction="DOWN", bet_amount=50, symbol="AAPL",
        )
        assert stats.double_dollars == dd_after_first
        assert stats.total_predictions == 2

    async def test_leverage_carry_cost(self, db_session, test_user, test_window):
        """Leverage 3.0 deducts carry cost."""
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.wanted_level = 5  # allows 4.0x leverage
        await db_session.flush()

        initial = stats.double_dollars
        await submit_prediction(
            db_session, test_user["user"].id, test_window.id,
            prediction="UP", bet_amount=50, symbol="SPY", leverage=3.0,
        )
        carry_cost = round((3.0 - 1.0) * CARRY_COST_PER_X)
        assert stats.double_dollars == initial - ANTE_BASE - carry_cost
        assert carry_cost > 0

    async def test_leverage_exceeds_cap_raises(self, db_session, test_user, test_window):
        """Leverage beyond level cap raises error."""
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.wanted_level = 1  # max 2.0x
        await db_session.flush()

        with pytest.raises(BountyError, match="Leverage must be between"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="UP", bet_amount=50, symbol="SPY", leverage=3.0,
            )

    async def test_margin_call_cooldown_blocks_leverage(self, db_session, test_user, test_window):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.margin_call_cooldown = 1
        await db_session.flush()

        with pytest.raises(BountyError, match="cooldown"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="UP", bet_amount=50, symbol="SPY", leverage=2.0,
            )

    async def test_cant_afford_ante_raises(self, db_session, test_user, test_window):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.double_dollars = 10  # Less than ANTE_BASE (75)
        await db_session.flush()

        with pytest.raises(BountyError, match="Can't afford ante"):
            await submit_prediction(
                db_session, test_user["user"].id, test_window.id,
                prediction="UP", bet_amount=50, symbol="SPY",
            )


class TestSubmitSkip:
    async def test_skip_deducts_cost(self, db_session, test_user, test_window):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        initial = stats.double_dollars

        result = await submit_skip(
            db_session, test_user["user"].id, test_window.id, symbol="SPY",
        )
        assert result["skip_cost"] > 0
        assert result["new_balance"] < initial

    async def test_skip_escalating_cost(self, db_session, test_user, test_window):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)

        r1 = await submit_skip(db_session, test_user["user"].id, test_window.id, "SPY")
        r2 = await submit_skip(db_session, test_user["user"].id, test_window.id, "AAPL")
        assert r2["skip_cost"] > r1["skip_cost"]
        assert stats.skip_count_this_window == 2

    async def test_busted_skip_raises(self, db_session, test_user, test_window):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.is_busted = True
        await db_session.flush()

        with pytest.raises(BountyError, match="busted"):
            await submit_skip(db_session, test_user["user"].id, test_window.id, "SPY")
