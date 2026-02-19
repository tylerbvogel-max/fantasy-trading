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


# ── Iron definitions (75 total — mirrors tools/bounty-sim/irons.mjs) ──
IRON_DEFS = [
    # ── Common (28) ──
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
        "description": "+5% accuracy",
        "effects": {"accuracy_bonus": 0.05},
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
    {
        "id": "tin_star", "name": "Tin Star", "rarity": "common",
        "description": "+2 directional wins",
        "effects": {"dir_win_bonus": 2},
    },
    {
        "id": "pocket_watch", "name": "Pocket Watch", "rarity": "common",
        "description": "+3 QD wins",
        "effects": {"qd_win_bonus": 3},
    },
    {
        "id": "canteen", "name": "Canteen", "rarity": "common",
        "description": "+$30/round income",
        "effects": {"round_income": 30},
    },
    {
        "id": "worn_boots", "name": "Worn Boots", "rarity": "common",
        "description": "+1 win per round survived",
        "effects": {"worn_boots_per_round": 1},
    },
    {
        "id": "rusty_spurs", "name": "Rusty Spurs", "rarity": "common",
        "description": "+8 wins at wanted \u22642",
        "effects": {"low_level_win_bonus": 8},
    },
    {
        "id": "campfire", "name": "Campfire", "rarity": "common",
        "description": "-2 holster losses",
        "effects": {"holster_lose_reduction": 2},
    },
    {
        "id": "whiskey_flask", "name": "Whiskey Flask", "rarity": "common",
        "description": "+6 wins on 1st pick/round",
        "effects": {"first_pick_win_bonus": 6},
    },
    {
        "id": "rope_lasso", "name": "Rope Lasso", "rarity": "common",
        "description": "+8% holster accuracy",
        "effects": {"holster_accuracy_bonus": 0.08},
    },
    {
        "id": "chaps", "name": "Chaps", "rarity": "common",
        "description": "-1 directional losses",
        "effects": {"dir_lose_reduction": 1},
    },
    {
        "id": "six_shooter", "name": "Six-Shooter", "rarity": "common",
        "description": "Every 6th correct: +$150",
        "effects": {"six_shooter_interval": 6, "six_shooter_bonus": 150},
    },
    {
        "id": "cowbell", "name": "Cowbell", "rarity": "common",
        "description": "+0.5 notoriety/round",
        "effects": {"flat_notoriety_per_round": 0.5},
    },
    {
        "id": "hay_bale", "name": "Hay Bale", "rarity": "common",
        "description": "+$40 on correct holster",
        "effects": {"holster_correct_bonus": 40},
    },
    {
        "id": "branding_iron", "name": "Branding Iron", "rarity": "common",
        "description": "+4 RISE wins",
        "effects": {"rise_win_bonus": 4},
    },
    {
        "id": "cattle_prod", "name": "Cattle Prod", "rarity": "common",
        "description": "+4 FALL wins",
        "effects": {"fall_win_bonus": 4},
    },
    {
        "id": "scouts_compass", "name": "Scout's Compass", "rarity": "common",
        "description": "+5% acc on 1st pick/round",
        "effects": {"first_pick_accuracy_bonus": 0.05},
    },
    {
        "id": "rattlesnake_skin", "name": "Rattlesnake Skin", "rarity": "common",
        "description": "-20% skip cost",
        "effects": {"skip_discount": 0.20},
    },
    {
        "id": "saddlebag", "name": "Saddlebag", "rarity": "common",
        "description": "+$15 flat per pick",
        "effects": {"flat_per_pick": 15},
    },
    {
        "id": "dust_devil", "name": "Dust Devil", "rarity": "common",
        "description": "+5 wins after a skip",
        "effects": {"post_skip_win_bonus": 5},
    },
    {
        "id": "water_trough", "name": "Water Trough", "rarity": "common",
        "description": "Losses halved if bal <$2k",
        "effects": {"low_balance_loss_halved": True},
    },
    {
        "id": "copper_ring", "name": "Copper Ring", "rarity": "common",
        "description": "+0.5 notor/correct dir",
        "effects": {"dir_notoriety_bonus": 0.5},
    },
    {
        "id": "horseshoe_nail", "name": "Horseshoe Nail", "rarity": "common",
        "description": "+2% acc per iron equipped",
        "effects": {"accuracy_per_iron": 0.02},
    },
    {
        "id": "tenderfoot", "name": "Tenderfoot", "rarity": "common",
        "description": "+5 wins when round acc <50%",
        "effects": {"low_accuracy_win_bonus": 5},
    },

    # ── Uncommon (22) ──
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
        "description": "+10% DE accuracy",
        "effects": {"de_accuracy_bonus": 0.10},
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
    {
        "id": "silver_bullet", "name": "Silver Bullet", "rarity": "uncommon",
        "description": "+10 wins at wanted \u22655",
        "effects": {"high_level_win_bonus": 10},
    },
    {
        "id": "saloon_door", "name": "Saloon Door", "rarity": "uncommon",
        "description": "1st bust/run: survive w/$500",
        "effects": {"saloon_door": True},
    },
    {
        "id": "fools_gold", "name": "Fool's Gold", "rarity": "uncommon",
        "description": "+$150/round, ante +$25",
        "effects": {"fools_gold_income": 150, "ante_penalty": 25},
    },
    {
        "id": "war_paint", "name": "War Paint", "rarity": "uncommon",
        "description": "+6 wins when notor negative",
        "effects": {"neg_notoriety_win_bonus": 6},
    },
    {
        "id": "smoke_bomb", "name": "Smoke Bomb", "rarity": "uncommon",
        "description": "1st loss/round halved",
        "effects": {"smoke_bomb": True},
    },
    {
        "id": "panning_kit", "name": "Panning Kit", "rarity": "uncommon",
        "description": "+$20/round per iron equipped",
        "effects": {"income_per_iron": 20},
    },
    {
        "id": "horse_thief", "name": "Horse Thief", "rarity": "uncommon",
        "description": "Recover 15% of ante",
        "effects": {"ante_recovery_pct": 0.15},
    },
    {
        "id": "moonshine", "name": "Moonshine", "rarity": "uncommon",
        "description": "Wins +40%, losses +20%",
        "effects": {"moonshine_win_mult": 1.4, "moonshine_lose_mult": 1.2},
    },
    {
        "id": "telegraph", "name": "Telegraph", "rarity": "uncommon",
        "description": "+8% acc repeating direction",
        "effects": {"repeat_dir_accuracy": 0.08},
    },
    {
        "id": "prospectors_pick", "name": "Prospector's Pick", "rarity": "uncommon",
        "description": "+$75/round if bal >$10k",
        "effects": {"high_balance_income": 75},
    },
    {
        "id": "twin_revolvers", "name": "Twin Revolvers", "rarity": "uncommon",
        "description": "QD uses DE win values",
        "effects": {"twin_revolvers": True},
    },
    {
        "id": "dynamite", "name": "Dynamite", "rarity": "uncommon",
        "description": "+20 all wins, -5% accuracy",
        "effects": {"dynamite_win_bonus": 20, "dynamite_accuracy_penalty": 0.05},
    },
    {
        "id": "medicine_bag", "name": "Medicine Bag", "rarity": "uncommon",
        "description": "+$50/round if bal < start",
        "effects": {"low_balance_income": 50},
    },
    {
        "id": "war_drum", "name": "War Drum", "rarity": "uncommon",
        "description": "After 2 correct: +5 wins",
        "effects": {"war_drum_bonus": 5},
    },
    {
        "id": "coyote_howl", "name": "Coyote Howl", "rarity": "uncommon",
        "description": "Start at wanted level 2",
        "effects": {"starting_level_bonus": 1},
    },
    {
        "id": "marked_cards", "name": "Marked Cards", "rarity": "uncommon",
        "description": "After miss: +12% acc next",
        "effects": {"marked_cards_accuracy": 0.12},
    },
    {
        "id": "rattlesnake_venom", "name": "Rattlesnake Venom", "rarity": "uncommon",
        "description": "-0.5 opp notoriety (PvP)",
        "effects": {},
    },

    # ── Rare (15) ──
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
    {
        "id": "blood_oath", "name": "Blood Oath", "rarity": "rare",
        "description": "All scoring x2, ante x2",
        "effects": {"score_multiplier": 2, "ante_multiplier": 2},
    },
    {
        "id": "bounty_mark", "name": "Bounty Hunter's Mark", "rarity": "rare",
        "description": "+$25/wanted lv/round",
        "effects": {"bounty_mark_income": 25},
    },
    {
        "id": "gatling_gun", "name": "Gatling Gun", "rarity": "rare",
        "description": "Correct DE: score twice",
        "effects": {"gatling_gun": True},
    },
    {
        "id": "stagecoach", "name": "Stagecoach", "rarity": "rare",
        "description": "+1 chamber slot",
        "effects": {"extra_chambers": 1},
    },
    {
        "id": "phoenix_feather", "name": "Phoenix Feather", "rarity": "rare",
        "description": "On bust: revive at $1k",
        "effects": {"phoenix_feather": True},
    },
    {
        "id": "outlaws_legacy", "name": "Outlaw's Legacy", "rarity": "rare",
        "description": "Notor up threshold -1",
        "effects": {"outlaw_legacy": 1},
    },
    {
        "id": "diamond_spurs", "name": "Diamond Spurs", "rarity": "rare",
        "description": "Holster scoring x1.5",
        "effects": {"holster_score_mult": 1.5},
    },
    {
        "id": "midnight_oil", "name": "Midnight Oil", "rarity": "rare",
        "description": "+1 pick per round",
        "effects": {"extra_picks": 1},
    },
    {
        "id": "platinum_tooth", "name": "Platinum Tooth", "rarity": "rare",
        "description": "+$100 flat per correct",
        "effects": {"flat_cash_per_correct": 100},
    },
    {
        "id": "tombstone_ace", "name": "Tombstone Ace", "rarity": "rare",
        "description": "Wrong DE: 25% score correct",
        "effects": {"tombstone_ace_chance": 0.25},
    },
    {
        "id": "thunderclap", "name": "Thunderclap", "rarity": "rare",
        "description": "+$500 on level up",
        "effects": {"thunderclap_bonus": 500},
    },

    # ── Legendary (10) ──
    {
        "id": "peacemaker", "name": "The Peacemaker", "rarity": "legendary",
        "description": "All picks use DE win vals",
        "effects": {"peacemaker": True},
    },
    {
        "id": "wanted_doa", "name": "Wanted: Dead or Alive", "rarity": "legendary",
        "description": "Wanted never decreases",
        "effects": {"wanted_never_decrease": True},
    },
    {
        "id": "gold_rush", "name": "Gold Rush", "rarity": "legendary",
        "description": "Gains x2, losses x2",
        "effects": {"gold_rush": True},
    },
    {
        "id": "ace_of_spades", "name": "The Ace of Spades", "rarity": "legendary",
        "description": "Every 5th pick auto-correct",
        "effects": {"ace_of_spades_interval": 5},
    },
    {
        "id": "manifest_destiny", "name": "Manifest Destiny", "rarity": "legendary",
        "description": "Mult reads +2 levels",
        "effects": {"manifest_destiny": 2},
    },
    {
        "id": "lone_ranger", "name": "The Lone Ranger", "rarity": "legendary",
        "description": "1 iron equipped: effects x3",
        "effects": {"lone_ranger": True},
    },
    {
        "id": "lady_luck", "name": "Lady Luck", "rarity": "legendary",
        "description": "30% miss becomes correct",
        "effects": {"ghost_chance": 0.30},
    },
    {
        "id": "el_dorado", "name": "El Dorado", "rarity": "legendary",
        "description": "+$500/round, +$50 more/round",
        "effects": {"el_dorado_base": 500, "el_dorado_increment": 50},
    },
    {
        "id": "dead_mans_hand", "name": "Dead Man's Hand", "rarity": "legendary",
        "description": "On bust: 50% peak as score",
        "effects": {"dead_mans_hand": True},
    },
    {
        "id": "high_noon", "name": "High Noon", "rarity": "legendary",
        "description": "1/round: auto-correct, next auto-wrong",
        "effects": {"high_noon": True},
    },
]

IRON_DEFS_BY_ID = {iron["id"]: iron for iron in IRON_DEFS}

# Rarity weights for offering rolls
RARITY_WEIGHTS = {"common": 45, "uncommon": 30, "rare": 18, "legendary": 7}
