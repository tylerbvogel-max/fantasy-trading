"""Unit tests for response formatter functions."""
import pytest
from unittest.mock import MagicMock
from decimal import Decimal

from app.services.bounty_service import (
    _pick_to_response,
    _window_to_response,
    _stats_to_response,
)

pytestmark = pytest.mark.unit


class TestPickToResponse:
    def test_basic_conversion(self):
        pred = MagicMock()
        pred.id = 1
        pred.prediction = "RISE"
        pred.confidence = 2
        pred.bet_amount = 31
        pred.is_correct = True
        pred.payout = 100
        pred.wanted_level_at_pick = 3
        pred.created_at = "2026-01-01T00:00:00"
        pred.action_type = "directional"
        pred.insurance_triggered = False
        pred.base_points = 50
        pred.wanted_multiplier_used = 4
        pred.leverage = 2.0
        pred.margin_call_triggered = False

        result = _pick_to_response(pred)
        assert result["prediction"] == "RISE"
        assert result["confidence"] == 2
        assert result["confidence_label"] == "Quick Draw"

    def test_none_confidence_uses_bet_to_tier(self):
        pred = MagicMock()
        pred.confidence = None
        pred.bet_amount = 70  # tier 3
        pred.id = 1
        pred.prediction = "FALL"
        pred.is_correct = False
        pred.payout = -50
        pred.wanted_level_at_pick = 1
        pred.created_at = None
        pred.action_type = "directional"
        pred.insurance_triggered = False
        pred.base_points = -50
        pred.wanted_multiplier_used = 1
        pred.leverage = 1.0
        pred.margin_call_triggered = False

        result = _pick_to_response(pred)
        assert result["confidence"] == 3
        assert result["confidence_label"] == "Dead Eye"


class TestWindowToResponse:
    def test_basic_conversion(self):
        window = MagicMock()
        window.id = "abc"
        window.window_date = "2026-01-01"
        window.window_index = 1
        window.start_time = "2026-01-01T10:00:00"
        window.end_time = "2026-01-01T12:00:00"
        window.spy_open_price = Decimal("450.50")
        window.spy_close_price = Decimal("451.25")
        window.result = "RISE"
        window.is_settled = True

        result = _window_to_response(window)
        assert result["spy_open_price"] == 450.50
        assert result["spy_close_price"] == 451.25

    def test_none_prices(self):
        window = MagicMock()
        window.id = "abc"
        window.window_date = "2026-01-01"
        window.window_index = 1
        window.start_time = "2026-01-01T10:00:00"
        window.end_time = "2026-01-01T12:00:00"
        window.spy_open_price = None
        window.spy_close_price = None
        window.result = None
        window.is_settled = False

        result = _window_to_response(window)
        assert result["spy_open_price"] is None
        assert result["spy_close_price"] is None


class TestStatsToResponse:
    def test_basic_conversion(self):
        stats = MagicMock()
        stats.double_dollars = 5000
        stats.wanted_level = 3
        stats.total_predictions = 100
        stats.correct_predictions = 55
        stats.best_streak = 5
        stats.notoriety = 1.5
        stats.chambers = 2
        stats.is_busted = False
        stats.bust_count = 1
        stats.margin_call_cooldown = 0
        stats.peak_dd = 8000
        stats.peak_wanted_level = 5
        stats.best_run_score = 15000
        stats.current_streak = 3
        stats.longest_streak = 7
        stats.streak_shield = False
        stats.active_title = "drifter"
        stats.lifetime_dd_earned = 50000
        stats.runs_completed = 5

        result = _stats_to_response(stats)
        assert result["accuracy_pct"] == 55.0
        assert result["double_dollars"] == 5000

    def test_zero_predictions_accuracy(self):
        stats = MagicMock()
        stats.total_predictions = 0
        stats.correct_predictions = 0
        stats.double_dollars = 5000
        stats.wanted_level = 1
        stats.best_streak = 0
        stats.notoriety = 0
        stats.chambers = 1
        stats.is_busted = False
        stats.bust_count = 0
        stats.margin_call_cooldown = 0
        stats.peak_dd = 5000
        stats.peak_wanted_level = 1
        stats.best_run_score = 0
        stats.current_streak = 0
        stats.longest_streak = 0
        stats.streak_shield = False
        stats.active_title = None
        stats.lifetime_dd_earned = 0
        stats.runs_completed = 0

        result = _stats_to_response(stats)
        assert result["accuracy_pct"] == 0.0
        assert result["active_title"] == "Drifter"
