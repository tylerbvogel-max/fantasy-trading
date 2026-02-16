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
# Price change < 0.05% is considered "flat" (HOLD wins)
HOLD_THRESHOLD = 0.0005

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
    },
    {
        "id": "thick_skin", "name": "Thick Skin", "rarity": "common",
        "description": "-3 all losses",
        "effects": {"all_lose_reduction": 3},
    },
    {
        "id": "lucky_horseshoe", "name": "Lucky Horseshoe", "rarity": "common",
        "description": "5% insurance chance",
        "effects": {"insurance_chance": 0.05},
    },
    {
        "id": "trail_rations", "name": "Trail Rations", "rarity": "common",
        "description": "-$20 ante",
        "effects": {"ante_reduction": 20},
    },
    {
        "id": "bandolier", "name": "Bandolier", "rarity": "common",
        "description": "-30% skip cost",
        "effects": {"skip_discount": 0.30},
    },
    {
        "id": "leather_holster", "name": "Leather Holster", "rarity": "common",
        "description": "+4 holster wins",
        "effects": {"holster_win_bonus": 4},
    },
    # Uncommon
    {
        "id": "iron_sights", "name": "Iron Sights", "rarity": "uncommon",
        "description": "+5 Quick Draw wins",
        "effects": {"qd_win_bonus": 5},
    },
    {
        "id": "snake_oil", "name": "Snake Oil", "rarity": "uncommon",
        "description": "Draw holster losses = 0",
        "effects": {"snake_oil": True},
    },
    {
        "id": "deadeye_scope", "name": "Deadeye Scope", "rarity": "uncommon",
        "description": "10% Dead Eye insurance",
        "effects": {"de_insurance_chance": 0.10},
    },
    {
        "id": "gold_tooth", "name": "Gold Tooth", "rarity": "uncommon",
        "description": "+$50 flat per correct",
        "effects": {"flat_cash_per_correct": 50},
    },
    {
        "id": "bounty_poster", "name": "Bounty Poster", "rarity": "uncommon",
        "description": "+0.5 notoriety per correct",
        "effects": {"notoriety_bonus": 0.5},
    },
    # Rare
    {
        "id": "sheriffs_badge", "name": "Sheriff's Badge", "rarity": "rare",
        "description": "+1 wins per wanted level",
        "effects": {"per_level_win_bonus": 1},
    },
    {
        "id": "double_barrel", "name": "Double Barrel", "rarity": "rare",
        "description": "Dead Eye wins 2x base",
        "effects": {"de_win_multiplier": 2},
    },
    {
        "id": "ghost_rider", "name": "Ghost Rider", "rarity": "rare",
        "description": "20% miss becomes correct",
        "effects": {"ghost_chance": 0.20},
    },
    {
        "id": "golden_revolver", "name": "Golden Revolver", "rarity": "rare",
        "description": "All scoring x1.5",
        "effects": {"score_multiplier": 1.5},
    },
]

IRON_DEFS_BY_ID = {iron["id"]: iron for iron in IRON_DEFS}

# Rarity weights for offering rolls
RARITY_WEIGHTS = {"common": 50, "uncommon": 35, "rare": 15}
