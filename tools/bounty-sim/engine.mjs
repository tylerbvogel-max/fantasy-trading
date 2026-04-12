// ── Bounty Hunter Simulation — Core Engine (75-Iron Edition) ──

import {
  PICKS_PER_ROUND, STARTING_BALANCE, NUM_ROUNDS, STARTING_CHAMBERS, MAX_CHAMBERS,
  DIR_SCORING, HOL_SCORING, NOTORIETY_WEIGHT,
  NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
  wantedMultiplier, skipCost, windowAnte,
  CONDITION_PROBABILITY, RANDOM_MARKET_CONDITIONS, CONDITION_DEFS,
  HIGH_NOON_SCORING_MULT, HIGH_NOON_NOTORIETY_WIN, HIGH_NOON_NOTORIETY_LOSE,
} from './config.mjs';
import { rollIronOffering, getIronEffects, equipIron } from './irons.mjs';
import { getPlayerAction, getAccuracy, pickIron } from './archetypes.mjs';

// ── Factory: create engine bound to specific module instances ──
// Used by watch mode to pass freshly re-imported modules.
export function createEngine(configMod, ironsMod, archetypesMod) {
  function _simulateRun(playerType, opts = {}) {
    return _runCore(playerType, configMod, ironsMod, archetypesMod, opts, false);
  }
  function _simulateRunTracked(playerType, opts = {}) {
    return _runCore(playerType, configMod, ironsMod, archetypesMod, opts, true);
  }
  return { simulateRun: _simulateRun, simulateRunTracked: _simulateRunTracked };
}

// ── Simulate a single pick within a round ──
// pickState carries per-round and per-run stateful iron tracking.
function doSimulatePick(player, state, fx, pickState, cfg) {
  let { balance, wantedLevel, roundNum, picksThisRound, skipCount, roundNotoriety } = state;
  const effectiveLevel = Math.max(1, wantedLevel + (fx.manifestDestiny || 0));
  const mult = cfg.wantedMultiplier(effectiveLevel);
  const equippedCount = pickState.equippedCount || 0;

  const action = pickState.getPlayerAction(player, {
    balance, wantedLevel, roundNum, pickInRound: picksThisRound,
  });

  // ── Skip ──
  if (action.action === 'skip') {
    let cost = cfg.skipCost(skipCount + 1, balance);
    cost = Math.ceil(cost * (1 - Math.min(fx.skipDiscount, 0.95)));
    if (balance >= cost) { balance -= cost; skipCount++; }
    pickState.lastWasSkip = true;
    return { balance, roundNotoriety, picksThisRound, skipCount, picked: false };
  }

  // ── Determine accuracy ──
  let accuracy = pickState.getAccuracy(player, {
    balance, wantedLevel, roundNum, pickInRound: picksThisRound,
  });
  accuracy += fx.accuracyBonus;
  accuracy += fx.accuracyPerIron * equippedCount;
  accuracy -= fx.dynamiteAccuracyPenalty;

  const isHolster = action.action === 'holster';
  const isDE = action.confidence === 3;
  const isDir = !isHolster;
  const direction = action.action; // 'rise', 'fall', or 'holster'

  if (isDE) accuracy += fx.deAccuracyBonus;
  if (isHolster) accuracy += fx.holsterAccuracyBonus;
  if (picksThisRound === 0) accuracy += fx.firstPickAccuracyBonus;
  if (fx.repeatDirAccuracy > 0 && isDir && pickState.lastDirection === direction) {
    accuracy += fx.repeatDirAccuracy;
  }
  if (fx.markedCardsAccuracy > 0 && pickState.markedCardsActive) {
    accuracy += fx.markedCardsAccuracy;
  }
  accuracy = Math.max(0.05, Math.min(0.95, accuracy));

  // ── Determine correctness ──
  let isCorrect;
  if (isHolster) {
    const holsterRate = 0.68 + (accuracy - 0.50) * 0.3;
    isCorrect = Math.random() < holsterRate;
  } else {
    isCorrect = Math.random() < accuracy;
  }

  // Ace of Spades: every Nth pick is automatically correct
  if (fx.aceOfSpadesInterval > 0) {
    pickState.aceOfSpadesCounter = (pickState.aceOfSpadesCounter || 0) + 1;
    if (pickState.aceOfSpadesCounter >= fx.aceOfSpadesInterval) {
      isCorrect = true;
      pickState.aceOfSpadesCounter = 0;
    }
  }

  // High Noon: once per round, one guaranteed correct then next guaranteed wrong
  if (fx.highNoon && !pickState.highNoonUsed) {
    isCorrect = true;
    pickState.highNoonUsed = true;
    pickState.highNoonPenalty = true;
  } else if (pickState.highNoonPenalty) {
    isCorrect = false;
    pickState.highNoonPenalty = false;
  }

  // Ghost Rider / Lady Luck: miss → correct flip
  if (!isCorrect && fx.ghostChance > 0 && Math.random() < fx.ghostChance) {
    isCorrect = true;
  }

  // Tombstone Ace: wrong DE picks have 25% chance to score as correct
  let tombstoneFlip = false;
  if (!isCorrect && isDE && fx.tombstoneAceChance > 0 && Math.random() < fx.tombstoneAceChance) {
    tombstoneFlip = true; // scores as correct but notoriety still counts as wrong
  }

  // ── Calculate win/loss values ──
  let confForScoring = action.confidence;
  // Twin Revolvers: QD uses DE win values
  if (fx.twinRevolvers && confForScoring === 2) confForScoring = 3;
  // Peacemaker: all use DE win values
  if (fx.peacemaker) confForScoring = 3;

  const scoring = isHolster ? cfg.HOL_SCORING[confForScoring] : cfg.DIR_SCORING[confForScoring];
  let winVal = scoring.win;
  let loseVal = scoring.lose;

  // Confidence-specific bonuses
  if (action.confidence === 1) winVal += fx.drawWinBonus;
  if (action.confidence === 2) winVal += fx.qdWinBonus;

  // Type-specific bonuses
  if (isHolster) winVal += fx.holsterWinBonus;
  if (isDir) winVal += fx.dirWinBonus;
  if (direction === 'rise') winVal += fx.riseWinBonus;
  if (direction === 'fall') winVal += fx.fallWinBonus;

  // Contextual bonuses
  winVal += fx.perLevelWinBonus * wantedLevel;
  if (wantedLevel >= 5) winVal += fx.highLevelWinBonus;
  if (wantedLevel <= 2) winVal += fx.lowLevelWinBonus;
  if (picksThisRound === 0) winVal += fx.firstPickWinBonus;
  if (pickState.lastWasSkip) winVal += fx.postSkipWinBonus;
  if (roundNotoriety < 0) winVal += fx.negNotorietyWinBonus;
  if (fx.lowAccuracyWinBonus > 0 && pickState.roundAccNum > 0 && (pickState.roundCorrect / pickState.roundAccNum) < 0.5) {
    winVal += fx.lowAccuracyWinBonus;
  }
  if (fx.warDrumBonus > 0 && pickState.correctThisRound >= 2) winVal += fx.warDrumBonus;
  winVal += fx.dynamiteWinBonus;
  winVal += fx.wornBootsPerRound * roundNum;

  // DE directional multiplier (Double Barrel)
  if (isDE && isDir && fx.deWinMultiplier > 1) {
    winVal = Math.round(winVal * fx.deWinMultiplier);
  }

  // Moonshine win multiplier
  if (fx.moonshineWinMult > 1) winVal = Math.round(winVal * fx.moonshineWinMult);

  // ── Loss reductions ──
  loseVal = Math.max(0, loseVal - fx.allLoseReduction);
  if (isHolster) loseVal = Math.max(0, loseVal - fx.holsterLoseReduction);
  if (isDir) loseVal = Math.max(0, loseVal - fx.dirLoseReduction);
  if (fx.snakeOil && isHolster && action.confidence === 1) loseVal = 0;

  // Moonshine loss multiplier
  if (fx.moonshineLoseMult > 1) loseVal = Math.round(loseVal * fx.moonshineLoseMult);

  // Smoke Bomb: first loss each round reduced by 50%
  if (fx.smokeBomb && !isCorrect && !tombstoneFlip && !pickState.firstLossApplied) {
    loseVal = Math.round(loseVal * 0.5);
    pickState.firstLossApplied = true;
  }

  // Water Trough: losses halved if balance < $2000
  if (fx.lowBalanceLossHalved && balance < 2000 && !isCorrect && !tombstoneFlip) {
    loseVal = Math.round(loseVal * 0.5);
  }

  // ── Compute scaled points ──
  const effectiveCorrect = isCorrect || tombstoneFlip;
  const basePoints = effectiveCorrect ? winVal : -loseVal;
  // Loss multiplier cap: if configured, losses use a dampened multiplier
  const effectiveMult = (basePoints < 0 && cfg.LOSS_MULT_CAP)
    ? Math.min(mult, cfg.LOSS_MULT_CAP)
    : mult;
  let scaledPoints = Math.round(basePoints * effectiveMult * fx.scoreMultiplier);

  // Holster score multiplier (Diamond Spurs)
  if (isHolster && fx.holsterScoreMult > 1) {
    scaledPoints = Math.round(scaledPoints * fx.holsterScoreMult);
  }

  // Gatling Gun: correct DE picks score twice
  if (fx.gatlingGun && effectiveCorrect && isDE) {
    scaledPoints *= 2;
  }

  // Gold Rush: gains ×2, losses ×2
  if (fx.goldRush) {
    scaledPoints = scaledPoints >= 0 ? scaledPoints * 2 : scaledPoints * 2;
  }

  // Flat cash bonus (unscaled)
  if (effectiveCorrect && fx.flatCashPerCorrect > 0) {
    scaledPoints += fx.flatCashPerCorrect;
  }

  // Saddlebag: flat per pick (win or lose)
  if (fx.flatPerPick > 0) scaledPoints += fx.flatPerPick;

  // Hay Bale: bonus on correct holster
  if (effectiveCorrect && isHolster && fx.holsterCorrectBonus > 0) {
    scaledPoints += fx.holsterCorrectBonus;
  }

  // ── Condition effects ──
  const cond = pickState.conditionEffects;
  if (cond) {
    // Score multiplier (volatility_surge, fed_tension)
    if (cond.score_multiplier) scaledPoints = Math.round(scaledPoints * cond.score_multiplier);
    // Directional win bonus (momentum_day)
    if (effectiveCorrect && isDir && cond.dir_win_bonus) scaledPoints += cond.dir_win_bonus * effectiveMult;
    // Fall win bonus (bear_raid)
    if (effectiveCorrect && direction === 'fall' && cond.fall_win_bonus) scaledPoints += cond.fall_win_bonus * effectiveMult;
    // Loss amplification (fed_tension)
    if (!effectiveCorrect && scaledPoints < 0 && cond.all_lose_multiplier) {
      scaledPoints = Math.round(scaledPoints * cond.all_lose_multiplier);
    }
  }

  balance += scaledPoints;

  // ── Six-Shooter: every Nth correct pick gives bonus ──
  if (effectiveCorrect && fx.sixShooterInterval > 0) {
    pickState.sixShooterCount = (pickState.sixShooterCount || 0) + 1;
    if (pickState.sixShooterCount >= fx.sixShooterInterval) {
      balance += fx.sixShooterBonus;
      pickState.sixShooterCount = 0;
    }
  }

  // ── Notoriety ──
  const notorietySign = isCorrect ? 1 : -(cfg.NOTORIETY_LOSS_WEIGHT || 1);
  let notorietyDelta = cfg.NOTORIETY_WEIGHT[action.confidence] * notorietySign;
  if (isCorrect && fx.notorietyBonus > 0) notorietyDelta += fx.notorietyBonus;
  if (isCorrect && isDir && fx.dirNotorietyBonus > 0) notorietyDelta += fx.dirNotorietyBonus;
  roundNotoriety += notorietyDelta;

  // ── Update pick state tracking ──
  player.totalPicks++;
  picksThisRound++;
  if (isCorrect) pickState.correctThisRound = (pickState.correctThisRound || 0) + 1;
  pickState.roundCorrect = (pickState.roundCorrect || 0) + (isCorrect ? 1 : 0);
  pickState.roundAccNum = (pickState.roundAccNum || 0) + 1;
  pickState.markedCardsActive = !isCorrect && fx.markedCardsAccuracy > 0;
  pickState.lastWasSkip = false;
  if (isDir) pickState.lastDirection = direction;

  return { balance, roundNotoriety, picksThisRound, skipCount, picked: true };
}

// ── Core run logic shared by both stats-only and tracked modes ──
function _runCore(playerType, cfg, ironsMod, archetypesMod, opts, tracked) {
  const numRounds = opts.numRounds || cfg.NUM_ROUNDS;
  const basePicks = opts.picksPerRound || cfg.PICKS_PER_ROUND;
  const startBalance = cfg.STARTING_BALANCE;

  const player = { type: playerType, totalPicks: 0 };
  let balance = startBalance;
  let wantedLevel = 1;
  let peakBalance = balance;
  let peakWanted = 1;
  let roundsSurvived = 0;
  let equipped = [];
  let chambers = cfg.STARTING_CHAMBERS;
  let ironsCollected = 0;
  let phoenixUsed = false;
  let saloonUsed = false;

  const balanceHistory = tracked ? [balance] : null;
  const wantedHistory = tracked ? [wantedLevel] : null;

  // Helper: handle bust with protection irons
  function handleBust(round) {
    const fx = ironsMod.getIronEffects(equipped);
    // Saloon Door: first bust survive with $500
    if (fx.saloonDoor && !saloonUsed) {
      saloonUsed = true;
      balance = 500;
      return false; // not busted
    }
    // Phoenix Feather: revive at $1000 keeping irons
    if (fx.phoenixFeather && !phoenixUsed) {
      phoenixUsed = true;
      balance = 1000;
      return false;
    }
    // Dead Man's Hand: cash out 50% of peak balance
    if (fx.deadMansHand) {
      balance = Math.round(peakBalance * 0.5);
      if (tracked) {
        balanceHistory.push(balance);
        wantedHistory.push(wantedLevel);
        for (let r = round + 2; r <= numRounds; r++) {
          balanceHistory.push(balance); wantedHistory.push(wantedLevel);
        }
      }
      return 'dead_mans_hand'; // special bust — scored at 50% peak
    }
    return true; // truly busted
  }

  function fillHistory(round) {
    if (!tracked) return;
    balanceHistory.push(balance); wantedHistory.push(wantedLevel);
    for (let r = round + 2; r <= numRounds; r++) {
      balanceHistory.push(balance); wantedHistory.push(wantedLevel);
    }
  }

  // Apply starting level bonus (Coyote Howl)
  const initFx = ironsMod.getIronEffects(equipped);
  if (initFx.startingLevelBonus > 0) wantedLevel += initFx.startingLevelBonus;

  for (let round = 0; round < numRounds; round++) {
    const fx = ironsMod.getIronEffects(equipped);
    const picksPerRound = basePicks + fx.extraPicks;

    // Adjust chambers for Stagecoach
    chambers = Math.min(cfg.STARTING_CHAMBERS + fx.extraChambers, cfg.MAX_CHAMBERS || 6);

    // ── Round income ──
    let income = fx.roundIncome + fx.foolsGoldIncome;
    income += fx.incomePerIron * equipped.length;
    if (balance > 10000) income += fx.highBalanceIncome;
    if (balance < startBalance) income += fx.lowBalanceIncome;
    income += fx.bountyMarkIncome * wantedLevel;
    if (fx.elDoradoBase > 0) income += fx.elDoradoBase + fx.elDoradoIncrement * round;
    income += fx.flatNotorietyPerRound * 0; // notoriety handled separately
    balance += income;

    // ── Pay the ante ──
    let ante = cfg.ANTE_MODE === 'percent'
      ? Math.ceil(balance * (cfg.ANTE_PCT || 0.001))
      : cfg.windowAnte(round, wantedLevel);
    ante -= fx.anteReduction;
    ante += fx.antePenalty;
    ante = Math.round(Math.max(0, ante) * fx.anteMultiplier);

    // Horse Thief: recover % of ante
    const anteRecovery = Math.round(ante * fx.anteRecoveryPct);
    balance -= ante;
    balance += anteRecovery;

    if (balance <= 0) {
      const bustResult = handleBust(round);
      if (bustResult === true) {
        if (tracked) { fillHistory(round); return { balanceHistory, wantedHistory, busted: true, bustRound: round }; }
        return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round, busted: true, ironsCollected };
      }
      if (bustResult === 'dead_mans_hand') {
        if (tracked) return { balanceHistory, wantedHistory, busted: true, bustRound: round };
        return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round, busted: true, ironsCollected };
      }
    }

    // ── Per-round pick state ──
    const pickState = {
      correctThisRound: 0,
      firstLossApplied: false,
      highNoonUsed: false,
      highNoonPenalty: false,
      lastWasSkip: false,
      lastDirection: null,
      markedCardsActive: false,
      roundCorrect: 0,
      roundAccNum: 0,
      equippedCount: equipped.length,
      // Persistent state carried from run level
      sixShooterCount: player._sixShooterCount || 0,
      aceOfSpadesCounter: player._aceOfSpadesCounter || 0,
      getPlayerAction: archetypesMod.getPlayerAction,
      getAccuracy: archetypesMod.getAccuracy,
    };

    let roundNotoriety = fx.flatNotorietyPerRound;
    let skipCount = 0;
    let picksThisRound = 0;

    // Roll window condition (~35% chance)
    let conditionEffects = null;
    if (Math.random() < (cfg.CONDITION_PROBABILITY ?? CONDITION_PROBABILITY)) {
      const pool = cfg.RANDOM_MARKET_CONDITIONS ?? RANDOM_MARKET_CONDITIONS;
      const condType = pool[Math.floor(Math.random() * pool.length)];
      conditionEffects = (cfg.CONDITION_DEFS ?? CONDITION_DEFS)[condType] ?? null;
    }
    pickState.conditionEffects = conditionEffects;

    while (picksThisRound < picksPerRound) {
      if (balance <= 0) {
        const bustResult = handleBust(round);
        if (bustResult === true) {
          if (tracked) { fillHistory(round); return { balanceHistory, wantedHistory, busted: true, bustRound: round + 1 }; }
          return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round + 1, busted: true, ironsCollected };
        }
        if (bustResult === 'dead_mans_hand') {
          if (tracked) { fillHistory(round); return { balanceHistory, wantedHistory, busted: true, bustRound: round + 1 }; }
          return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round + 1, busted: true, ironsCollected };
        }
      }

      const result = doSimulatePick(player, {
        balance, wantedLevel, roundNum: round, picksThisRound, skipCount, roundNotoriety,
      }, fx, pickState, cfg);

      balance = result.balance;
      roundNotoriety = result.roundNotoriety;
      skipCount = result.skipCount;
      if (result.picked) picksThisRound = result.picksThisRound;
    }

    // Save persistent pick state back to player
    player._sixShooterCount = pickState.sixShooterCount;
    player._aceOfSpadesCounter = pickState.aceOfSpadesCounter;

    if (balance > peakBalance) peakBalance = balance;
    roundsSurvived = round + 1;

    // ── End of round: evaluate wanted level ──
    const upThreshold = cfg.NOTORIETY_UP_THRESHOLD - (fx.outlawLegacy || 0);
    if (roundNotoriety >= upThreshold) {
      const prevLevel = wantedLevel;
      wantedLevel = Math.max(1, wantedLevel + 1);
      // Thunderclap: bonus on level up
      if (fx.thunderclapBonus > 0 && wantedLevel > prevLevel) balance += fx.thunderclapBonus;
    } else if (roundNotoriety <= cfg.NOTORIETY_DOWN_THRESHOLD) {
      if (!fx.wantedNeverDecrease) wantedLevel = Math.max(1, wantedLevel - 1);
    }
    if (wantedLevel > peakWanted) peakWanted = wantedLevel;

    // ── Iron pick phase ──
    if (balance > 0) {
      const offerings = ironsMod.rollIronOffering(equipped);
      if (offerings.length > 0) {
        const chosen = archetypesMod.pickIron(playerType, offerings, equipped);
        equipped = ironsMod.equipIron(equipped, chosen, chambers);
        ironsCollected++;
      }
    }

    if (tracked) {
      balanceHistory.push(balance);
      wantedHistory.push(wantedLevel);
    }
  }

  if (tracked) {
    return { balanceHistory, wantedHistory, busted: balance <= 0 };
  }
  return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived, busted: balance <= 0, ironsCollected };
}

// ── Static versions using direct imports ──
export function simulateRun(playerType, opts = {}) {
  const cfg = {
    NUM_ROUNDS, PICKS_PER_ROUND, STARTING_BALANCE, STARTING_CHAMBERS,
    MAX_CHAMBERS: MAX_CHAMBERS || 6,
    DIR_SCORING, HOL_SCORING, NOTORIETY_WEIGHT,
    NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
    wantedMultiplier, skipCost, windowAnte,
  };
  const ironsMod = { getIronEffects, rollIronOffering, equipIron };
  const archetypesMod = { getPlayerAction, getAccuracy, pickIron };
  return _runCore(playerType, cfg, ironsMod, archetypesMod, opts, false);
}

export function simulateRunTracked(playerType, opts = {}) {
  const cfg = {
    NUM_ROUNDS, PICKS_PER_ROUND, STARTING_BALANCE, STARTING_CHAMBERS,
    MAX_CHAMBERS: MAX_CHAMBERS || 6,
    DIR_SCORING, HOL_SCORING, NOTORIETY_WEIGHT,
    NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
    wantedMultiplier, skipCost, windowAnte,
  };
  const ironsMod = { getIronEffects, rollIronOffering, equipIron };
  const archetypesMod = { getPlayerAction, getAccuracy, pickIron };
  return _runCore(playerType, cfg, ironsMod, archetypesMod, opts, true);
}
