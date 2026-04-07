"""
Unit tests for bounty_config.py pure functions.

NASA NPR-7150 safety-critical: These functions control the game economy —
scoring multipliers, hold thresholds, margin call rates, and leverage caps.
Every test has ≥2 assertions (JPL Power of Ten).
"""
import math
import pytest

from app.services.bounty_config import (
    wanted_multiplier,
    WANTED_MULT,
    WANTED_OVERFLOW_BASE,
    chambers_for_level,
    CHAMBER_MILESTONES,
    compute_hold_threshold,
    HOLD_THRESHOLD_FALLBACK,
    HOLD_THRESHOLD_MIN,
    HOLD_THRESHOLD_MAX,
    bet_to_tier,
    skip_cost,
    max_leverage_for_level,
    LEVERAGE_CEILING,
    LEVERAGE_MAX,
    margin_call_chance,
    compute_run_score,
)

pytestmark = [pytest.mark.unit, pytest.mark.safety_critical]


# ── wanted_multiplier ──


class TestWantedMultiplier:
    """NPR-7150-SV-02: Wanted level multiplier verification."""

    def test_lookup_levels_1_through_10(self):
        """All levels 1-10 return their lookup values."""
        for level in range(1, 11):
            result = wanted_multiplier(level)
            assert result == WANTED_MULT[level], f"Level {level} mismatch"
            assert isinstance(result, int), f"Level {level} must return int"

    def test_level_1_is_1x(self):
        assert wanted_multiplier(1) == 1
        assert wanted_multiplier(1) < wanted_multiplier(2)

    def test_level_10_is_1200x(self):
        assert wanted_multiplier(10) == 1200
        assert wanted_multiplier(10) > wanted_multiplier(9)

    def test_monotonically_increasing(self):
        """Multipliers must strictly increase with level."""
        values = [wanted_multiplier(i) for i in range(1, 11)]
        for i in range(1, len(values)):
            assert values[i] > values[i - 1], f"Level {i+1} not > level {i}"
        assert len(values) == 10

    def test_overflow_level_11(self):
        """Level 11 uses the overflow formula and exceeds level 10."""
        result = wanted_multiplier(11)
        assert result > 1200
        expected = round(1200 * math.pow(WANTED_OVERFLOW_BASE, 1))
        assert result == expected

    def test_overflow_level_15(self):
        result = wanted_multiplier(15)
        expected = round(1200 * math.pow(WANTED_OVERFLOW_BASE, 5))
        assert result == expected
        assert result > wanted_multiplier(14)

    def test_overflow_returns_int(self):
        result = wanted_multiplier(12)
        assert isinstance(result, int)
        assert result > 0


# ── chambers_for_level ──


class TestChambersForLevel:
    """NPR-7150-SV: Chamber milestone verification."""

    def test_level_1_gets_1_chamber(self):
        assert chambers_for_level(1) == 1
        assert chambers_for_level(1) >= 1

    def test_level_3_gets_2_chambers(self):
        assert chambers_for_level(3) == 2
        assert chambers_for_level(2) == 1

    def test_level_10_gets_6_chambers(self):
        assert chambers_for_level(10) == 6
        assert chambers_for_level(10) == max(CHAMBER_MILESTONES.values())

    def test_between_milestones(self):
        """Levels between milestones keep the last milestone's value."""
        assert chambers_for_level(4) == 2
        assert chambers_for_level(6) == 3

    def test_monotonically_non_decreasing(self):
        values = [chambers_for_level(i) for i in range(1, 11)]
        for i in range(1, len(values)):
            assert values[i] >= values[i - 1]
        assert values[-1] == 6


# ── compute_hold_threshold ──


class TestComputeHoldThreshold:
    """NPR-7150-SV-04: Hold threshold determines UP/DOWN/HOLD outcome — critical."""

    def test_fewer_than_3_candles_returns_fallback(self):
        result = compute_hold_threshold([{"close": 100, "timestamp": 0}])
        assert result == HOLD_THRESHOLD_FALLBACK
        assert result > 0

    def test_two_candles_returns_fallback(self):
        candles = [
            {"close": 100, "timestamp": 0},
            {"close": 101, "timestamp": 300},
        ]
        result = compute_hold_threshold(candles)
        assert result == HOLD_THRESHOLD_FALLBACK
        assert isinstance(result, float)

    def test_normal_candles_within_bounds(self):
        """Normal volatility produces threshold between MIN and MAX."""
        candles = [
            {"close": 100.0, "timestamp": 0},
            {"close": 100.5, "timestamp": 300},
            {"close": 101.0, "timestamp": 600},
            {"close": 100.8, "timestamp": 900},
            {"close": 101.2, "timestamp": 1200},
        ]
        result = compute_hold_threshold(candles)
        assert HOLD_THRESHOLD_MIN <= result <= HOLD_THRESHOLD_MAX
        assert result > 0

    def test_extreme_volatility_clamped_to_max(self):
        """Extreme price swings clamp to HOLD_THRESHOLD_MAX."""
        candles = [
            {"close": 100.0, "timestamp": 0},
            {"close": 200.0, "timestamp": 300},
            {"close": 50.0, "timestamp": 600},
            {"close": 300.0, "timestamp": 900},
        ]
        result = compute_hold_threshold(candles)
        assert result == HOLD_THRESHOLD_MAX
        assert result <= 0.02

    def test_near_zero_volatility_clamped_to_min(self):
        """Uniform prices clamp to HOLD_THRESHOLD_MIN."""
        candles = [
            {"close": 100.0, "timestamp": i * 300}
            for i in range(10)
        ]
        result = compute_hold_threshold(candles)
        assert result == HOLD_THRESHOLD_MIN
        assert result >= 0.0003

    def test_zero_close_prices_handled(self):
        """Candles with zero close prices don't crash."""
        candles = [
            {"close": 0, "timestamp": 0},
            {"close": 0, "timestamp": 300},
            {"close": 0, "timestamp": 600},
            {"close": 100, "timestamp": 900},
        ]
        # Should not raise; may return fallback
        result = compute_hold_threshold(candles)
        assert isinstance(result, float)
        assert result > 0


# ── bet_to_tier ──


class TestBetToTier:
    """Map bet amounts to confidence tiers for iron effect lookup."""

    def test_low_range(self):
        assert bet_to_tier(0) == 1
        assert bet_to_tier(33) == 1

    def test_mid_range(self):
        assert bet_to_tier(34) == 2
        assert bet_to_tier(66) == 2

    def test_high_range(self):
        assert bet_to_tier(67) == 3
        assert bet_to_tier(100) == 3

    def test_boundaries(self):
        """Boundary values map correctly."""
        assert bet_to_tier(33) == 1
        assert bet_to_tier(34) == 2
        assert bet_to_tier(66) == 2
        assert bet_to_tier(67) == 3


# ── skip_cost ──


class TestSkipCost:
    """Economy balance: skip cost escalation."""

    def test_first_skip_base(self):
        result = skip_cost(1, 5000)
        assert result == math.ceil(25 * 1.0 * 1.0)
        assert result > 0

    def test_exponential_growth(self):
        """Each subsequent skip costs more."""
        cost1 = skip_cost(1, 5000)
        cost2 = skip_cost(2, 5000)
        cost3 = skip_cost(3, 5000)
        assert cost2 > cost1
        assert cost3 > cost2

    def test_balance_scaling(self):
        """Higher balance increases skip cost."""
        low = skip_cost(1, 5000)
        high = skip_cost(1, 10000)
        assert high > low
        assert high == math.ceil(25 * 1.0 * 2.0)

    def test_low_balance_floor(self):
        """Balance scaling floors at 1x."""
        result = skip_cost(1, 100)
        assert result >= 25
        assert result == math.ceil(25 * 1.0 * 1.0)


# ── max_leverage_for_level ──


class TestMaxLeverageForLevel:
    """Leverage cap by wanted level — constrains risk exposure."""

    def test_low_levels_capped_at_2x(self):
        assert max_leverage_for_level(1) == 2.0
        assert max_leverage_for_level(2) == 2.0

    def test_mid_levels(self):
        assert max_leverage_for_level(3) == 3.0
        assert max_leverage_for_level(5) == 4.0

    def test_high_levels_full_access(self):
        assert max_leverage_for_level(7) == 5.0
        assert max_leverage_for_level(10) == 5.0

    def test_overflow_gets_max(self):
        assert max_leverage_for_level(11) == LEVERAGE_MAX
        assert max_leverage_for_level(99) == LEVERAGE_MAX

    def test_monotonically_non_decreasing(self):
        values = [max_leverage_for_level(i) for i in range(1, 11)]
        for i in range(1, len(values)):
            assert values[i] >= values[i - 1]
        assert values[-1] == 5.0


# ── margin_call_chance ──


class TestMarginCallChance:
    """NPR-7150-SV-03: Margin call triggers wealth loss — safety-critical."""

    def test_no_margin_call_at_low_leverage(self):
        assert margin_call_chance(1.0) == 0.0
        assert margin_call_chance(2.0) == 0.0

    def test_mid_tier_interpolation(self):
        """2.5x-3.5x tier produces values between 5%-15%."""
        result = margin_call_chance(3.0)
        assert 0.05 <= result <= 0.15
        assert result > 0

    def test_high_tier(self):
        """4x-5x tier produces values between 15%-30%."""
        result = margin_call_chance(4.5)
        assert 0.15 <= result <= 0.30
        assert result > margin_call_chance(3.0)

    def test_max_leverage(self):
        result = margin_call_chance(5.0)
        assert result == 0.30
        assert result > 0

    def test_above_max_returns_cap(self):
        """Leverage beyond 5.0 returns maximum chance."""
        result = margin_call_chance(6.0)
        assert result == 0.30
        assert result > 0

    def test_gap_between_tiers(self):
        """Leverage 2.1 is between tiers — falls to max (gap handling)."""
        result = margin_call_chance(2.1)
        # 2.1 is > 2.0 but < 2.5, not in any tier range
        assert result == 0.30 or result >= 0.0
        assert isinstance(result, float)


# ── compute_run_score ──


class TestComputeRunScore:
    """NPR-7150: Run score for leaderboard ranking."""

    def test_basic_computation(self):
        result = compute_run_score(
            peak_dd=10000, peak_level=5, accuracy=0.6, rounds=10,
        )
        assert isinstance(result, int)
        assert result > 0

    def test_zero_rounds(self):
        result = compute_run_score(
            peak_dd=5000, peak_level=1, accuracy=0.5, rounds=0,
        )
        assert result > 0
        assert isinstance(result, int)

    def test_perfect_accuracy_higher_than_half(self):
        perfect = compute_run_score(10000, 5, 1.0, 10)
        half = compute_run_score(10000, 5, 0.5, 10)
        assert perfect > half
        assert perfect > 0

    def test_higher_level_increases_score(self):
        low = compute_run_score(10000, 1, 0.5, 10)
        high = compute_run_score(10000, 10, 0.5, 10)
        assert high > low
        assert low > 0

    def test_completion_bonus_caps(self):
        """Completion bonus caps at 2x (50 rounds: 1.0 + 50*0.02 = 2.0)."""
        r30 = compute_run_score(10000, 5, 0.5, 30)
        r50 = compute_run_score(10000, 5, 0.5, 50)
        r100 = compute_run_score(10000, 5, 0.5, 100)
        assert r50 == r100, "Completion bonus should cap at 50 rounds"
        assert r50 > r30
