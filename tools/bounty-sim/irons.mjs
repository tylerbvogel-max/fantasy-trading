// ── Bounty Hunter Simulation — 75 Iron Definitions & Effects ──

// ── Iron definitions ──
export const IRONS = [
  // ── Common (28) ──
  { id: 'steady_hand',     name: 'Steady Hand',     rarity: 'common',    desc: '+3 Draw wins' },
  { id: 'thick_skin',      name: 'Thick Skin',      rarity: 'common',    desc: '-3 all losses' },
  { id: 'lucky_horseshoe', name: 'Lucky Horseshoe', rarity: 'common',    desc: '+5% accuracy' },
  { id: 'trail_rations',   name: 'Trail Rations',   rarity: 'common',    desc: '-$20 ante' },
  { id: 'bandolier',       name: 'Bandolier',       rarity: 'common',    desc: '-30% skip cost' },
  { id: 'leather_holster', name: 'Leather Holster', rarity: 'common',    desc: '+4 holster wins' },
  { id: 'tin_star',        name: 'Tin Star',        rarity: 'common',    desc: '+2 directional wins' },
  { id: 'pocket_watch',    name: 'Pocket Watch',    rarity: 'common',    desc: '+3 QD wins' },
  { id: 'canteen',         name: 'Canteen',         rarity: 'common',    desc: '+$30/round income' },
  { id: 'worn_boots',      name: 'Worn Boots',      rarity: 'common',    desc: '+1 win per round survived' },
  { id: 'rusty_spurs',     name: 'Rusty Spurs',     rarity: 'common',    desc: '+8 wins at wanted ≤2' },
  { id: 'campfire',        name: 'Campfire',        rarity: 'common',    desc: '-2 holster losses' },
  { id: 'whiskey_flask',   name: 'Whiskey Flask',   rarity: 'common',    desc: '+6 wins on 1st pick/round' },
  { id: 'rope_lasso',      name: 'Rope Lasso',      rarity: 'common',    desc: '+8% holster accuracy' },
  { id: 'chaps',           name: 'Chaps',           rarity: 'common',    desc: '-1 directional losses' },
  { id: 'six_shooter',     name: 'Six-Shooter',     rarity: 'common',    desc: 'Every 6th correct: +$150' },
  { id: 'cowbell',         name: 'Cowbell',         rarity: 'common',    desc: '+0.5 notoriety/round' },
  { id: 'hay_bale',        name: 'Hay Bale',        rarity: 'common',    desc: '+$40 on correct holster' },
  { id: 'branding_iron',   name: 'Branding Iron',   rarity: 'common',    desc: '+4 RISE wins' },
  { id: 'cattle_prod',     name: 'Cattle Prod',     rarity: 'common',    desc: '+4 FALL wins' },
  { id: 'scouts_compass',  name: "Scout's Compass", rarity: 'common',    desc: '+5% acc on 1st pick/round' },
  { id: 'rattlesnake_skin',name: 'Rattlesnake Skin',rarity: 'common',    desc: '-20% skip cost' },
  { id: 'saddlebag',       name: 'Saddlebag',       rarity: 'common',    desc: '+$15 flat per pick' },
  { id: 'dust_devil',      name: 'Dust Devil',      rarity: 'common',    desc: '+5 wins after a skip' },
  { id: 'water_trough',    name: 'Water Trough',    rarity: 'common',    desc: 'Losses halved if bal <$2k' },
  { id: 'copper_ring',     name: 'Copper Ring',     rarity: 'common',    desc: '+0.5 notor/correct dir' },
  { id: 'horseshoe_nail',  name: 'Horseshoe Nail',  rarity: 'common',    desc: '+2% acc per iron equipped' },
  { id: 'tenderfoot',      name: 'Tenderfoot',      rarity: 'common',    desc: '+5 wins when round acc <50%' },

  // ── Uncommon (22) ──
  { id: 'iron_sights',     name: 'Iron Sights',     rarity: 'uncommon',  desc: '+5 QD wins' },
  { id: 'snake_oil',       name: 'Snake Oil',       rarity: 'uncommon',  desc: 'Draw holster losses = 0' },
  { id: 'deadeye_scope',   name: 'Deadeye Scope',   rarity: 'uncommon',  desc: '+10% DE accuracy' },
  { id: 'gold_tooth',      name: 'Gold Tooth',      rarity: 'uncommon',  desc: '+$50 flat per correct' },
  { id: 'bounty_poster',   name: 'Bounty Poster',   rarity: 'uncommon',  desc: '+0.5 notoriety/correct' },
  { id: 'silver_bullet',   name: 'Silver Bullet',   rarity: 'uncommon',  desc: '+10 wins at wanted ≥5' },
  { id: 'saloon_door',     name: 'Saloon Door',     rarity: 'uncommon',  desc: '1st bust/run: survive w/$500' },
  { id: 'fools_gold',      name: "Fool's Gold",     rarity: 'uncommon',  desc: '+$150/round, ante +$25' },
  { id: 'war_paint',       name: 'War Paint',       rarity: 'uncommon',  desc: '+6 wins when notor negative' },
  { id: 'smoke_bomb',      name: 'Smoke Bomb',      rarity: 'uncommon',  desc: '1st loss/round halved' },
  { id: 'panning_kit',     name: 'Panning Kit',     rarity: 'uncommon',  desc: '+$20/round per iron equipped' },
  { id: 'horse_thief',     name: 'Horse Thief',     rarity: 'uncommon',  desc: 'Recover 15% of ante' },
  { id: 'moonshine',       name: 'Moonshine',       rarity: 'uncommon',  desc: 'Wins +40%, losses +20%' },
  { id: 'telegraph',       name: 'Telegraph',       rarity: 'uncommon',  desc: '+8% acc repeating direction' },
  { id: 'prospectors_pick',name: "Prospector's Pick",rarity: 'uncommon', desc: '+$75/round if bal >$10k' },
  { id: 'twin_revolvers',  name: 'Twin Revolvers',  rarity: 'uncommon',  desc: 'QD uses DE win values' },
  { id: 'dynamite',        name: 'Dynamite',        rarity: 'uncommon',  desc: '+20 all wins, -5% accuracy' },
  { id: 'medicine_bag',    name: 'Medicine Bag',     rarity: 'uncommon',  desc: '+$50/round if bal < start' },
  { id: 'war_drum',        name: 'War Drum',        rarity: 'uncommon',  desc: 'After 2 correct: +5 wins' },
  { id: 'coyote_howl',     name: 'Coyote Howl',     rarity: 'uncommon',  desc: 'Start at wanted level 2' },
  { id: 'marked_cards',    name: 'Marked Cards',    rarity: 'uncommon',  desc: 'After miss: +12% acc next' },
  { id: 'rattlesnake_venom',name:'Rattlesnake Venom',rarity:'uncommon',  desc: '-0.5 opp notoriety (PvP)' },

  // ── Rare (15) ──
  { id: 'sheriffs_badge',  name: "Sheriff's Badge",  rarity: 'rare',     desc: '+1 wins per wanted lv' },
  { id: 'double_barrel',   name: 'Double Barrel',    rarity: 'rare',     desc: 'DE dir wins ×2 base' },
  { id: 'ghost_rider',     name: 'Ghost Rider',      rarity: 'rare',     desc: '20% miss→correct' },
  { id: 'golden_revolver', name: 'Golden Revolver',  rarity: 'rare',     desc: 'All scoring ×1.5' },
  { id: 'blood_oath',      name: 'Blood Oath',       rarity: 'rare',     desc: 'All scoring ×2, ante ×2' },
  { id: 'bounty_mark',     name: "Bounty Hunter's Mark",rarity:'rare',   desc: '+$25/wanted lv/round' },
  { id: 'gatling_gun',     name: 'Gatling Gun',      rarity: 'rare',     desc: 'Correct DE: score twice' },
  { id: 'stagecoach',      name: 'Stagecoach',       rarity: 'rare',     desc: '+1 chamber slot' },
  { id: 'phoenix_feather', name: 'Phoenix Feather',   rarity: 'rare',    desc: 'On bust: revive at $1k' },
  { id: 'outlaws_legacy',  name: "Outlaw's Legacy",   rarity: 'rare',    desc: 'Notor up threshold -1' },
  { id: 'diamond_spurs',   name: 'Diamond Spurs',     rarity: 'rare',    desc: 'Holster scoring ×1.5' },
  { id: 'midnight_oil',    name: 'Midnight Oil',      rarity: 'rare',    desc: '+1 pick per round' },
  { id: 'platinum_tooth',  name: 'Platinum Tooth',    rarity: 'rare',    desc: '+$100 flat per correct' },
  { id: 'tombstone_ace',   name: 'Tombstone Ace',     rarity: 'rare',    desc: 'Wrong DE: 25% score correct' },
  { id: 'thunderclap',     name: 'Thunderclap',       rarity: 'rare',    desc: '+$500 on level up' },

  // ── Legendary (10) ──
  { id: 'peacemaker',      name: 'The Peacemaker',    rarity: 'legendary',desc: 'All picks use DE win vals' },
  { id: 'wanted_doa',      name: 'Wanted: Dead or Alive',rarity:'legendary',desc:'Wanted never decreases' },
  { id: 'gold_rush',       name: 'Gold Rush',         rarity: 'legendary',desc: 'Gains ×2, losses ×2' },
  { id: 'ace_of_spades',   name: 'The Ace of Spades', rarity: 'legendary',desc: 'Every 5th pick auto-correct' },
  { id: 'manifest_destiny',name: 'Manifest Destiny',  rarity: 'legendary',desc: 'Mult reads +2 levels' },
  { id: 'lone_ranger',     name: 'The Lone Ranger',   rarity: 'legendary',desc: '1 iron equipped: effects ×3' },
  { id: 'lady_luck',       name: 'Lady Luck',         rarity: 'legendary',desc: '30% miss→correct' },
  { id: 'el_dorado',       name: 'El Dorado',         rarity: 'legendary',desc: '+$500/round, +$50 more/round' },
  { id: 'dead_mans_hand',  name: "Dead Man's Hand",   rarity: 'legendary',desc: 'On bust: 50% peak as score' },
  { id: 'high_noon',       name: 'High Noon',         rarity: 'legendary',desc: '1/round: auto-correct, next auto-wrong' },
];

// ── Rarity weights for offering rolls ──
export const RARITY_WEIGHTS = { common: 45, uncommon: 30, rare: 18, legendary: 7 };

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
    // Win value bonuses
    drawWinBonus: 0,          // Steady Hand
    qdWinBonus: 0,            // Pocket Watch, Iron Sights
    dirWinBonus: 0,           // Tin Star
    holsterWinBonus: 0,       // Leather Holster
    riseWinBonus: 0,          // Branding Iron
    fallWinBonus: 0,          // Cattle Prod
    firstPickWinBonus: 0,     // Whiskey Flask
    postSkipWinBonus: 0,      // Dust Devil
    perLevelWinBonus: 0,      // Sheriff's Badge
    highLevelWinBonus: 0,     // Silver Bullet (wanted ≥ 5)
    lowLevelWinBonus: 0,      // Rusty Spurs (wanted ≤ 2)
    negNotorietyWinBonus: 0,  // War Paint
    lowAccuracyWinBonus: 0,   // Tenderfoot
    warDrumBonus: 0,          // War Drum (after 2 correct in round)
    dynamiteWinBonus: 0,      // Dynamite
    wornBootsPerRound: 0,     // Worn Boots (+1/round survived)

    // Loss value reductions
    allLoseReduction: 0,      // Thick Skin
    holsterLoseReduction: 0,  // Campfire
    dirLoseReduction: 0,      // Chaps
    snakeOil: false,          // Snake Oil
    smokeBomb: false,         // Smoke Bomb
    lowBalanceLossHalved: false, // Water Trough

    // Score multipliers
    scoreMultiplier: 1,       // Golden Revolver, Blood Oath
    deWinMultiplier: 1,       // Double Barrel
    holsterScoreMult: 1,      // Diamond Spurs
    moonshineWinMult: 1,      // Moonshine (win side)
    moonshineLoseMult: 1,     // Moonshine (loss side)
    goldRush: false,          // Gold Rush (gains×2, losses×2)

    // Accuracy
    accuracyBonus: 0,         // Lucky Horseshoe
    deAccuracyBonus: 0,       // Deadeye Scope
    holsterAccuracyBonus: 0,  // Rope Lasso
    firstPickAccuracyBonus: 0,// Scout's Compass
    accuracyPerIron: 0,       // Horseshoe Nail
    repeatDirAccuracy: 0,     // Telegraph
    markedCardsAccuracy: 0,   // Marked Cards
    dynamiteAccuracyPenalty: 0,// Dynamite

    // Miss → correct
    ghostChance: 0,           // Ghost Rider, Lady Luck
    tombstoneAceChance: 0,    // Tombstone Ace (DE only)
    aceOfSpadesInterval: 0,   // Ace of Spades (every Nth pick)
    highNoon: false,          // High Noon

    // Economy
    anteReduction: 0,         // Trail Rations
    antePenalty: 0,           // Fool's Gold
    anteMultiplier: 1,        // Blood Oath
    skipDiscount: 0,          // Bandolier, Rattlesnake Skin
    flatCashPerCorrect: 0,    // Gold Tooth, Platinum Tooth
    flatPerPick: 0,           // Saddlebag
    roundIncome: 0,           // Canteen
    foolsGoldIncome: 0,       // Fool's Gold
    incomePerIron: 0,         // Panning Kit
    highBalanceIncome: 0,     // Prospector's Pick
    lowBalanceIncome: 0,      // Medicine Bag
    holsterCorrectBonus: 0,   // Hay Bale
    sixShooterInterval: 0,    // Six-Shooter (0 = disabled)
    sixShooterBonus: 0,       // Six-Shooter
    bountyMarkIncome: 0,      // Bounty Hunter's Mark
    thunderclapBonus: 0,      // Thunderclap
    elDoradoBase: 0,          // El Dorado
    elDoradoIncrement: 0,     // El Dorado
    anteRecoveryPct: 0,       // Horse Thief

    // Notoriety
    notorietyBonus: 0,        // Bounty Poster
    flatNotorietyPerRound: 0, // Cowbell
    dirNotorietyBonus: 0,     // Copper Ring
    outlawLegacy: 0,          // Outlaw's Legacy

    // Structural
    extraChambers: 0,         // Stagecoach
    extraPicks: 0,            // Midnight Oil
    startingLevelBonus: 0,    // Coyote Howl

    // Special mechanics
    twinRevolvers: false,     // Twin Revolvers (QD uses DE wins)
    peacemaker: false,        // The Peacemaker (all use DE wins)
    wantedNeverDecrease: false,// Wanted: Dead or Alive
    loneRanger: false,        // The Lone Ranger
    manifestDestiny: 0,       // Manifest Destiny (+2 level offset)
    phoenixFeather: false,    // Phoenix Feather
    saloonDoor: false,        // Saloon Door
    deadMansHand: false,      // Dead Man's Hand
    gatlingGun: false,        // Gatling Gun
  };

  for (const iron of equipped) {
    switch (iron.id) {
      // Common
      case 'steady_hand':     fx.drawWinBonus += 3; break;
      case 'thick_skin':      fx.allLoseReduction += 3; break;
      case 'lucky_horseshoe': fx.accuracyBonus += 0.05; break;
      case 'trail_rations':   fx.anteReduction += 20; break;
      case 'bandolier':       fx.skipDiscount += 0.30; break;
      case 'leather_holster': fx.holsterWinBonus += 4; break;
      case 'tin_star':        fx.dirWinBonus += 2; break;
      case 'pocket_watch':    fx.qdWinBonus += 3; break;
      case 'canteen':         fx.roundIncome += 30; break;
      case 'worn_boots':      fx.wornBootsPerRound += 1; break;
      case 'rusty_spurs':     fx.lowLevelWinBonus += 8; break;
      case 'campfire':        fx.holsterLoseReduction += 2; break;
      case 'whiskey_flask':   fx.firstPickWinBonus += 6; break;
      case 'rope_lasso':      fx.holsterAccuracyBonus += 0.08; break;
      case 'chaps':           fx.dirLoseReduction += 1; break;
      case 'six_shooter':     fx.sixShooterInterval = 6; fx.sixShooterBonus += 150; break;
      case 'cowbell':         fx.flatNotorietyPerRound += 0.5; break;
      case 'hay_bale':        fx.holsterCorrectBonus += 40; break;
      case 'branding_iron':   fx.riseWinBonus += 4; break;
      case 'cattle_prod':     fx.fallWinBonus += 4; break;
      case 'scouts_compass':  fx.firstPickAccuracyBonus += 0.05; break;
      case 'rattlesnake_skin':fx.skipDiscount += 0.20; break;
      case 'saddlebag':       fx.flatPerPick += 15; break;
      case 'dust_devil':      fx.postSkipWinBonus += 5; break;
      case 'water_trough':    fx.lowBalanceLossHalved = true; break;
      case 'copper_ring':     fx.dirNotorietyBonus += 0.5; break;
      case 'horseshoe_nail':  fx.accuracyPerIron += 0.02; break;
      case 'tenderfoot':      fx.lowAccuracyWinBonus += 5; break;

      // Uncommon
      case 'iron_sights':     fx.qdWinBonus += 5; break;
      case 'snake_oil':       fx.snakeOil = true; break;
      case 'deadeye_scope':   fx.deAccuracyBonus += 0.10; break;
      case 'gold_tooth':      fx.flatCashPerCorrect += 50; break;
      case 'bounty_poster':   fx.notorietyBonus += 0.5; break;
      case 'silver_bullet':   fx.highLevelWinBonus += 10; break;
      case 'saloon_door':     fx.saloonDoor = true; break;
      case 'fools_gold':      fx.foolsGoldIncome += 150; fx.antePenalty += 25; break;
      case 'war_paint':       fx.negNotorietyWinBonus += 6; break;
      case 'smoke_bomb':      fx.smokeBomb = true; break;
      case 'panning_kit':     fx.incomePerIron += 20; break;
      case 'horse_thief':     fx.anteRecoveryPct += 0.15; break;
      case 'moonshine':       fx.moonshineWinMult = 1.4; fx.moonshineLoseMult = 1.2; break;
      case 'telegraph':       fx.repeatDirAccuracy += 0.08; break;
      case 'prospectors_pick':fx.highBalanceIncome += 75; break;
      case 'twin_revolvers':  fx.twinRevolvers = true; break;
      case 'dynamite':        fx.dynamiteWinBonus += 20; fx.dynamiteAccuracyPenalty += 0.05; break;
      case 'medicine_bag':    fx.lowBalanceIncome += 50; break;
      case 'war_drum':        fx.warDrumBonus += 5; break;
      case 'coyote_howl':     fx.startingLevelBonus += 1; break;
      case 'marked_cards':    fx.markedCardsAccuracy += 0.12; break;
      case 'rattlesnake_venom': break; // PvP future — no-op in sim

      // Rare
      case 'sheriffs_badge':  fx.perLevelWinBonus += 1; break;
      case 'double_barrel':   fx.deWinMultiplier *= 2; break;
      case 'ghost_rider':     fx.ghostChance = Math.min(1, fx.ghostChance + 0.20); break;
      case 'golden_revolver': fx.scoreMultiplier *= 1.5; break;
      case 'blood_oath':      fx.scoreMultiplier *= 2; fx.anteMultiplier *= 2; break;
      case 'bounty_mark':     fx.bountyMarkIncome += 25; break;
      case 'gatling_gun':     fx.gatlingGun = true; break;
      case 'stagecoach':      fx.extraChambers += 1; break;
      case 'phoenix_feather': fx.phoenixFeather = true; break;
      case 'outlaws_legacy':  fx.outlawLegacy += 1; break;
      case 'diamond_spurs':   fx.holsterScoreMult *= 1.5; break;
      case 'midnight_oil':    fx.extraPicks += 1; break;
      case 'platinum_tooth':  fx.flatCashPerCorrect += 100; break;
      case 'tombstone_ace':   fx.tombstoneAceChance += 0.25; break;
      case 'thunderclap':     fx.thunderclapBonus += 500; break;

      // Legendary
      case 'peacemaker':      fx.peacemaker = true; break;
      case 'wanted_doa':      fx.wantedNeverDecrease = true; break;
      case 'gold_rush':       fx.goldRush = true; break;
      case 'ace_of_spades':   fx.aceOfSpadesInterval = 5; break;
      case 'manifest_destiny':fx.manifestDestiny += 2; break;
      case 'lone_ranger':     fx.loneRanger = true; break;
      case 'lady_luck':       fx.ghostChance = Math.min(1, fx.ghostChance + 0.30); break;
      case 'el_dorado':       fx.elDoradoBase += 500; fx.elDoradoIncrement += 50; break;
      case 'dead_mans_hand':  fx.deadMansHand = true; break;
      case 'high_noon':       fx.highNoon = true; break;
    }
  }

  // Lone Ranger: triple all numeric effects if exactly 1 iron
  if (fx.loneRanger && equipped.length === 1) {
    for (const key of Object.keys(fx)) {
      if (typeof fx[key] === 'number' && key !== 'scoreMultiplier' && key !== 'deWinMultiplier'
          && key !== 'holsterScoreMult' && key !== 'anteMultiplier' && key !== 'moonshineWinMult'
          && key !== 'moonshineLoseMult') {
        fx[key] *= 3;
      }
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
