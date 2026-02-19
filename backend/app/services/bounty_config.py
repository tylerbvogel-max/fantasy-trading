"""Bounty Hunter game constants — mirrors tools/bounty-sim/config.mjs + irons.mjs."""

import math

# ── Scoring tables ──
# Directional picks (UP/DOWN): { confidence: { "win": pts, "lose": pts } }
DIR_SCORING = {
    1: {"win": 13, "lose": 11},
    2: {"win": 31, "lose": 28},
    3: {"win": 57, "lose": 70},
}

# Holster picks (HOLD): { confidence: { "win": pts, "lose": pts } }
HOL_SCORING = {
    1: {"win": 8, "lose": 6},
    2: {"win": 19, "lose": 15},
    3: {"win": 35, "lose": 30},
}

# ── Wanted level multiplier table ──
WANTED_MULT = {
    1: 1, 2: 2, 3: 4, 4: 8, 5: 18,
    6: 42, 7: 100, 8: 230, 9: 530, 10: 1200,
}
WANTED_OVERFLOW_BASE = 2.3

WANTED_LEVEL_CAP = 10


def wanted_multiplier(level: int) -> int:
    if level in WANTED_MULT:
        return WANTED_MULT[level]
    return round(WANTED_MULT[10] * math.pow(WANTED_OVERFLOW_BASE, level - 10))


# ── Notoriety ──
NOTORIETY_WEIGHT = {1: 1.0, 2: 1.5, 3: 2.0}
NOTORIETY_UP_THRESHOLD = 3.0
NOTORIETY_DOWN_THRESHOLD = -2.0

# ── Ante ──
ANTE_BASE = 75

# ── Starting values ──
STARTING_DOUBLE_DOLLARS = 5000
STARTING_CHAMBERS = 1
MAX_CHAMBERS = 6

# Wanted level → max chambers unlocked (high-water mark)
CHAMBER_MILESTONES = {1: 1, 3: 2, 5: 3, 7: 4, 9: 5, 10: 6}


def chambers_for_level(level: int) -> int:
    """Return the max chambers earned at a given wanted level."""
    result = 1
    for milestone, chambers in CHAMBER_MILESTONES.items():
        if level >= milestone:
            result = max(result, chambers)
    return result

# ── Hold threshold ──
# Dynamic: Φ⁻¹(2/3) ≈ 0.4307 × σ_window targets ~1/3 probability per outcome
HOLD_THRESHOLD_FALLBACK = 0.0005  # used when candle data unavailable
HOLD_THRESHOLD_MIN = 0.0003
HOLD_THRESHOLD_MAX = 0.02
PHI_INV_TWO_THIRDS = 0.4307


def compute_hold_threshold(candles: list[dict]) -> float:
    """Derive a per-stock hold threshold from candle volatility.

    candles: list of {"timestamp": int, "close": float}
    Returns fractional threshold (e.g. 0.005 = 0.5%).
    """
    if len(candles) < 3:
        return HOLD_THRESHOLD_FALLBACK

    # Per-candle log-return σ
    log_returns = []
    for i in range(1, len(candles)):
        prev, curr = candles[i - 1]["close"], candles[i]["close"]
        if prev and curr and prev > 0 and curr > 0:
            log_returns.append(math.log(curr / prev))
    if len(log_returns) < 2:
        return HOLD_THRESHOLD_FALLBACK

    mean = sum(log_returns) / len(log_returns)
    variance = sum((r - mean) ** 2 for r in log_returns) / len(log_returns)
    sigma_candle = math.sqrt(variance)

    # Scale to 1-hour window: estimate candle interval, project forward
    total_seconds = candles[-1]["timestamp"] - candles[0]["timestamp"]
    avg_interval = total_seconds / (len(candles) - 1) if len(candles) > 1 else 300
    window_seconds = 3600  # 1-hour prediction window
    window_candles = max(1, window_seconds / avg_interval)
    sigma_window = sigma_candle * math.sqrt(window_candles)

    threshold = PHI_INV_TWO_THIRDS * sigma_window
    return max(HOLD_THRESHOLD_MIN, min(HOLD_THRESHOLD_MAX, threshold))

# ── Bet amount → pseudo-tier mapping (for iron effects) ──
def bet_to_tier(bet_amount: int) -> int:
    """Map bet amount 0-100 to pseudo-tier 1/2/3 for iron effect lookup."""
    if bet_amount <= 33:
        return 1
    elif bet_amount <= 66:
        return 2
    else:
        return 3

# ── Confidence labels ──
CONFIDENCE_LABELS = {1: "Draw", 2: "Quick Draw", 3: "Dead Eye"}


def skip_cost(n: int, balance: int) -> int:
    """Cost of the nth skip in a window. Scales with balance."""
    return math.ceil(25 * math.pow(2.5, n - 1) * max(1, balance / 5000))


# ── Iron definitions ──
IRON_DEFS = [
    # Common
    {
        "id": "steady_hand", "name": "Steady Hand", "rarity": "common",
        "description": "+3 Draw wins",
        "effects": {"draw_win_bonus": 3},
        "boost_description": "+6 Draw wins, -2 all losses",
        "boost_effects": {"draw_win_bonus": 6, "all_lose_reduction": 2},
    },
    {
        "id": "thick_skin", "name": "Thick Skin", "rarity": "common",
        "description": "-3 all losses",
        "effects": {"all_lose_reduction": 3},
        "boost_description": "-5 all losses, +2 holster wins",
        "boost_effects": {"all_lose_reduction": 5, "holster_win_bonus": 2},
    },
    {
        "id": "lucky_horseshoe", "name": "Lucky Horseshoe", "rarity": "common",
        "description": "5% insurance chance",
        "effects": {"insurance_chance": 0.05},
        "boost_description": "+10% insurance, 5% ghost",
        "boost_effects": {"insurance_chance": 0.10, "ghost_chance": 0.05},
    },
    {
        "id": "trail_rations", "name": "Trail Rations", "rarity": "common",
        "description": "-$20 ante",
        "effects": {"ante_reduction": 20},
        "boost_description": "-$35 ante",
        "boost_effects": {"ante_reduction": 35},
    },
    {
        "id": "bandolier", "name": "Bandolier", "rarity": "common",
        "description": "-30% skip cost",
        "effects": {"skip_discount": 0.30},
        "boost_description": "-40% skip, +$25/correct",
        "boost_effects": {"skip_discount": 0.40, "flat_cash_per_correct": 25},
    },
    {
        "id": "leather_holster", "name": "Leather Holster", "rarity": "common",
        "description": "+4 holster wins",
        "effects": {"holster_win_bonus": 4},
        "boost_description": "+8 holster wins, Draw holster losses=0",
        "boost_effects": {"holster_win_bonus": 8, "snake_oil": True},
    },
    # Uncommon
    {
        "id": "iron_sights", "name": "Iron Sights", "rarity": "uncommon",
        "description": "+5 Quick Draw wins",
        "effects": {"qd_win_bonus": 5},
        "boost_description": "+10 QD wins, 5% DE insurance",
        "boost_effects": {"qd_win_bonus": 10, "de_insurance_chance": 0.05},
    },
    {
        "id": "snake_oil", "name": "Snake Oil", "rarity": "uncommon",
        "description": "Draw holster losses = 0",
        "effects": {"snake_oil": True},
        "boost_description": "-5 all losses, +3 holster wins",
        "boost_effects": {"all_lose_reduction": 5, "holster_win_bonus": 3},
    },
    {
        "id": "deadeye_scope", "name": "Deadeye Scope", "rarity": "uncommon",
        "description": "10% Dead Eye insurance",
        "effects": {"de_insurance_chance": 0.10},
        "boost_description": "+15% DE insurance, DE wins x1.5",
        "boost_effects": {"de_insurance_chance": 0.15, "de_win_multiplier": 1.5},
    },
    {
        "id": "gold_tooth", "name": "Gold Tooth", "rarity": "uncommon",
        "description": "+$50 flat per correct",
        "effects": {"flat_cash_per_correct": 50},
        "boost_description": "+$100/correct, +0.3 notoriety",
        "boost_effects": {"flat_cash_per_correct": 100, "notoriety_bonus": 0.3},
    },
    {
        "id": "bounty_poster", "name": "Bounty Poster", "rarity": "uncommon",
        "description": "+0.5 notoriety per correct",
        "effects": {"notoriety_bonus": 0.5},
        "boost_description": "+1.0 notoriety, +0.5 wins/level",
        "boost_effects": {"notoriety_bonus": 1.0, "per_level_win_bonus": 0.5},
    },
    # Rare
    {
        "id": "sheriffs_badge", "name": "Sheriff's Badge", "rarity": "rare",
        "description": "+1 wins per wanted level",
        "effects": {"per_level_win_bonus": 1},
        "boost_description": "+2 wins/level, -2 all losses",
        "boost_effects": {"per_level_win_bonus": 2, "all_lose_reduction": 2},
    },
    {
        "id": "double_barrel", "name": "Double Barrel", "rarity": "rare",
        "description": "Dead Eye wins 2x base",
        "effects": {"de_win_multiplier": 2},
        "boost_description": "DE wins x1.5 more, all scoring x1.2",
        "boost_effects": {"de_win_multiplier": 1.5, "score_multiplier": 1.2},
    },
    {
        "id": "ghost_rider", "name": "Ghost Rider", "rarity": "rare",
        "description": "20% miss becomes correct",
        "effects": {"ghost_chance": 0.20},
        "boost_description": "+15% ghost, +$75/correct",
        "boost_effects": {"ghost_chance": 0.15, "flat_cash_per_correct": 75},
    },
    {
        "id": "golden_revolver", "name": "Golden Revolver", "rarity": "rare",
        "description": "All scoring x1.5",
        "effects": {"score_multiplier": 1.5},
        "boost_description": "All scoring x1.3 more, +$50/correct",
        "boost_effects": {"score_multiplier": 1.3, "flat_cash_per_correct": 50},
    },
]

IRON_DEFS_BY_ID = {iron["id"]: iron for iron in IRON_DEFS}

# Rarity weights for offering rolls
RARITY_WEIGHTS = {"common": 50, "uncommon": 35, "rare": 15}
