"""
Unit tests for scoring functions — SAFETY-CRITICAL (NPR-7150-SV-01).

These functions control the game economy: how many Double Dollars players
gain or lose per prediction, and how notoriety drives wanted level transitions.
Every test has ≥2 assertions (JPL Power of Ten).
"""
import pytest
from unittest.mock import MagicMock

from app.services.bounty_config import (
    DIR_SCORING,
    HOL_SCORING,
    MARGIN_CALL_PENALTY_DD,
    MARGIN_CALL_WANTED_DROP,
    MARGIN_CALL_COOLDOWN,
    LEVERAGE_NOTORIETY_BONUS_THRESHOLD,
    LEVERAGE_NOTORIETY_BONUS,
    HOLD_LEVERAGE_FACTOR,
)
from app.services.bounty_service import (
    _compute_base_points,
    _compute_notoriety_delta,
    _check_margin_call,
)

pytestmark = [pytest.mark.unit, pytest.mark.safety_critical]


def _default_fx():
    """Default iron effects dict (no irons equipped)."""
    return {
        "draw_win_bonus": 0,
        "all_lose_reduction": 0,
        "insurance_chance": 0.0,
        "ante_reduction": 0,
        "skip_discount": 0.0,
        "holster_win_bonus": 0,
        "qd_win_bonus": 0,
        "snake_oil": False,
        "de_insurance_chance": 0.0,
        "flat_cash_per_correct": 0,
        "notoriety_bonus": 0.0,
        "per_level_win_bonus": 0,
        "de_win_multiplier": 1,
        "ghost_chance": 0.0,
        "score_multiplier": 1.0,
        "leverage_cap_bonus": 0.0,
        "margin_call_reduction": 0.0,
        "carry_cost_discount": 0.0,
        "leverage_loss_shield": 0.0,
    }


def _mock_stats(wanted_level=1, double_dollars=5000):
    """Create a mock BountyPlayerStats with required fields."""
    stats = MagicMock()
    stats.wanted_level = wanted_level
    stats.double_dollars = double_dollars
    return stats


def _mock_pred(leverage=1.0, confidence=1, bet_amount=13, action_type="prediction"):
    """Create a mock BountyPrediction."""
    pred = MagicMock()
    pred.leverage = leverage
    pred.confidence = confidence
    pred.bet_amount = bet_amount
    pred.action_type = action_type
    pred.margin_call_triggered = False
    return pred


# ── _compute_base_points ──


class TestComputeBasePoints:
    """NPR-7150-SV-01: Base scoring computation."""

    def test_correct_directional_conf_1(self):
        """Correct Draw pick earns bet * leverage * multiplier."""
        fx = _default_fx()
        stats = _mock_stats(wanted_level=1)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == round(13 * 1.0 * 1)
        assert result > 0

    def test_correct_directional_conf_2_with_bonus(self):
        """Correct Quick Draw gets qd_win_bonus applied."""
        fx = _default_fx()
        fx["qd_win_bonus"] = 10
        stats = _mock_stats(wanted_level=1)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=31, conf=2, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == round(31 * 1.0 * 1) + 10 * 1
        assert result > 31

    def test_correct_directional_conf_3_de_multiplier(self):
        """Dead Eye correct directional gets de_win_multiplier applied."""
        fx = _default_fx()
        fx["de_win_multiplier"] = 1.5
        stats = _mock_stats(wanted_level=1)
        base_val = round(57 * 1.0 * 1)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=57, conf=3, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == round(base_val * 1.5)
        assert result > base_val

    def test_de_multiplier_not_applied_to_holster(self):
        """Dead Eye multiplier does NOT apply to holster picks."""
        fx = _default_fx()
        fx["de_win_multiplier"] = 2.0
        stats = _mock_stats(wanted_level=1)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=True,
            bet=35, conf=3, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        # Without DE multiplier: just bet * lev * mult
        assert result == round(35 * 1.0 * 1)
        assert result > 0

    def test_correct_holster_with_bonus(self):
        """Holster win gets holster_win_bonus."""
        fx = _default_fx()
        fx["holster_win_bonus"] = 5
        stats = _mock_stats(wanted_level=1)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=True,
            bet=8, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == round(8 * 1.0 * 1) + 5 * 1
        assert result > 8

    def test_insurance_triggered_returns_zero(self):
        """Insurance prevents all gain or loss."""
        fx = _default_fx()
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=True, is_holster=False,
            bet=57, conf=3, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == 0
        assert isinstance(result, int)

    def test_incorrect_base_loss(self):
        """Incorrect pick loses bet * leverage."""
        fx = _default_fx()
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == -13
        assert result < 0

    def test_incorrect_with_lose_reduction(self):
        """all_lose_reduction iron effect reduces loss."""
        fx = _default_fx()
        fx["all_lose_reduction"] = 5
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == -(13 - 5)
        assert result > -13

    def test_incorrect_lose_reduction_floors_at_zero(self):
        """Loss reduction can't make loss positive."""
        fx = _default_fx()
        fx["all_lose_reduction"] = 999
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == 0
        assert result >= 0

    def test_leverage_amplifies_win(self):
        """Leverage 3x triples the win value."""
        fx = _default_fx()
        stats = _mock_stats()
        no_lev = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        with_lev = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=3.0, fx=fx, stats=stats,
        )
        assert with_lev == round(13 * 3.0 * 1)
        assert with_lev > no_lev

    def test_leverage_amplifies_loss(self):
        """Leverage 3x triples the loss too."""
        fx = _default_fx()
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=3.0, fx=fx, stats=stats,
        )
        assert result == -round(13 * 3.0)
        assert result < -13

    def test_leverage_loss_shield(self):
        """leverage_loss_shield iron effect reduces leveraged loss."""
        fx = _default_fx()
        fx["leverage_loss_shield"] = 0.5
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=False,
            bet=20, conf=1, mult=1, eff_lev=3.0, fx=fx, stats=stats,
        )
        raw_loss = round(20 * 3.0)
        shielded = round(raw_loss * 0.5)
        assert result == -shielded
        assert abs(result) < raw_loss

    def test_snake_oil_holster_conf1_incorrect(self):
        """Snake oil: holster + conf=1 + incorrect = zero loss."""
        fx = _default_fx()
        fx["snake_oil"] = True
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=True,
            bet=8, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == 0
        assert isinstance(result, int)

    def test_snake_oil_not_applied_to_conf2(self):
        """Snake oil only works with conf=1 holster."""
        fx = _default_fx()
        fx["snake_oil"] = True
        stats = _mock_stats()
        result = _compute_base_points(
            is_correct=False, insurance_triggered=False, is_holster=True,
            bet=19, conf=2, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result < 0
        assert result == -19

    def test_wanted_multiplier_scales_win(self):
        """Higher wanted multiplier amplifies wins."""
        fx = _default_fx()
        stats = _mock_stats(wanted_level=5)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=18, eff_lev=1.0, fx=fx, stats=stats,
        )
        assert result == round(13 * 1.0 * 18)
        assert result > 13

    def test_per_level_win_bonus(self):
        """per_level_win_bonus scales with wanted_level."""
        fx = _default_fx()
        fx["per_level_win_bonus"] = 2
        stats = _mock_stats(wanted_level=5)
        result = _compute_base_points(
            is_correct=True, insurance_triggered=False, is_holster=False,
            bet=13, conf=1, mult=1, eff_lev=1.0, fx=fx, stats=stats,
        )
        # base (13) + per_level_bonus (2 * 5 * 1)
        assert result == 13 + 10
        assert result > 13


# ── _compute_notoriety_delta ──


class TestComputeNotorietyDelta:
    """NPR-7150-SV-02: Notoriety drives wanted level transitions."""

    def test_correct_positive(self):
        fx = _default_fx()
        delta = _compute_notoriety_delta(bet=33, is_correct=True, fx=fx, leverage=1.0)
        assert delta > 0
        assert delta == 1.0  # 33/33 * 1

    def test_incorrect_negative(self):
        fx = _default_fx()
        delta = _compute_notoriety_delta(bet=33, is_correct=False, fx=fx, leverage=1.0)
        assert delta < 0
        assert delta == -1.0

    def test_higher_bet_more_notoriety(self):
        fx = _default_fx()
        low = _compute_notoriety_delta(bet=13, is_correct=True, fx=fx, leverage=1.0)
        high = _compute_notoriety_delta(bet=57, is_correct=True, fx=fx, leverage=1.0)
        assert high > low
        assert low > 0

    def test_zero_bet_uses_weight_1(self):
        fx = _default_fx()
        delta = _compute_notoriety_delta(bet=0, is_correct=True, fx=fx, leverage=1.0)
        assert delta == 1.0
        assert delta > 0

    def test_notoriety_bonus_added_when_correct(self):
        fx = _default_fx()
        fx["notoriety_bonus"] = 0.5
        delta = _compute_notoriety_delta(bet=33, is_correct=True, fx=fx, leverage=1.0)
        assert delta == 1.0 + 0.5
        assert delta > 1.0

    def test_notoriety_bonus_not_added_when_incorrect(self):
        fx = _default_fx()
        fx["notoriety_bonus"] = 0.5
        delta = _compute_notoriety_delta(bet=33, is_correct=False, fx=fx, leverage=1.0)
        assert delta == -1.0
        assert delta < 0

    def test_leverage_bonus_when_correct_high_leverage(self):
        fx = _default_fx()
        delta = _compute_notoriety_delta(
            bet=33, is_correct=True, fx=fx,
            leverage=LEVERAGE_NOTORIETY_BONUS_THRESHOLD,
        )
        assert delta == 1.0 + LEVERAGE_NOTORIETY_BONUS
        assert delta > 1.0

    def test_leverage_bonus_not_applied_below_threshold(self):
        fx = _default_fx()
        delta = _compute_notoriety_delta(
            bet=33, is_correct=True, fx=fx,
            leverage=LEVERAGE_NOTORIETY_BONUS_THRESHOLD - 0.5,
        )
        assert delta == 1.0
        assert delta > 0

    def test_leverage_bonus_not_applied_when_incorrect(self):
        fx = _default_fx()
        delta = _compute_notoriety_delta(
            bet=33, is_correct=False, fx=fx,
            leverage=LEVERAGE_NOTORIETY_BONUS_THRESHOLD,
        )
        assert delta == -1.0
        assert delta < 0


# ── _check_margin_call ──


class TestCheckMarginCall:
    """NPR-7150-SV-03: Margin call triggers DD penalty and level drop."""

    def test_no_margin_call_when_correct(self):
        fx = _default_fx()
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=True, insurance_triggered=False,
                           is_holster=False, fx=fx, stats=stats)
        assert pred.margin_call_triggered is False
        assert stats.double_dollars == 5000

    def test_no_margin_call_when_insurance(self):
        fx = _default_fx()
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=True,
                           is_holster=False, fx=fx, stats=stats)
        assert pred.margin_call_triggered is False
        assert stats.double_dollars == 5000

    def test_no_margin_call_when_holster(self):
        fx = _default_fx()
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=False,
                           is_holster=True, fx=fx, stats=stats)
        assert pred.margin_call_triggered is False
        assert stats.double_dollars == 5000

    def test_no_margin_call_low_leverage(self):
        fx = _default_fx()
        pred = _mock_pred(leverage=2.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=False,
                           is_holster=False, fx=fx, stats=stats)
        assert pred.margin_call_triggered is False
        assert stats.double_dollars == 5000

    def test_margin_call_triggers_with_forced_random(self, monkeypatch):
        """Force random to always trigger margin call."""
        monkeypatch.setattr("app.services.bounty_service.random.random", lambda: 0.0)
        fx = _default_fx()
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=False,
                           is_holster=False, fx=fx, stats=stats)
        assert pred.margin_call_triggered is True
        assert stats.double_dollars == 5000 - MARGIN_CALL_PENALTY_DD

    def test_margin_call_drops_wanted_level(self, monkeypatch):
        monkeypatch.setattr("app.services.bounty_service.random.random", lambda: 0.0)
        fx = _default_fx()
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=False,
                           is_holster=False, fx=fx, stats=stats)
        assert stats.wanted_level == 5 - MARGIN_CALL_WANTED_DROP
        assert stats.margin_call_cooldown == MARGIN_CALL_COOLDOWN

    def test_margin_call_reduction_iron_effect(self, monkeypatch):
        """margin_call_reduction iron effect can prevent trigger."""
        # random returns 0.2 — above (0.30 - 0.30 = 0.0) so no trigger
        monkeypatch.setattr("app.services.bounty_service.random.random", lambda: 0.2)
        fx = _default_fx()
        fx["margin_call_reduction"] = 0.30
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=5, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=False,
                           is_holster=False, fx=fx, stats=stats)
        assert pred.margin_call_triggered is False
        assert stats.double_dollars == 5000

    def test_margin_call_level_floors_at_1(self, monkeypatch):
        """Wanted level can't drop below 1."""
        monkeypatch.setattr("app.services.bounty_service.random.random", lambda: 0.0)
        fx = _default_fx()
        pred = _mock_pred(leverage=5.0)
        stats = _mock_stats(wanted_level=1, double_dollars=5000)
        _check_margin_call(pred, is_correct=False, insurance_triggered=False,
                           is_holster=False, fx=fx, stats=stats)
        assert stats.wanted_level == 1
        assert pred.margin_call_triggered is True
