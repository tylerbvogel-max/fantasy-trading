// ── Bounty Hunter Simulation — 10 Archetype Behaviors (75-Iron Edition) ──

import { STARTING_BALANCE, NUM_ROUNDS } from './config.mjs';
import { IRONS } from './irons.mjs';

// ── Player action selection ──
export function getPlayerAction(player, state) {
  const { balance, wantedLevel, roundNum, pickInRound } = state;
  const progress = roundNum / NUM_ROUNDS;

  switch (player.type) {
    case 'random_monkey': {
      const r = Math.random();
      const conf = [1, 2, 3][Math.floor(Math.random() * 3)];
      if (r < 0.33) return { action: 'rise', confidence: conf };
      if (r < 0.66) return { action: 'fall', confidence: conf };
      return { action: 'holster', confidence: conf };
    }
    case 'cautious_turtle': {
      if (Math.random() < 0.5) return { action: 'holster', confidence: 1 };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: 1 };
    }
    case 'aggro_gambler':
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: 3 };
    case 'newbie': {
      const conf = progress > 0.5 ? 2 : 1;
      const holsterChance = 0.1 + progress * 0.2;
      if (Math.random() < holsterChance) return { action: 'holster', confidence: conf };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: conf };
    }
    case 'hot_tilt': {
      const conf = wantedLevel >= 3 ? 3 : wantedLevel >= 2 ? 2 : 1;
      if (Math.random() < 0.05) return { action: 'holster', confidence: conf };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: conf };
    }
    case 'comeback_grinder': {
      const brokeThreshold = STARTING_BALANCE * 0.3;
      const isBroke = balance < brokeThreshold;
      const conf = isBroke ? 1 : 2;
      if (isBroke && Math.random() < 0.15) return { action: 'skip', confidence: conf };
      if (Math.random() < (isBroke ? 0.40 : 0.10)) return { action: 'holster', confidence: conf };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: conf };
    }
    case 'optimizer': {
      let conf, holsterChance;
      if (wantedLevel <= 2) { conf = 3; holsterChance = 0.05; }
      else if (wantedLevel <= 4) { conf = 2; holsterChance = 0.15; }
      else { conf = 1; holsterChance = 0.30; }
      if (Math.random() < holsterChance) return { action: 'holster', confidence: conf };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: conf };
    }
    case 'skip_burner': {
      if (Math.random() < 0.40) return { action: 'skip', confidence: 2 };
      if (Math.random() < 0.15) return { action: 'holster', confidence: 2 };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: 2 };
    }
    case 'streaky_pro': {
      if (Math.random() < 0.20) return { action: 'holster', confidence: 2 };
      if (Math.random() < 0.05) return { action: 'skip', confidence: 2 };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: 2 };
    }
    case 'conservative_climber': {
      const conf = wantedLevel >= 3 ? 2 : 1;
      if (Math.random() < 0.30) return { action: 'holster', confidence: conf };
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: conf };
    }
    default:
      return { action: 'rise', confidence: 1 };
  }
}

// ── Accuracy per archetype ──
export function getAccuracy(player, state) {
  const { wantedLevel, roundNum } = state;
  const progress = roundNum / NUM_ROUNDS;

  switch (player.type) {
    case 'random_monkey': return 0.50;
    case 'cautious_turtle': return 0.55;
    case 'aggro_gambler': return 0.50;
    case 'newbie': return 0.35 + progress * 0.20;
    case 'hot_tilt': return wantedLevel <= 3 ? 0.70 : Math.max(0.25, 0.70 - (wantedLevel - 3) * 0.1);
    case 'comeback_grinder': return 0.35 + progress * 0.30;
    case 'optimizer': return 0.55;
    case 'skip_burner': return 0.55;
    case 'streaky_pro': {
      const cycle = Math.floor(player.totalPicks / 5);
      return cycle % 2 === 0 ? 0.75 : 0.35;
    }
    case 'conservative_climber': return 0.55;
    default: return 0.50;
  }
}

// ── Iron category tags ──
// Each iron is tagged with categories that archetypes can weight.
const IRON_TAGS = {
  // Common
  steady_hand:     ['offense', 'draw'],
  thick_skin:      ['defense'],
  lucky_horseshoe: ['accuracy'],
  trail_rations:   ['economy'],
  bandolier:       ['skip', 'economy'],
  leather_holster: ['offense', 'holster'],
  tin_star:        ['offense', 'directional'],
  pocket_watch:    ['offense', 'quickdraw'],
  canteen:         ['economy', 'income'],
  worn_boots:      ['offense', 'scaling'],
  rusty_spurs:     ['offense', 'conditional'],
  campfire:        ['defense', 'holster'],
  whiskey_flask:   ['offense', 'conditional'],
  rope_lasso:      ['accuracy', 'holster'],
  chaps:           ['defense', 'directional'],
  six_shooter:     ['economy', 'conditional'],
  cowbell:         ['notoriety'],
  hay_bale:        ['economy', 'holster'],
  branding_iron:   ['offense', 'directional'],
  cattle_prod:     ['offense', 'directional'],
  scouts_compass:  ['accuracy', 'conditional'],
  rattlesnake_skin:['skip', 'economy'],
  saddlebag:       ['economy', 'income'],
  dust_devil:      ['offense', 'skip'],
  water_trough:    ['defense', 'safety'],
  copper_ring:     ['notoriety', 'directional'],
  horseshoe_nail:  ['accuracy', 'scaling'],
  tenderfoot:      ['offense', 'conditional'],
  // Uncommon
  iron_sights:     ['offense', 'quickdraw'],
  snake_oil:       ['defense', 'holster'],
  deadeye_scope:   ['accuracy', 'deadeye'],
  gold_tooth:      ['economy', 'income'],
  bounty_poster:   ['notoriety'],
  silver_bullet:   ['offense', 'scaling'],
  saloon_door:     ['safety'],
  fools_gold:      ['economy', 'risky'],
  war_paint:       ['offense', 'conditional'],
  smoke_bomb:      ['defense'],
  panning_kit:     ['economy', 'scaling'],
  horse_thief:     ['economy'],
  moonshine:       ['multiplier', 'risky'],
  telegraph:       ['accuracy', 'directional'],
  prospectors_pick:['economy', 'scaling'],
  twin_revolvers:  ['offense', 'quickdraw'],
  dynamite:        ['offense', 'risky'],
  medicine_bag:    ['economy', 'safety'],
  war_drum:        ['offense', 'conditional'],
  coyote_howl:     ['notoriety', 'scaling'],
  marked_cards:    ['accuracy', 'conditional'],
  rattlesnake_venom:['notoriety'],  // PvP — low value in sim
  // Rare
  sheriffs_badge:  ['offense', 'scaling'],
  double_barrel:   ['offense', 'deadeye', 'multiplier'],
  ghost_rider:     ['accuracy', 'flip'],
  golden_revolver: ['multiplier'],
  blood_oath:      ['multiplier', 'risky'],
  bounty_mark:     ['economy', 'scaling'],
  gatling_gun:     ['offense', 'deadeye', 'multiplier'],
  stagecoach:      ['structural'],
  phoenix_feather: ['safety'],
  outlaws_legacy:  ['notoriety', 'scaling'],
  diamond_spurs:   ['multiplier', 'holster'],
  midnight_oil:    ['structural'],
  platinum_tooth:  ['economy', 'income'],
  tombstone_ace:   ['accuracy', 'deadeye', 'flip'],
  thunderclap:     ['economy', 'notoriety'],
  // Legendary
  peacemaker:      ['offense', 'multiplier'],
  wanted_doa:      ['notoriety', 'risky'],
  gold_rush:       ['multiplier', 'risky'],
  ace_of_spades:   ['accuracy', 'flip'],
  manifest_destiny:['multiplier', 'scaling'],
  lone_ranger:     ['multiplier', 'structural'],
  lady_luck:       ['accuracy', 'flip'],
  el_dorado:       ['economy', 'scaling'],
  dead_mans_hand:  ['safety'],
  high_noon:       ['flip', 'conditional'],
};

// ── Archetype category weights ──
// Higher weight = stronger preference. Missing categories default to 1.
const ARCHETYPE_WEIGHTS = {
  random_monkey: null, // picks randomly

  cautious_turtle: {
    defense: 10, holster: 8, safety: 9, economy: 6, accuracy: 5,
    income: 5, offense: 2, multiplier: 3, risky: 0, skip: 1,
    deadeye: 1, notoriety: 3, scaling: 4,
  },

  aggro_gambler: {
    offense: 9, deadeye: 10, multiplier: 10, risky: 7, flip: 8,
    accuracy: 4, defense: 1, safety: 1, economy: 2, holster: 1,
    notoriety: 5, scaling: 6,
  },

  newbie: {
    accuracy: 10, defense: 8, safety: 7, economy: 6, income: 5,
    offense: 3, holster: 4, flip: 6, multiplier: 3, risky: 0,
    scaling: 3, notoriety: 3,
  },

  hot_tilt: {
    offense: 9, deadeye: 10, multiplier: 9, risky: 6, flip: 7,
    accuracy: 5, notoriety: 6, scaling: 7, defense: 2, safety: 3,
    economy: 3, holster: 1,
  },

  comeback_grinder: {
    defense: 9, safety: 10, economy: 8, income: 7, holster: 6,
    accuracy: 6, offense: 3, multiplier: 4, risky: 1, scaling: 5,
    notoriety: 3, flip: 4,
  },

  optimizer: {
    multiplier: 10, scaling: 9, offense: 7, accuracy: 6, flip: 8,
    notoriety: 7, economy: 5, deadeye: 6, defense: 3, safety: 4,
    structural: 7, risky: 4,
  },

  skip_burner: {
    skip: 10, economy: 9, income: 8, defense: 5, safety: 6,
    accuracy: 4, offense: 2, multiplier: 3, risky: 1, holster: 2,
    scaling: 3, notoriety: 2,
  },

  streaky_pro: {
    multiplier: 10, flip: 9, offense: 8, accuracy: 6, scaling: 7,
    notoriety: 5, economy: 4, deadeye: 5, defense: 3, safety: 3,
    conditional: 6, risky: 5,
  },

  conservative_climber: {
    scaling: 10, accuracy: 8, offense: 6, multiplier: 7, economy: 6,
    notoriety: 7, defense: 5, safety: 5, flip: 5, holster: 4,
    structural: 6, risky: 2,
  },
};

// ── Rarity value bonus (prefer rarer irons slightly) ──
const RARITY_BONUS = { common: 0, uncommon: 2, rare: 5, legendary: 8 };

// ── Score an iron for a given archetype ──
function scoreIron(playerType, iron) {
  const weights = ARCHETYPE_WEIGHTS[playerType];
  if (!weights) return Math.random(); // random for monkey

  const tags = IRON_TAGS[iron.id] || [];
  let score = RARITY_BONUS[iron.rarity] || 0;
  for (const tag of tags) {
    score += weights[tag] || 1;
  }
  // Add small random jitter to break ties
  score += Math.random() * 0.5;
  return score;
}

// ── Get top N preferred irons for display (replaces old ironPriority) ──
export function topIronPreferences(playerType, n = 3) {
  if (!ARCHETYPE_WEIGHTS[playerType]) return null;
  const scored = IRONS.map(iron => ({ iron, score: scoreIron(playerType, iron) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map(s => s.iron);
}

// ── Pick the best Iron from offerings based on archetype preference ──
export function pickIron(playerType, offerings, equipped) {
  if (!ARCHETYPE_WEIGHTS[playerType]) {
    // Random monkey
    return offerings[Math.floor(Math.random() * offerings.length)];
  }

  let bestIron = offerings[0];
  let bestScore = -1;
  for (const iron of offerings) {
    const s = scoreIron(playerType, iron);
    if (s > bestScore) { bestScore = s; bestIron = iron; }
  }
  return bestIron;
}
