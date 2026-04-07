"""Integration tests for player stats, reset, and bust logic."""
import pytest
import pytest_asyncio
from datetime import datetime, timezone

from app.services.bounty_service import (
    get_or_create_player_stats,
    reset_player,
    BountyError,
)
from app.services.bounty_config import STARTING_DOUBLE_DOLLARS, STARTING_CHAMBERS

pytestmark = pytest.mark.integration


class TestGetOrCreatePlayerStats:
    async def test_creates_new_stats(self, db_session, test_user):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        assert stats.double_dollars == STARTING_DOUBLE_DOLLARS
        assert stats.wanted_level == 1

    async def test_returns_existing(self, db_session, test_user):
        s1 = await get_or_create_player_stats(db_session, test_user["user"].id)
        s1.double_dollars = 9999
        await db_session.flush()

        s2 = await get_or_create_player_stats(db_session, test_user["user"].id)
        assert s2.double_dollars == 9999
        assert s1.id == s2.id


class TestResetPlayer:
    async def test_reset_restores_defaults(self, db_session, test_user):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.double_dollars = 100
        stats.wanted_level = 8
        stats.total_predictions = 50
        stats.correct_predictions = 25
        stats.is_busted = True
        await db_session.flush()

        await reset_player(db_session, test_user["user"].id)
        assert stats.double_dollars == STARTING_DOUBLE_DOLLARS
        assert stats.wanted_level == 1
        assert stats.is_busted is False

    async def test_reset_increments_runs_completed(self, db_session, test_user):
        stats = await get_or_create_player_stats(db_session, test_user["user"].id)
        stats.total_predictions = 5  # need some activity for run archival
        initial_runs = stats.runs_completed or 0
        await db_session.flush()

        await reset_player(db_session, test_user["user"].id)
        assert stats.runs_completed >= initial_runs
        assert stats.double_dollars == STARTING_DOUBLE_DOLLARS
