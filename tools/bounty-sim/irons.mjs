// ── Bounty Hunter Simulation — Iron Definitions & Effects ──

// ── 15 Iron definitions ──
export const IRONS = [
  // Common
  { id: 'steady_hand',     name: 'Steady Hand',     rarity: 'common',   desc: '+3 Draw wins' },
  { id: 'thick_skin',      name: 'Thick Skin',      rarity: 'common',   desc: '-3 all losses' },
  { id: 'lucky_horseshoe', name: 'Lucky Horseshoe', rarity: 'common',   desc: '+5% accuracy' },
  { id: 'trail_rations',   name: 'Trail Rations',   rarity: 'common',   desc: '-$20 ante' },
  { id: 'bandolier',       name: 'Bandolier',       rarity: 'common',   desc: '-30% skip cost' },
  { id: 'leather_holster', name: 'Leather Holster', rarity: 'common',   desc: '+4 holster wins' },
  // Uncommon
  { id: 'iron_sights',     name: 'Iron Sights',     rarity: 'uncommon', desc: '+5 QD wins' },
  { id: 'snake_oil',       name: 'Snake Oil',       rarity: 'uncommon', desc: 'Draw holster losses = 0' },
  { id: 'deadeye_scope',   name: 'Deadeye Scope',   rarity: 'uncommon', desc: '+10% DE accuracy' },
  { id: 'gold_tooth',      name: 'Gold Tooth',      rarity: 'uncommon', desc: '+$50 flat per correct' },
  { id: 'bounty_poster',   name: 'Bounty Poster',   rarity: 'uncommon', desc: '+0.5 notoriety/correct' },
  // Rare
  { id: 'sheriffs_badge',  name: "Sheriff's Badge",  rarity: 'rare',    desc: '+1 wins per wanted lv' },
  { id: 'double_barrel',   name: 'Double Barrel',    rarity: 'rare',    desc: 'DE wins 2x base' },
  { id: 'ghost_rider',     name: 'Ghost Rider',      rarity: 'rare',    desc: '20% miss→correct' },
  { id: 'golden_revolver', name: 'Golden Revolver',  rarity: 'rare',    desc: 'All scoring x1.5' },
];

// ── Rarity weights for offering rolls ──
export const RARITY_WEIGHTS = { common: 50, uncommon: 35, rare: 15 };

// ── Roll 3 unique Irons not already equipped ──
export function rollIronOffering(equipped) {
  const equippedIds = new Set(equipped.map(i => i.id));
  const available = IRONS.filter(i => !equippedIds.has(i.id));
  if (available.length < 3) return available.slice(0, 3);

  const pool = [];
  for (const iron of available) {
    const weight = RARITY_WEIGHTS[iron.rarity];
    for (let i = 0; i < weight; i++) pool.push(iron);
  }

  const picked = [];
  const pickedIds = new Set();
  while (picked.length < 3) {
    const iron = pool[Math.floor(Math.random() * pool.length)];
    if (!pickedIds.has(iron.id)) {
      picked.push(iron);
      pickedIds.add(iron.id);
    }
  }
  return picked;
}

// ── Compute aggregate effects from equipped Irons ──
export function getIronEffects(equipped) {
  const fx = {
    drawWinBonus: 0,
    allLoseReduction: 0,
    accuracyBonus: 0,
    anteReduction: 0,
    skipDiscount: 0,
    holsterWinBonus: 0,
    qdWinBonus: 0,
    snakeOil: false,
    deAccuracyBonus: 0,
    flatCashPerCorrect: 0,
    notorietyBonus: 0,
    perLevelWinBonus: 0,
    deWinMultiplier: 1,
    ghostChance: 0,
    scoreMultiplier: 1,
  };

  for (const iron of equipped) {
    switch (iron.id) {
      case 'steady_hand':     fx.drawWinBonus += 3; break;
      case 'thick_skin':      fx.allLoseReduction += 3; break;
      case 'lucky_horseshoe': fx.accuracyBonus += 0.05; break;
      case 'trail_rations':   fx.anteReduction += 20; break;
      case 'bandolier':       fx.skipDiscount += 0.30; break;
      case 'leather_holster': fx.holsterWinBonus += 4; break;
      case 'iron_sights':     fx.qdWinBonus += 5; break;
      case 'snake_oil':       fx.snakeOil = true; break;
      case 'deadeye_scope':   fx.deAccuracyBonus += 0.10; break;
      case 'gold_tooth':      fx.flatCashPerCorrect += 50; break;
      case 'bounty_poster':   fx.notorietyBonus += 0.5; break;
      case 'sheriffs_badge':  fx.perLevelWinBonus += 1; break;
      case 'double_barrel':   fx.deWinMultiplier *= 2; break;
      case 'ghost_rider':     fx.ghostChance = Math.min(1, fx.ghostChance + 0.20); break;
      case 'golden_revolver': fx.scoreMultiplier *= 1.5; break;
    }
  }
  return fx;
}

// ── Equip an Iron into chambers (replace oldest if full) ──
export function equipIron(equipped, newIron, maxChambers) {
  if (equipped.length < maxChambers) {
    return [...equipped, newIron];
  }
  return [...equipped.slice(1), newIron];
}
