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
# Tier-1 balance fix: Reduced holster wins to prevent Cautious Turtle overpowering
HOL_SCORING = {
    1: {"win": 7, "lose": 6},
    2: {"win": 16, "lose": 15},
    3: {"win": 30, "lose": 30},
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
    """Cost of the nth skip in a window. Scales with balance.
    
    Tier-1 balance fix: Reduced from 2.5× to 1.8× scaling to help Comeback Grinder archetype.
    """
    return math.ceil(25 * math.pow(1.8, n - 1) * max(1, balance / 5000))


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
        "boost_description": "+8% accuracy, 5% ghost chance",
        "boost_effects": {"accuracy_bonus": 0.08, "ghost_chance": 0.05},
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
        "boost_description": "+4 dir wins, -1 dir losses",
        "boost_effects": {"dir_win_bonus": 4, "dir_lose_reduction": 1},
    },
    {
        "id": "pocket_watch", "name": "Pocket Watch", "rarity": "common",
        "description": "+3 QD wins",
        "effects": {"qd_win_bonus": 3},
        "boost_description": "+6 QD wins, +3% accuracy",
        "boost_effects": {"qd_win_bonus": 6, "accuracy_bonus": 0.03},
    },
    {
        "id": "canteen", "name": "Canteen", "rarity": "common",
        "description": "+$30/round income",
        "effects": {"round_income": 30},
        "boost_description": "+$60/round, -$10 ante",
        "boost_effects": {"round_income": 60, "ante_reduction": 10},
    },
    {
        "id": "worn_boots", "name": "Worn Boots", "rarity": "common",
        "description": "+1 win per round survived",
        "effects": {"worn_boots_per_round": 1},
        "boost_description": "+2/round survived, +$20/round",
        "boost_effects": {"worn_boots_per_round": 2, "round_income": 20},
    },
    {
        "id": "rusty_spurs", "name": "Rusty Spurs", "rarity": "common",
        "description": "+8 wins at wanted \u22642",
        "effects": {"low_level_win_bonus": 8},
        "boost_description": "+14 wins at wanted \u22642, -2 losses",
        "boost_effects": {"low_level_win_bonus": 14, "all_lose_reduction": 2},
    },
    {
        "id": "campfire", "name": "Campfire", "rarity": "common",
        "description": "-2 holster losses",
        "effects": {"holster_lose_reduction": 2},
        "boost_description": "-4 holster losses, +3 holster wins",
        "boost_effects": {"holster_lose_reduction": 4, "holster_win_bonus": 3},
    },
    {
        "id": "whiskey_flask", "name": "Whiskey Flask", "rarity": "common",
        "description": "+6 wins on 1st pick/round",
        "effects": {"first_pick_win_bonus": 6},
        "boost_description": "+12 wins on 1st pick, +5% 1st pick acc",
        "boost_effects": {"first_pick_win_bonus": 12, "first_pick_accuracy_bonus": 0.05},
    },
    {
        "id": "rope_lasso", "name": "Rope Lasso", "rarity": "common",
        "description": "+8% holster accuracy",
        "effects": {"holster_accuracy_bonus": 0.08},
        "boost_description": "+12% holster acc, +$30 holster correct",
        "boost_effects": {"holster_accuracy_bonus": 0.12, "holster_correct_bonus": 30},
    },
    {
        "id": "chaps", "name": "Chaps", "rarity": "common",
        "description": "-1 directional losses",
        "effects": {"dir_lose_reduction": 1},
        "boost_description": "-3 dir losses, +2 dir wins",
        "boost_effects": {"dir_lose_reduction": 3, "dir_win_bonus": 2},
    },
    {
        "id": "six_shooter", "name": "Six-Shooter", "rarity": "common",
        "description": "Every 6th correct: +$150",
        "effects": {"six_shooter_interval": 6, "six_shooter_bonus": 150},
        "boost_description": "Every 4th correct: +$250",
        "boost_effects": {"six_shooter_interval": 4, "six_shooter_bonus": 250},
    },
    {
        "id": "cowbell", "name": "Cowbell", "rarity": "common",
        "description": "+0.5 notoriety/round",
        "effects": {"flat_notoriety_per_round": 0.5},
        "boost_description": "+1.0 notor/round, +0.3 notor/correct",
        "boost_effects": {"flat_notoriety_per_round": 1.0, "notoriety_bonus": 0.3},
    },
    {
        "id": "hay_bale", "name": "Hay Bale", "rarity": "common",
        "description": "+$40 on correct holster",
        "effects": {"holster_correct_bonus": 40},
        "boost_description": "+$80 holster correct, +4 holster wins",
        "boost_effects": {"holster_correct_bonus": 80, "holster_win_bonus": 4},
    },
    {
        "id": "branding_iron", "name": "Branding Iron", "rarity": "common",
        "description": "+4 RISE wins",
        "effects": {"rise_win_bonus": 4},
        "boost_description": "+8 RISE wins, +3% accuracy",
        "boost_effects": {"rise_win_bonus": 8, "accuracy_bonus": 0.03},
    },
    {
        "id": "cattle_prod", "name": "Cattle Prod", "rarity": "common",
        "description": "+4 FALL wins",
        "effects": {"fall_win_bonus": 4},
        "boost_description": "+8 FALL wins, +3% accuracy",
        "boost_effects": {"fall_win_bonus": 8, "accuracy_bonus": 0.03},
    },
    {
        "id": "scouts_compass", "name": "Scout's Compass", "rarity": "common",
        "description": "+5% acc on 1st pick/round",
        "effects": {"first_pick_accuracy_bonus": 0.05},
        "boost_description": "+10% 1st pick acc, +4 1st pick wins",
        "boost_effects": {"first_pick_accuracy_bonus": 0.10, "first_pick_win_bonus": 4},
    },
    {
        "id": "rattlesnake_skin", "name": "Rattlesnake Skin", "rarity": "common",
        "description": "-20% skip cost",
        "effects": {"skip_discount": 0.20},
        "boost_description": "-35% skip, +3 post-skip wins",
        "boost_effects": {"skip_discount": 0.35, "post_skip_win_bonus": 3},
    },
    {
        "id": "saddlebag", "name": "Saddlebag", "rarity": "common",
        "description": "+$15 flat per pick",
        "effects": {"flat_per_pick": 15},
        "boost_description": "+$30/pick, +$25/correct",
        "boost_effects": {"flat_per_pick": 30, "flat_cash_per_correct": 25},
    },
    {
        "id": "dust_devil", "name": "Dust Devil", "rarity": "common",
        "description": "+5 wins after a skip",
        "effects": {"post_skip_win_bonus": 5},
        "boost_description": "+10 post-skip wins, -15% skip cost",
        "boost_effects": {"post_skip_win_bonus": 10, "skip_discount": 0.15},
    },
    {
        "id": "water_trough", "name": "Water Trough", "rarity": "common",
        "description": "Losses halved if bal <$2k",
        "effects": {"low_balance_loss_halved": True},
        "boost_description": "Losses halved <$2k, +$40/round income",
        "boost_effects": {"low_balance_loss_halved": True, "round_income": 40},
    },
    {
        "id": "copper_ring", "name": "Copper Ring", "rarity": "common",
        "description": "+0.5 notor/correct dir",
        "effects": {"dir_notoriety_bonus": 0.5},
        "boost_description": "+1.0 notor/correct dir, +2 dir wins",
        "boost_effects": {"dir_notoriety_bonus": 1.0, "dir_win_bonus": 2},
    },
    {
        "id": "horseshoe_nail", "name": "Horseshoe Nail", "rarity": "common",
        "description": "+2% acc per iron equipped",
        "effects": {"accuracy_per_iron": 0.02},
        "boost_description": "+3% acc/iron, +$10/round/iron",
        "boost_effects": {"accuracy_per_iron": 0.03, "income_per_iron": 10},
    },
    {
        "id": "tenderfoot", "name": "Tenderfoot", "rarity": "common",
        "description": "+5 wins when round acc <50%",
        "effects": {"low_accuracy_win_bonus": 5},
        "boost_description": "+10 wins at <50% acc, 5% ghost",
        "boost_effects": {"low_accuracy_win_bonus": 10, "ghost_chance": 0.05},
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
        "boost_description": "+18 wins at wanted \u22655, +1 win/level",
        "boost_effects": {"high_level_win_bonus": 18, "per_level_win_bonus": 1},
    },
    {
        "id": "saloon_door", "name": "Saloon Door", "rarity": "uncommon",
        "description": "1st bust/run: survive w/$500",
        "effects": {"saloon_door": True},
        "boost_description": "1st bust: survive w/$1k, -2 losses",
        "boost_effects": {"saloon_door": True, "all_lose_reduction": 2},
    },
    {
        "id": "fools_gold", "name": "Fool's Gold", "rarity": "uncommon",
        "description": "+$150/round, ante +$25",
        "effects": {"fools_gold_income": 150, "ante_penalty": 25},
        "boost_description": "+$250/round, ante +$15 (reduced)",
        "boost_effects": {"fools_gold_income": 250, "ante_penalty": 15},
    },
    {
        "id": "war_paint", "name": "War Paint", "rarity": "uncommon",
        "description": "+6 wins when notor negative",
        "effects": {"neg_notoriety_win_bonus": 6},
        "boost_description": "+12 wins at neg notor, -3 losses",
        "boost_effects": {"neg_notoriety_win_bonus": 12, "all_lose_reduction": 3},
    },
    {
        "id": "smoke_bomb", "name": "Smoke Bomb", "rarity": "uncommon",
        "description": "1st loss/round halved",
        "effects": {"smoke_bomb": True},
        "boost_description": "1st loss/round halved, 8% ghost",
        "boost_effects": {"smoke_bomb": True, "ghost_chance": 0.08},
    },
    {
        "id": "panning_kit", "name": "Panning Kit", "rarity": "uncommon",
        "description": "+$20/round per iron equipped",
        "effects": {"income_per_iron": 20},
        "boost_description": "+$35/round/iron, +1% acc/iron",
        "boost_effects": {"income_per_iron": 35, "accuracy_per_iron": 0.01},
    },
    {
        "id": "horse_thief", "name": "Horse Thief", "rarity": "uncommon",
        "description": "Recover 15% of ante",
        "effects": {"ante_recovery_pct": 0.15},
        "boost_description": "Recover 25% ante, -$15 ante",
        "boost_effects": {"ante_recovery_pct": 0.25, "ante_reduction": 15},
    },
    {
        "id": "moonshine", "name": "Moonshine", "rarity": "uncommon",
        "description": "Wins +40%, losses +20%",
        "effects": {"moonshine_win_mult": 1.4, "moonshine_lose_mult": 1.2},
        "boost_description": "Wins +60%, losses +15%",
        "boost_effects": {"moonshine_win_mult": 1.6, "moonshine_lose_mult": 1.15},
    },
    {
        "id": "telegraph", "name": "Telegraph", "rarity": "uncommon",
        "description": "+8% acc repeating direction",
        "effects": {"repeat_dir_accuracy": 0.08},
        "boost_description": "+14% repeat acc, +3 dir wins",
        "boost_effects": {"repeat_dir_accuracy": 0.14, "dir_win_bonus": 3},
    },
    {
        "id": "prospectors_pick", "name": "Prospector's Pick", "rarity": "uncommon",
        "description": "+$75/round if bal >$10k",
        "effects": {"high_balance_income": 75},
        "boost_description": "+$125/round if bal >$10k, scoring x1.1",
        "boost_effects": {"high_balance_income": 125, "score_multiplier": 1.1},
    },
    {
        "id": "twin_revolvers", "name": "Twin Revolvers", "rarity": "uncommon",
        "description": "QD uses DE win values",
        "effects": {"twin_revolvers": True},
        "boost_description": "QD uses DE vals, +5 QD wins",
        "boost_effects": {"twin_revolvers": True, "qd_win_bonus": 5},
    },
    {
        "id": "dynamite", "name": "Dynamite", "rarity": "uncommon",
        "description": "+20 all wins, -5% accuracy",
        "effects": {"dynamite_win_bonus": 20, "dynamite_accuracy_penalty": 0.05},
        "boost_description": "+35 all wins, -3% acc (reduced)",
        "boost_effects": {"dynamite_win_bonus": 35, "dynamite_accuracy_penalty": 0.03},
    },
    {
        "id": "medicine_bag", "name": "Medicine Bag", "rarity": "uncommon",
        "description": "+$50/round if bal < start",
        "effects": {"low_balance_income": 50},
        "boost_description": "+$100/round if below start, -2 losses",
        "boost_effects": {"low_balance_income": 100, "all_lose_reduction": 2},
    },
    {
        "id": "war_drum", "name": "War Drum", "rarity": "uncommon",
        "description": "After 2 correct: +5 wins",
        "effects": {"war_drum_bonus": 5},
        "boost_description": "After 2 correct: +10 wins, +0.5 notor",
        "boost_effects": {"war_drum_bonus": 10, "notoriety_bonus": 0.5},
    },
    {
        "id": "coyote_howl", "name": "Coyote Howl", "rarity": "uncommon",
        "description": "Start at wanted level 2",
        "effects": {"starting_level_bonus": 1},
        "boost_description": "Start at wanted level 3, +$50/round",
        "boost_effects": {"starting_level_bonus": 2, "round_income": 50},
    },
    {
        "id": "marked_cards", "name": "Marked Cards", "rarity": "uncommon",
        "description": "After miss: +12% acc next",
        "effects": {"marked_cards_accuracy": 0.12},
        "boost_description": "After miss: +20% acc next, -2 losses",
        "boost_effects": {"marked_cards_accuracy": 0.20, "all_lose_reduction": 2},
    },
    {
        "id": "rattlesnake_venom", "name": "Rattlesnake Venom", "rarity": "uncommon",
        "description": "-0.5 opp notoriety (PvP)",
        "effects": {},
        "boost_description": "-1.0 opp notor, +0.3 own notor/correct",
        "boost_effects": {"notoriety_bonus": 0.3},
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
        "boost_description": "Scoring x2.5, ante x1.5 (reduced)",
        "boost_effects": {"score_multiplier": 2.5, "ante_multiplier": 1.5},
    },
    {
        "id": "bounty_mark", "name": "Bounty Hunter's Mark", "rarity": "rare",
        "description": "+$25/wanted lv/round",
        "effects": {"bounty_mark_income": 25},
        "boost_description": "+$45/wanted lv/round, +1 win/level",
        "boost_effects": {"bounty_mark_income": 45, "per_level_win_bonus": 1},
    },
    {
        "id": "gatling_gun", "name": "Gatling Gun", "rarity": "rare",
        "description": "Correct DE: score twice",
        "effects": {"gatling_gun": True},
        "boost_description": "DE score twice, +10% DE accuracy",
        "boost_effects": {"gatling_gun": True, "de_accuracy_bonus": 0.10},
    },
    {
        "id": "stagecoach", "name": "Stagecoach", "rarity": "rare",
        "description": "+1 chamber slot",
        "effects": {"extra_chambers": 1},
        "boost_description": "+1 chamber, +$15/round/iron",
        "boost_effects": {"extra_chambers": 1, "income_per_iron": 15},
    },
    {
        "id": "phoenix_feather", "name": "Phoenix Feather", "rarity": "rare",
        "description": "On bust: revive at $1k",
        "effects": {"phoenix_feather": True},
        "boost_description": "On bust: revive at $2k, keep wanted lv",
        "boost_effects": {"phoenix_feather": True},
    },
    {
        "id": "outlaws_legacy", "name": "Outlaw's Legacy", "rarity": "rare",
        "description": "Notor up threshold -1",
        "effects": {"outlaw_legacy": 1},
        "boost_description": "Notor threshold -2, +0.5 notor/correct",
        "boost_effects": {"outlaw_legacy": 2, "notoriety_bonus": 0.5},
    },
    {
        "id": "diamond_spurs", "name": "Diamond Spurs", "rarity": "rare",
        "description": "Holster scoring x1.5",
        "effects": {"holster_score_mult": 1.5},
        "boost_description": "Holster scoring x2, +10% holster acc",
        "boost_effects": {"holster_score_mult": 2, "holster_accuracy_bonus": 0.10},
    },
    {
        "id": "midnight_oil", "name": "Midnight Oil", "rarity": "rare",
        "description": "+1 pick per round",
        "effects": {"extra_picks": 1},
        "boost_description": "+1 pick/round, +5% accuracy",
        "boost_effects": {"extra_picks": 1, "accuracy_bonus": 0.05},
    },
    {
        "id": "platinum_tooth", "name": "Platinum Tooth", "rarity": "rare",
        "description": "+$100 flat per correct",
        "effects": {"flat_cash_per_correct": 100},
        "boost_description": "+$175/correct, +0.5 notor/correct",
        "boost_effects": {"flat_cash_per_correct": 175, "notoriety_bonus": 0.5},
    },
    {
        "id": "tombstone_ace", "name": "Tombstone Ace", "rarity": "rare",
        "description": "Wrong DE: 25% score correct",
        "effects": {"tombstone_ace_chance": 0.25},
        "boost_description": "Wrong DE: 40% score correct, DE wins x1.3",
        "boost_effects": {"tombstone_ace_chance": 0.40, "de_win_multiplier": 1.3},
    },
    {
        "id": "thunderclap", "name": "Thunderclap", "rarity": "rare",
        "description": "+$500 on level up",
        "effects": {"thunderclap_bonus": 500},
        "boost_description": "+$900 on level up, +0.5 notor/level",
        "boost_effects": {"thunderclap_bonus": 900, "notoriety_bonus": 0.5},
    },

    # ── Legendary (10) ──
    {
        "id": "peacemaker", "name": "The Peacemaker", "rarity": "legendary",
        "description": "All picks use DE win vals",
        "effects": {"peacemaker": True},
        "boost_description": "All picks use DE vals, scoring x1.3",
        "boost_effects": {"peacemaker": True, "score_multiplier": 1.3},
    },
    {
        "id": "wanted_doa", "name": "Wanted: Dead or Alive", "rarity": "legendary",
        "description": "Wanted never decreases",
        "effects": {"wanted_never_decrease": True},
        "boost_description": "Wanted never decreases, +2 wins/level",
        "boost_effects": {"wanted_never_decrease": True, "per_level_win_bonus": 2},
    },
    {
        "id": "gold_rush", "name": "Gold Rush", "rarity": "legendary",
        "description": "Gains x2, losses x2",
        "effects": {"gold_rush": True},
        "boost_description": "Gains x2.5, losses x1.5",
        "boost_effects": {"gold_rush": True},
    },
    {
        "id": "ace_of_spades", "name": "The Ace of Spades", "rarity": "legendary",
        "description": "Every 5th pick auto-correct",
        "effects": {"ace_of_spades_interval": 5},
        "boost_description": "Every 4th pick auto-correct, +$50/correct",
        "boost_effects": {"ace_of_spades_interval": 4, "flat_cash_per_correct": 50},
    },
    {
        "id": "manifest_destiny", "name": "Manifest Destiny", "rarity": "legendary",
        "description": "Mult reads +2 levels",
        "effects": {"manifest_destiny": 2},
        "boost_description": "Mult reads +3 levels, +$30/wanted lv/round",
        "boost_effects": {"manifest_destiny": 3, "bounty_mark_income": 30},
    },
    {
        "id": "lone_ranger", "name": "The Lone Ranger", "rarity": "legendary",
        "description": "1 iron equipped: effects x3",
        "effects": {"lone_ranger": True},
        "boost_description": "1 iron: effects x4, +10% accuracy",
        "boost_effects": {"lone_ranger": True, "accuracy_bonus": 0.10},
    },
    {
        "id": "lady_luck", "name": "Lady Luck", "rarity": "legendary",
        "description": "30% miss becomes correct",
        "effects": {"ghost_chance": 0.30},
        "boost_description": "40% ghost, +$75/correct",
        "boost_effects": {"ghost_chance": 0.40, "flat_cash_per_correct": 75},
    },
    {
        "id": "el_dorado", "name": "El Dorado", "rarity": "legendary",
        "description": "+$500/round, +$50 more/round",
        "effects": {"el_dorado_base": 500, "el_dorado_increment": 50},
        "boost_description": "+$750/round, +$75 more/round",
        "boost_effects": {"el_dorado_base": 750, "el_dorado_increment": 75},
    },
    {
        "id": "dead_mans_hand", "name": "Dead Man's Hand", "rarity": "legendary",
        "description": "On bust: 50% peak as score",
        "effects": {"dead_mans_hand": True},
        "boost_description": "On bust: 70% peak as score, revive at $500",
        "boost_effects": {"dead_mans_hand": True, "phoenix_feather": True},
    },
    {
        "id": "high_noon", "name": "High Noon", "rarity": "legendary",
        "description": "1/round: auto-correct, next auto-wrong",
        "effects": {"high_noon": True},
        "boost_description": "Auto-correct, next 50% acc (not auto-wrong)",
        "boost_effects": {"high_noon": True},
    },
]

IRON_DEFS_BY_ID = {iron["id"]: iron for iron in IRON_DEFS}

# Rarity weights for offering rolls
RARITY_WEIGHTS = {"common": 45, "uncommon": 30, "rare": 18, "legendary": 7}

# ── Leverage ──
LEVERAGE_MIN = 1.0
LEVERAGE_MAX = 5.0
LEVERAGE_STEP = 0.5  # slider increments

# Wanted level → max leverage allowed
LEVERAGE_CEILING = {
    1: 2.0, 2: 2.0,
    3: 3.0, 4: 3.0,
    5: 4.0, 6: 4.0,
    7: 5.0, 8: 5.0, 9: 5.0, 10: 5.0,
}

def max_leverage_for_level(level: int) -> float:
    if level in LEVERAGE_CEILING:
        return LEVERAGE_CEILING[level]
    return LEVERAGE_MAX  # overflow levels get full access

# Margin call probability: based on leverage tier
# Returns (min_chance, max_chance) — linearly interpolated within tier
MARGIN_CALL_TIERS = [
    (1.0, 2.0, 0.0, 0.0),    # 1x–2x: no margin call
    (2.5, 3.5, 0.05, 0.15),  # 2.5x–3.5x: 5%–15%
    (4.0, 5.0, 0.15, 0.30),  # 4x–5x: 15%–30%
]

def margin_call_chance(leverage: float) -> float:
    if leverage <= 2.0:
        return 0.0
    for lo, hi, chance_lo, chance_hi in MARGIN_CALL_TIERS:
        if lo <= leverage <= hi:
            t = (leverage - lo) / (hi - lo) if hi > lo else 0
            return chance_lo + t * (chance_hi - chance_lo)
    return 0.30  # max

# Margin call penalty: extra DD lost (flat amount)
MARGIN_CALL_PENALTY_DD = 200
# Margin call also drops wanted level by 1
MARGIN_CALL_WANTED_DROP = 1
# After margin call, locked to 1x for next N predictions
MARGIN_CALL_COOLDOWN = 1

# Carry cost: DD deducted on submission for using leverage
# Formula: round((leverage - 1.0) * CARRY_COST_PER_X)
CARRY_COST_PER_X = 10

# HOLD leverage behavior: halved (2x → 1.5x effective)
HOLD_LEVERAGE_FACTOR = 0.5  # applied as: 1 + (leverage - 1) * factor

# Notoriety bonus for high-leverage correct picks
LEVERAGE_NOTORIETY_BONUS_THRESHOLD = 3.0  # leverage >= this
LEVERAGE_NOTORIETY_BONUS = 0.5
