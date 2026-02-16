// ── Bounty Hunter Simulation — 10 Archetype Behaviors ──

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

// ── Iron preferences per archetype ──
export function ironPriority(playerType) {
  switch (playerType) {
    case 'random_monkey':
      return null; // picks randomly
    case 'cautious_turtle':
      return ['snake_oil', 'thick_skin', 'leather_holster', 'trail_rations', 'lucky_horseshoe',
              'golden_revolver', 'sheriffs_badge', 'ghost_rider', 'steady_hand', 'gold_tooth',
              'bandolier', 'bounty_poster', 'iron_sights', 'deadeye_scope', 'double_barrel'];
    case 'aggro_gambler':
      return ['double_barrel', 'deadeye_scope', 'golden_revolver', 'ghost_rider', 'sheriffs_badge',
              'bounty_poster', 'gold_tooth', 'thick_skin', 'iron_sights', 'lucky_horseshoe',
              'steady_hand', 'leather_holster', 'trail_rations', 'bandolier', 'snake_oil'];
    case 'newbie':
      return ['lucky_horseshoe', 'thick_skin', 'steady_hand', 'trail_rations', 'ghost_rider',
              'gold_tooth', 'leather_holster', 'snake_oil', 'golden_revolver', 'iron_sights',
              'bandolier', 'sheriffs_badge', 'bounty_poster', 'deadeye_scope', 'double_barrel'];
    case 'hot_tilt':
      return ['double_barrel', 'deadeye_scope', 'golden_revolver', 'sheriffs_badge', 'ghost_rider',
              'bounty_poster', 'iron_sights', 'gold_tooth', 'lucky_horseshoe', 'thick_skin',
              'steady_hand', 'leather_holster', 'trail_rations', 'bandolier', 'snake_oil'];
    case 'comeback_grinder':
      return ['thick_skin', 'trail_rations', 'snake_oil', 'leather_holster', 'lucky_horseshoe',
              'ghost_rider', 'gold_tooth', 'golden_revolver', 'sheriffs_badge', 'steady_hand',
              'bandolier', 'iron_sights', 'bounty_poster', 'deadeye_scope', 'double_barrel'];
    case 'optimizer':
      return ['golden_revolver', 'sheriffs_badge', 'ghost_rider', 'double_barrel', 'deadeye_scope',
              'bounty_poster', 'gold_tooth', 'lucky_horseshoe', 'thick_skin', 'iron_sights',
              'trail_rations', 'steady_hand', 'leather_holster', 'bandolier', 'snake_oil'];
    case 'skip_burner':
      return ['bandolier', 'trail_rations', 'gold_tooth', 'lucky_horseshoe', 'thick_skin',
              'golden_revolver', 'ghost_rider', 'iron_sights', 'sheriffs_badge', 'steady_hand',
              'leather_holster', 'bounty_poster', 'deadeye_scope', 'double_barrel', 'snake_oil'];
    case 'streaky_pro':
      return ['golden_revolver', 'ghost_rider', 'sheriffs_badge', 'iron_sights', 'bounty_poster',
              'gold_tooth', 'lucky_horseshoe', 'thick_skin', 'double_barrel', 'deadeye_scope',
              'trail_rations', 'steady_hand', 'leather_holster', 'bandolier', 'snake_oil'];
    case 'conservative_climber':
      return ['sheriffs_badge', 'golden_revolver', 'lucky_horseshoe', 'thick_skin', 'ghost_rider',
              'trail_rations', 'gold_tooth', 'steady_hand', 'leather_holster', 'snake_oil',
              'iron_sights', 'bounty_poster', 'bandolier', 'deadeye_scope', 'double_barrel'];
    default:
      return null;
  }
}

// ── Pick the best Iron from offerings based on archetype preference ──
export function pickIron(playerType, offerings, equipped) {
  const priority = ironPriority(playerType);
  if (!priority) {
    return offerings[Math.floor(Math.random() * offerings.length)];
  }
  for (const id of priority) {
    const match = offerings.find(o => o.id === id);
    if (match) return match;
  }
  return offerings[0];
}
