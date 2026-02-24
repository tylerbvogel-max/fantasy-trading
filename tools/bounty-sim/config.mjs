// ── Bounty Hunter Simulation — Configuration ──
// 30-Minute Rolling Window Edition (Continuous Gameplay)

// ── Run parameters ──
export const NUM_RUNS = 500;

// Legacy: kept for backward compatibility with existing archetypes
export const NUM_ROUNDS = 336; // 14 days × 8 hours × 2 windows per hour

// ── Window parameters (replaces round-based batching) ──
export const WINDOW_DURATION_MINUTES = 30;
export const TOTAL_SIMULATION_DAYS = 14;
export const STOCK_POOL_SIZE = 25;

// Player engagement: 3-5 app checks per day
// With 14 days of 30-min windows, we expect ~3-5 picks per window for realistic engagement
export const MIN_PICKS_PER_WINDOW = 1;
export const MAX_PICKS_PER_WINDOW = 10; // Player can pick 1-10 stocks per window at own pace
export const EXPECTED_PICKS_PER_WINDOW = 3; // Design target

// ── Chambers (Iron slots) ──
export const STARTING_CHAMBERS = 2;
export const MAX_CHAMBERS = 6;

// ── Scoring tables ──
// Directional picks (rise/fall): { confidence: { win, lose } }
export const DIR_SCORING = {
  1: { win: 18, lose: 10 },
  2: { win: 38, lose: 25 },
  3: { win: 65, lose: 48 },
};

// Holster picks: { confidence: { win, lose } }
export const HOL_SCORING = {
  1: { win: 12, lose: 5 },
  2: { win: 24, lose: 13 },
  3: { win: 40, lose: 22 },
};

// ── Wanted level multiplier table ──
// Levels 1-10 are explicit, 11+ use exponential formula
export const WANTED_MULT = {
  1: 1, 2: 3, 3: 7, 4: 15, 5: 30,
  6: 60, 7: 130, 8: 280, 9: 620, 10: 1400,
};
export const WANTED_OVERFLOW_BASE = 2.3; // multiplier per level above 10

export function wantedMultiplier(level) {
  if (WANTED_MULT[level]) return WANTED_MULT[level];
  return Math.round(WANTED_MULT[10] * Math.pow(WANTED_OVERFLOW_BASE, level - 10));
}

// ── Notoriety ──
export const NOTORIETY_WEIGHT = { 1: 1, 2: 1.5, 3: 2 };
export const NOTORIETY_UP_THRESHOLD = 2.5;   // windowNotoriety >= this → wanted +1
export const NOTORIETY_DOWN_THRESHOLD = -3;  // windowNotoriety <= this → wanted -1

// ── Skip cost ──
// cost = 25 * 2.0^(n-1) * max(1, balance/8000)
export function skipCost(n, balance) {
  return Math.ceil(25 * Math.pow(2.0, n - 1) * Math.max(1, balance / 8000));
}

// ── Window ante (per 30-min window, not per round) ──
export const ANTE_BASE = 15; // Scaled down for 30-min windows (was 60 for 2h rounds)
export function windowAnte(windowNum, wantedLevel) {
  return ANTE_BASE;
}

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
