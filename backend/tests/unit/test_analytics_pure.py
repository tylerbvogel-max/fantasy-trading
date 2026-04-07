"""Unit tests for pure analytics functions."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

from app.services.bounty_service import (
    _win_rate_stat,
    _analytics_leverage_stats,
    _analytics_time_stats,
    _analytics_rolling_trend,
    _next_streak_milestone,
)

pytestmark = pytest.mark.unit

ET = ZoneInfo("America/New_York")


def _mock_pred(is_correct=True, leverage=1.0, created_at=None):
    p = MagicMock()
    p.is_correct = is_correct
    p.leverage = leverage
    p.created_at = created_at or datetime.now(timezone.utc)
    return p


class TestWinRateStat:
    def test_empty_list(self):
        result = _win_rate_stat([])
        assert result["total"] == 0
        assert result["win_rate"] == 0.0

    def test_all_correct(self):
        preds = [_mock_pred(is_correct=True) for _ in range(5)]
        result = _win_rate_stat(preds)
        assert result["total"] == 5
        assert result["win_rate"] == 100.0

    def test_all_incorrect(self):
        preds = [_mock_pred(is_correct=False) for _ in range(4)]
        result = _win_rate_stat(preds)
        assert result["correct"] == 0
        assert result["win_rate"] == 0.0

    def test_mixed(self):
        preds = [_mock_pred(is_correct=True), _mock_pred(is_correct=False)]
        result = _win_rate_stat(preds)
        assert result["total"] == 2
        assert result["win_rate"] == 50.0


class TestAnalyticsLeverageStats:
    def test_separates_leveraged(self):
        preds = [
            _mock_pred(leverage=3.0, is_correct=True),
            _mock_pred(leverage=1.0, is_correct=False),
        ]
        result = _analytics_leverage_stats(preds)
        assert result["with_leverage"]["total"] == 1
        assert result["without_leverage"]["total"] == 1

    def test_empty(self):
        result = _analytics_leverage_stats([])
        assert result["with_leverage"]["total"] == 0
        assert result["without_leverage"]["total"] == 0


class TestAnalyticsTimeStats:
    def test_buckets_by_2hour(self):
        # Create preds at 10:30 ET and 14:15 ET
        t1 = datetime(2026, 4, 1, 10, 30, tzinfo=ET).astimezone(timezone.utc)
        t2 = datetime(2026, 4, 1, 14, 15, tzinfo=ET).astimezone(timezone.utc)
        preds = [_mock_pred(created_at=t1), _mock_pred(created_at=t2)]
        result = _analytics_time_stats(preds)
        assert len(result) == 2
        labels = [r["time_slot"] for r in result]
        assert "10:00-12:00 ET" in labels
        assert "14:00-16:00 ET" in labels

    def test_empty(self):
        result = _analytics_time_stats([])
        assert result == []
        assert isinstance(result, list)


class TestAnalyticsRollingTrend:
    def test_groups_by_day(self):
        cutoff = datetime(2026, 4, 1, tzinfo=timezone.utc)
        t1 = datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 4, 2, 15, 0, tzinfo=timezone.utc)
        preds = [_mock_pred(created_at=t1), _mock_pred(created_at=t2, is_correct=False)]
        result = _analytics_rolling_trend(preds, cutoff)
        assert len(result) == 1
        assert result[0]["total"] == 2

    def test_excludes_before_cutoff(self):
        cutoff = datetime(2026, 4, 5, tzinfo=timezone.utc)
        old = _mock_pred(created_at=datetime(2026, 4, 1, tzinfo=timezone.utc))
        new = _mock_pred(created_at=datetime(2026, 4, 6, tzinfo=timezone.utc))
        result = _analytics_rolling_trend([old, new], cutoff)
        assert len(result) == 1
        assert result[0]["total"] == 1

    def test_empty(self):
        result = _analytics_rolling_trend([], datetime.now(timezone.utc))
        assert result == []
        assert isinstance(result, list)


class TestNextStreakMilestone:
    def test_streak_0_returns_day_3(self):
        result = _next_streak_milestone(0)
        assert result is not None
        assert result["day"] == 3

    def test_streak_3_returns_day_5(self):
        result = _next_streak_milestone(3)
        assert result is not None
        assert result["day"] == 5

    def test_streak_30_returns_none(self):
        result = _next_streak_milestone(30)
        assert result is None
        assert not isinstance(result, dict)

    def test_streak_between_milestones(self):
        result = _next_streak_milestone(6)
        assert result is not None
        assert result["day"] == 7
