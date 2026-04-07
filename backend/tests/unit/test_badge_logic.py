"""Unit tests for badge requirement checking and progress tracking."""
import json
import pytest
from unittest.mock import MagicMock

from app.services.bounty_service import (
    _badge_requirement_met,
    update_badge_progress,
    reset_run_badge_progress,
)

pytestmark = pytest.mark.unit


def _mock_stats(badge_progress=None, **kwargs):
    stats = MagicMock()
    stats.wanted_level = kwargs.get("wanted_level", 1)
    stats.peak_dd = kwargs.get("peak_dd", 5000)
    stats.chambers = kwargs.get("chambers", 1)
    stats.current_streak = kwargs.get("current_streak", 0)
    stats.double_dollars = kwargs.get("double_dollars", 5000)
    stats.badge_progress = json.dumps(badge_progress or {})
    return stats


class TestBadgeRequirementMet:
    def test_wanted_level_met(self):
        stats = _mock_stats(wanted_level=5)
        assert _badge_requirement_met({"type": "wanted_level", "value": 5}, stats, {}) is True
        assert _badge_requirement_met({"type": "wanted_level", "value": 6}, stats, {}) is False

    def test_peak_dd(self):
        stats = _mock_stats(peak_dd=10000)
        assert _badge_requirement_met({"type": "peak_dd", "value": 10000}, stats, {}) is True
        assert _badge_requirement_met({"type": "peak_dd", "value": 10001}, stats, {}) is False

    def test_chambers_full(self):
        stats = _mock_stats(chambers=6)
        assert _badge_requirement_met({"type": "chambers_full", "value": 6}, stats, {}) is True
        assert _badge_requirement_met({"type": "chambers_full", "value": 7}, stats, {}) is False

    def test_daily_streak(self):
        stats = _mock_stats(current_streak=7)
        assert _badge_requirement_met({"type": "daily_streak", "value": 7}, stats, {}) is True
        assert _badge_requirement_met({"type": "daily_streak", "value": 8}, stats, {}) is False

    def test_comeback(self):
        stats = _mock_stats(double_dollars=5000)
        progress = {"hit_low": True}
        assert _badge_requirement_met({"type": "comeback", "high": 5000}, stats, progress) is True
        assert _badge_requirement_met({"type": "comeback", "high": 5000}, stats, {}) is False

    def test_correct_streak(self):
        progress = {"current_correct_streak": 5}
        stats = _mock_stats()
        assert _badge_requirement_met({"type": "correct_streak", "value": 5}, stats, progress) is True
        assert _badge_requirement_met({"type": "correct_streak", "value": 6}, stats, progress) is False

    def test_progress_counter_types(self):
        progress = {"current_qd_streak": 3, "hold_wins_run": 10, "ghost_triggers_run": 2}
        stats = _mock_stats()
        assert _badge_requirement_met({"type": "qd_streak", "value": 3}, stats, progress) is True
        assert _badge_requirement_met({"type": "hold_wins_run", "value": 10}, stats, progress) is True
        assert _badge_requirement_met({"type": "ghost_triggers_run", "value": 3}, stats, progress) is False

    def test_unknown_type_returns_false(self):
        stats = _mock_stats()
        assert _badge_requirement_met({"type": "nonexistent", "value": 1}, stats, {}) is False
        assert isinstance(_badge_requirement_met({"type": "nonexistent", "value": 1}, stats, {}), bool)


class TestUpdateBadgeProgress:
    def test_correct_increments_streak(self):
        stats = _mock_stats()
        update_badge_progress(stats, pred_is_correct=True, confidence=1,
                              is_holster=False, ghost_triggered=False, was_skip=False)
        progress = json.loads(stats.badge_progress)
        assert progress["current_correct_streak"] == 1
        assert "current_qd_streak" not in progress or progress.get("current_qd_streak", 0) == 0

    def test_incorrect_resets_streak(self):
        stats = _mock_stats(badge_progress={"current_correct_streak": 5})
        update_badge_progress(stats, pred_is_correct=False, confidence=1,
                              is_holster=False, ghost_triggered=False, was_skip=False)
        progress = json.loads(stats.badge_progress)
        assert progress["current_correct_streak"] == 0
        assert isinstance(progress["current_correct_streak"], int)

    def test_qd_correct_increments_qd_streak(self):
        stats = _mock_stats()
        update_badge_progress(stats, pred_is_correct=True, confidence=2,
                              is_holster=False, ghost_triggered=False, was_skip=False)
        progress = json.loads(stats.badge_progress)
        assert progress["current_qd_streak"] == 1
        assert progress["current_correct_streak"] == 1

    def test_holster_win_increments_hold_counter(self):
        stats = _mock_stats()
        update_badge_progress(stats, pred_is_correct=True, confidence=1,
                              is_holster=True, ghost_triggered=False, was_skip=False)
        progress = json.loads(stats.badge_progress)
        assert progress["hold_wins_run"] == 1
        assert progress["current_correct_streak"] == 1

    def test_ghost_trigger_increments_counter(self):
        stats = _mock_stats()
        update_badge_progress(stats, pred_is_correct=True, confidence=1,
                              is_holster=False, ghost_triggered=True, was_skip=False)
        progress = json.loads(stats.badge_progress)
        assert progress["ghost_triggers_run"] == 1
        assert progress["current_correct_streak"] == 1

    def test_low_balance_sets_hit_low(self):
        stats = _mock_stats(double_dollars=400)
        update_badge_progress(stats, pred_is_correct=True, confidence=1,
                              is_holster=False, ghost_triggered=False, was_skip=False)
        progress = json.loads(stats.badge_progress)
        assert progress["hit_low"] is True
        assert progress["current_correct_streak"] == 1


class TestResetRunBadgeProgress:
    def test_resets_run_counters(self):
        stats = _mock_stats(badge_progress={
            "hold_wins_run": 5, "ghost_triggers_run": 2,
            "hit_low": True, "no_skip_rounds": 3,
            "current_correct_streak": 10,
        })
        reset_run_badge_progress(stats)
        progress = json.loads(stats.badge_progress)
        assert progress["hold_wins_run"] == 0
        assert progress["ghost_triggers_run"] == 0
        assert progress["hit_low"] is False
        assert progress["no_skip_rounds"] == 0

    def test_preserves_streak_counters(self):
        stats = _mock_stats(badge_progress={
            "current_correct_streak": 10, "current_qd_streak": 3,
            "hold_wins_run": 5,
        })
        reset_run_badge_progress(stats)
        progress = json.loads(stats.badge_progress)
        assert progress["current_correct_streak"] == 10
        assert progress["current_qd_streak"] == 3
