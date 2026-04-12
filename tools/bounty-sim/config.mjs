// ── Bounty Hunter Simulation — Configuration ──
// 15-Minute Micro-Window Edition (5 stocks per window)

// ── Run parameters ──
export const NUM_RUNS = 500;

// 14 days × 6.5 market hours × 4 windows/hour = ~364 windows
export const NUM_ROUNDS = 364;

// ── Window parameters ──
export const WINDOW_DURATION_MINUTES = 15;
export const TOTAL_SIMULATION_DAYS = 14;
export const STOCK_POOL_SIZE = 25;

// Each window has exactly 5 stocks — player picks all 5
export const MIN_PICKS_PER_WINDOW = 1;
export const MAX_PICKS_PER_WINDOW = 5;
export const EXPECTED_PICKS_PER_WINDOW = 5;
export const PICKS_PER_ROUND = EXPECTED_PICKS_PER_WINDOW; // Legacy alias for sim files

// ── Chambers (Iron slots) ──
export const STARTING_CHAMBERS = 1;
export const MAX_CHAMBERS = 6;

// ── Scoring tables ──
// Directional picks (rise/fall): { confidence: { win, lose } }
// MUST match backend/app/services/bounty_config.py — backend is source of truth
export const DIR_SCORING = {
  1: { win: 13, lose: 11 },
  2: { win: 31, lose: 28 },
  3: { win: 57, lose: 70 },
};

// Holster picks: { confidence: { win, lose } }
// Tier-1 balance fix: Reduced holster wins to prevent Cautious Turtle overpowering
export const HOL_SCORING = {
  1: { win: 7, lose: 6 },
  2: { win: 16, lose: 15 },
  3: { win: 30, lose: 30 },
};

// ── Wanted level multiplier table ──
// Levels 1-10 are explicit, 11+ use exponential formula
// MUST match backend/app/services/bounty_config.py
export const WANTED_MULT = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 18,
  6: 42, 7: 100, 8: 230, 9: 530, 10: 1200,
};
export const WANTED_OVERFLOW_BASE = 2.3; // multiplier per level above 10

export function wantedMultiplier(level) {
  if (WANTED_MULT[level]) return WANTED_MULT[level];
  return Math.round(WANTED_MULT[10] * Math.pow(WANTED_OVERFLOW_BASE, level - 10));
}

// ── Notoriety ──
// MUST match backend/app/services/bounty_config.py
export const NOTORIETY_WEIGHT = { 1: 1, 2: 1.5, 3: 2 };
export const NOTORIETY_UP_THRESHOLD = 2.5;   // windowNotoriety >= this → wanted +1
export const NOTORIETY_DOWN_THRESHOLD = -3;  // windowNotoriety <= this → wanted -1

// ── Skip cost ──
// cost = 25 * 2.0^(n-1) * max(1, balance/8000)
export function skipCost(n, balance) {
  return Math.ceil(25 * Math.pow(2.5, n - 1) * Math.max(1, balance / 5000));
}

// ── Window ante (per 15-min window) ──
export const ANTE_BASE = 15;

// ── Adjustment mechanic ──
export const ADJUSTMENT_BASE_COST = 25;
export const ADJUSTMENT_LEVEL_SCALING = 0.1;
export const MAX_ADJUSTMENTS_PER_WINDOW = 1;
export function windowAnte(windowNum, wantedLevel) {
  return ANTE_BASE;
}

// ── Conditions System ──
// ~35% of windows have at least one market condition
export const CONDITION_PROBABILITY = 0.35;
export const RANDOM_MARKET_CONDITIONS = [
  "volatility_surge", "dead_calm", "bear_raid", "momentum_day",
];
export const CONDITION_DEFS = {
  volatility_surge: { score_multiplier: 1.3 },
  dead_calm: { hold_threshold_multiplier: 0.7 },
  bear_raid: { fall_win_bonus: 10 },
  momentum_day: { dir_win_bonus: 8 },
  fed_tension: { score_multiplier: 1.5, all_lose_multiplier: 1.5 },
  earnings_live: { ticker_score_multiplier: 2.0, notoriety_multiplier: 1.5 },
  sector_heat: { sector_score_multiplier: 1.5 },
};

// ── High Noon bounties ──
export const HIGH_NOON_SCORING_MULT = 3;
export const HIGH_NOON_CONFIDENCE = 3;
export const HIGH_NOON_NOTORIETY_WIN = 1.0;
export const HIGH_NOON_NOTORIETY_LOSE = -1.5;

// ── Starting balance ──
export const STARTING_BALANCE = 5000;

// ── Chart config ──
export const SAMPLE_RUNS = 5; // runs per archetype to chart

export const ARCHETYPE_COLORS = {
  random_monkey: '#888888',
  cautious_turtle: '#4CAF50',
  aggro_gambler: '#F44336',
  newbie: '#9E9E9E',
  hot_tilt: '#FF9800',
  comeback_grinder: '#2196F3',
  optimizer: '#FFD700',
  skip_burner: '#795548',
  streaky_pro: '#E91E63',
  conservative_climber: '#00BCD4',
};

export const ARCHETYPE_LABELS = {
  random_monkey: 'Random Monkey',
  cautious_turtle: 'Cautious Turtle',
  aggro_gambler: 'Aggro Gambler',
  newbie: 'The Newbie',
  hot_tilt: 'Hot Start → Tilt',
  comeback_grinder: 'Comeback Grinder',
  optimizer: 'The Optimizer',
  skip_burner: 'Skip Burner',
  streaky_pro: 'Streaky Pro',
  conservative_climber: 'Conservative Climber',
};

export const ARCHETYPES = [
  'newbie', 'random_monkey', 'aggro_gambler', 'hot_tilt', 'cautious_turtle',
  'comeback_grinder', 'skip_burner', 'streaky_pro', 'conservative_climber', 'optimizer',
];
