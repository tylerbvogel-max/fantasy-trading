// ── Bounty Hunter Simulation — Configuration ──
// All tunable constants in one place. Change values here, re-run sim.

// ── Run parameters ──
export const NUM_RUNS = 200;
export const NUM_ROUNDS = 30;
export const PICKS_PER_ROUND = 5;
export const STARTING_BALANCE = 5000;
export const STOCK_POOL_SIZE = 25;
export const BATCHES_PER_CYCLE = 5;

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
export const NOTORIETY_UP_THRESHOLD = 2.5;   // roundNotoriety >= this → wanted +1
export const NOTORIETY_DOWN_THRESHOLD = -3;  // roundNotoriety <= this → wanted -1

// ── Skip cost ──
// cost = 25 * 2.5^(n-1) * max(1, balance/5000)
export function skipCost(n, balance) {
  return Math.ceil(25 * Math.pow(2.0, n - 1) * Math.max(1, balance / 8000));
}

// ── Round ante ──
export const ANTE_BASE = 60;
export function roundAnte(roundNum, wantedLevel) {
  return ANTE_BASE;
}

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
