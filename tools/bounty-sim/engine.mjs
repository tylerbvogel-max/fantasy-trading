// ── Bounty Hunter Simulation — Core Engine ──

import {
  PICKS_PER_ROUND, STARTING_BALANCE, NUM_ROUNDS, STARTING_CHAMBERS,
  DIR_SCORING, HOL_SCORING, NOTORIETY_WEIGHT,
  NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
  wantedMultiplier, skipCost, roundAnte,
} from './config.mjs';
import { rollIronOffering, getIronEffects, equipIron } from './irons.mjs';
import { getPlayerAction, getAccuracy, pickIron } from './archetypes.mjs';

// ── Factory: create engine bound to specific module instances ──
// Used by watch mode to pass freshly re-imported modules.
export function createEngine(configMod, ironsMod, archetypesMod) {
  function _simulatePick(player, state, fx) {
    let { balance, wantedLevel, roundNum, picksThisRound, skipCount, roundNotoriety } = state;
    const mult = configMod.wantedMultiplier(wantedLevel);

    const action = archetypesMod.getPlayerAction(player, {
      balance, wantedLevel, roundNum, pickInRound: picksThisRound,
    });

    if (action.action === 'skip') {
      let cost = configMod.skipCost(skipCount + 1, balance);
      cost = Math.ceil(cost * (1 - fx.skipDiscount));
      if (balance >= cost) { balance -= cost; skipCount++; }
      return { balance, roundNotoriety, picksThisRound, skipCount, picked: false };
    }

    let accuracy = archetypesMod.getAccuracy(player, { balance, wantedLevel, roundNum, pickInRound: picksThisRound }) + fx.accuracyBonus;
    const isHolster = action.action === 'holster';
    const isDE = action.confidence === 3;
    if (isDE) accuracy += fx.deAccuracyBonus;

    let isCorrect;
    if (isHolster) {
      const holsterRate = 0.68 + (accuracy - 0.50) * 0.3;
      isCorrect = Math.random() < holsterRate;
    } else {
      isCorrect = Math.random() < accuracy;
    }
    if (!isCorrect && fx.ghostChance > 0 && Math.random() < fx.ghostChance) isCorrect = true;

    const scoring = isHolster ? configMod.HOL_SCORING[action.confidence] : configMod.DIR_SCORING[action.confidence];
    let winVal = scoring.win;
    let loseVal = scoring.lose;
    if (action.confidence === 1) winVal += fx.drawWinBonus;
    if (action.confidence === 2) winVal += fx.qdWinBonus;
    if (isHolster) winVal += fx.holsterWinBonus;
    winVal += fx.perLevelWinBonus * wantedLevel;
    if (isDE && !isHolster && fx.deWinMultiplier > 1) winVal = Math.round(winVal * fx.deWinMultiplier);
    loseVal = Math.max(0, loseVal - fx.allLoseReduction);
    if (fx.snakeOil && isHolster && action.confidence === 1) loseVal = 0;

    const basePoints = isCorrect ? winVal : -loseVal;
    let scaledPoints = Math.round(basePoints * mult * fx.scoreMultiplier);
    if (isCorrect && fx.flatCashPerCorrect > 0) scaledPoints += fx.flatCashPerCorrect;
    balance += scaledPoints;

    let notorietyDelta = configMod.NOTORIETY_WEIGHT[action.confidence] * (isCorrect ? 1 : -1);
    if (isCorrect && fx.notorietyBonus > 0) notorietyDelta += fx.notorietyBonus;
    roundNotoriety += notorietyDelta;
    player.totalPicks++;
    picksThisRound++;

    return { balance, roundNotoriety, picksThisRound, skipCount, picked: true };
  }

  function _simulateRun(playerType, { numRounds = configMod.NUM_ROUNDS, picksPerRound = configMod.PICKS_PER_ROUND } = {}) {
    const player = { type: playerType, totalPicks: 0 };
    let balance = configMod.STARTING_BALANCE;
    let wantedLevel = 1;
    let peakBalance = balance;
    let peakWanted = 1;
    let roundsSurvived = 0;
    let equipped = [];
    const chambers = configMod.STARTING_CHAMBERS;
    let ironsCollected = 0;

    for (let round = 0; round < numRounds; round++) {
      const fx = ironsMod.getIronEffects(equipped);
      const ante = Math.max(0, configMod.roundAnte(round, wantedLevel) - fx.anteReduction);
      balance -= ante;
      if (balance <= 0) return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round, busted: true, ironsCollected };

      let roundNotoriety = 0, skipCount = 0, picksThisRound = 0;
      while (picksThisRound < picksPerRound) {
        if (balance <= 0) return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round + 1, busted: true, ironsCollected };
        const result = _simulatePick(player, { balance, wantedLevel, roundNum: round, picksThisRound, skipCount, roundNotoriety }, fx);
        balance = result.balance; roundNotoriety = result.roundNotoriety; skipCount = result.skipCount;
        if (result.picked) picksThisRound = result.picksThisRound;
      }

      if (balance > peakBalance) peakBalance = balance;
      roundsSurvived = round + 1;
      if (roundNotoriety >= configMod.NOTORIETY_UP_THRESHOLD) wantedLevel = Math.max(1, wantedLevel + 1);
      else if (roundNotoriety <= configMod.NOTORIETY_DOWN_THRESHOLD) wantedLevel = Math.max(1, wantedLevel - 1);
      if (wantedLevel > peakWanted) peakWanted = wantedLevel;

      if (balance > 0) {
        const offerings = ironsMod.rollIronOffering(equipped);
        if (offerings.length > 0) {
          const chosen = archetypesMod.pickIron(playerType, offerings, equipped);
          equipped = ironsMod.equipIron(equipped, chosen, chambers);
          ironsCollected++;
        }
      }
    }
    return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived, busted: balance <= 0, ironsCollected };
  }

  function _simulateRunTracked(playerType, { numRounds = configMod.NUM_ROUNDS, picksPerRound = configMod.PICKS_PER_ROUND } = {}) {
    const player = { type: playerType, totalPicks: 0 };
    let balance = configMod.STARTING_BALANCE;
    let wantedLevel = 1;
    let equipped = [];
    const chambers = configMod.STARTING_CHAMBERS;
    const balanceHistory = [balance];
    const wantedHistory = [wantedLevel];

    for (let round = 0; round < numRounds; round++) {
      const fx = ironsMod.getIronEffects(equipped);
      const ante = Math.max(0, configMod.roundAnte(round, wantedLevel) - fx.anteReduction);
      balance -= ante;

      if (balance <= 0) {
        balanceHistory.push(balance); wantedHistory.push(wantedLevel);
        for (let r = round + 2; r <= numRounds; r++) { balanceHistory.push(balance); wantedHistory.push(wantedLevel); }
        return { balanceHistory, wantedHistory, busted: true, bustRound: round };
      }

      let roundNotoriety = 0, skipCount = 0, picksThisRound = 0;
      while (picksThisRound < picksPerRound) {
        if (balance <= 0) {
          balanceHistory.push(balance); wantedHistory.push(wantedLevel);
          for (let r = round + 2; r <= numRounds; r++) { balanceHistory.push(balance); wantedHistory.push(wantedLevel); }
          return { balanceHistory, wantedHistory, busted: true, bustRound: round + 1 };
        }
        const result = _simulatePick(player, { balance, wantedLevel, roundNum: round, picksThisRound, skipCount, roundNotoriety }, fx);
        balance = result.balance; roundNotoriety = result.roundNotoriety; skipCount = result.skipCount;
        if (result.picked) picksThisRound = result.picksThisRound;
      }

      if (roundNotoriety >= configMod.NOTORIETY_UP_THRESHOLD) wantedLevel = Math.max(1, wantedLevel + 1);
      else if (roundNotoriety <= configMod.NOTORIETY_DOWN_THRESHOLD) wantedLevel = Math.max(1, wantedLevel - 1);

      if (balance > 0) {
        const offerings = ironsMod.rollIronOffering(equipped);
        if (offerings.length > 0) {
          const chosen = archetypesMod.pickIron(playerType, offerings, equipped);
          equipped = ironsMod.equipIron(equipped, chosen, chambers);
        }
      }

      balanceHistory.push(balance);
      wantedHistory.push(wantedLevel);
    }
    return { balanceHistory, wantedHistory, busted: balance <= 0 };
  }

  return { simulateRun: _simulateRun, simulateRunTracked: _simulateRunTracked };
}

function randomOutcome() {
  const r = Math.random();
  return r < 0.333 ? 'rise' : r < 0.666 ? 'fall' : 'holster';
}

// ── Simulate a single pick within a round ──
// Returns { balance, roundNotoriety, picksThisRound, skipCount, done }
function simulatePick(player, state, fx) {
  let { balance, wantedLevel, roundNum, picksThisRound, skipCount, roundNotoriety } = state;
  const mult = wantedMultiplier(wantedLevel);

  const action = getPlayerAction(player, {
    balance, wantedLevel, roundNum, pickInRound: picksThisRound,
  });

  if (action.action === 'skip') {
    let cost = skipCost(skipCount + 1, balance);
    cost = Math.ceil(cost * (1 - fx.skipDiscount));
    if (balance >= cost) {
      balance -= cost;
      skipCount++;
    }
    return { balance, roundNotoriety, picksThisRound, skipCount, picked: false };
  }

  // Determine accuracy with iron bonuses
  let accuracy = getAccuracy(player, { balance, wantedLevel, roundNum, pickInRound: picksThisRound }) + fx.accuracyBonus;
  const isHolster = action.action === 'holster';
  const isDE = action.confidence === 3;
  if (isDE) accuracy += fx.deAccuracyBonus;

  let isCorrect;
  if (isHolster) {
    const holsterRate = 0.68 + (accuracy - 0.50) * 0.3;
    isCorrect = Math.random() < holsterRate;
  } else {
    isCorrect = Math.random() < accuracy;
  }

  // Ghost Rider: miss → correct flip
  if (!isCorrect && fx.ghostChance > 0 && Math.random() < fx.ghostChance) {
    isCorrect = true;
  }

  // Calculate scoring
  const scoring = isHolster ? HOL_SCORING[action.confidence] : DIR_SCORING[action.confidence];
  let winVal = scoring.win;
  let loseVal = scoring.lose;

  // Apply Iron win bonuses
  if (action.confidence === 1) winVal += fx.drawWinBonus;
  if (action.confidence === 2) winVal += fx.qdWinBonus;
  if (isHolster) winVal += fx.holsterWinBonus;
  winVal += fx.perLevelWinBonus * wantedLevel;

  // DE Double Barrel
  if (isDE && !isHolster && fx.deWinMultiplier > 1) {
    winVal = Math.round(winVal * fx.deWinMultiplier);
  }

  // Apply Iron loss reduction
  loseVal = Math.max(0, loseVal - fx.allLoseReduction);

  // Snake Oil: Draw holster losses = 0
  if (fx.snakeOil && isHolster && action.confidence === 1) {
    loseVal = 0;
  }

  const basePoints = isCorrect ? winVal : -loseVal;
  let scaledPoints = Math.round(basePoints * mult * fx.scoreMultiplier);

  // Flat cash bonus (unscaled)
  if (isCorrect && fx.flatCashPerCorrect > 0) {
    scaledPoints += fx.flatCashPerCorrect;
  }

  balance += scaledPoints;

  // Notoriety
  let notorietyDelta = NOTORIETY_WEIGHT[action.confidence] * (isCorrect ? 1 : -1);
  if (isCorrect && fx.notorietyBonus > 0) notorietyDelta += fx.notorietyBonus;
  roundNotoriety += notorietyDelta;

  player.totalPicks++;
  picksThisRound++;

  return { balance, roundNotoriety, picksThisRound, skipCount, picked: true };
}

// ── Simulate a full run (stats only, no round-by-round tracking) ──
export function simulateRun(playerType, { numRounds = NUM_ROUNDS, picksPerRound = PICKS_PER_ROUND } = {}) {
  const player = { type: playerType, totalPicks: 0 };
  let balance = STARTING_BALANCE;
  let wantedLevel = 1;
  let peakBalance = balance;
  let peakWanted = 1;
  let roundsSurvived = 0;
  let equipped = [];
  const chambers = STARTING_CHAMBERS;
  let ironsCollected = 0;

  for (let round = 0; round < numRounds; round++) {
    const fx = getIronEffects(equipped);

    // Pay the ante
    const ante = Math.max(0, roundAnte(round, wantedLevel) - fx.anteReduction);
    balance -= ante;
    if (balance <= 0) {
      return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round, busted: true, ironsCollected };
    }

    let roundNotoriety = 0;
    let skipCount = 0;
    let picksThisRound = 0;

    while (picksThisRound < picksPerRound) {
      if (balance <= 0) {
        return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived: round + 1, busted: true, ironsCollected };
      }

      const result = simulatePick(player, {
        balance, wantedLevel, roundNum: round, picksThisRound, skipCount, roundNotoriety,
      }, fx);

      balance = result.balance;
      roundNotoriety = result.roundNotoriety;
      skipCount = result.skipCount;
      if (result.picked) picksThisRound = result.picksThisRound;
    }

    if (balance > peakBalance) peakBalance = balance;
    roundsSurvived = round + 1;

    // End of round: evaluate wanted level
    if (roundNotoriety >= NOTORIETY_UP_THRESHOLD) {
      wantedLevel = Math.max(1, wantedLevel + 1);
    } else if (roundNotoriety <= NOTORIETY_DOWN_THRESHOLD) {
      wantedLevel = Math.max(1, wantedLevel - 1);
    }
    if (wantedLevel > peakWanted) peakWanted = wantedLevel;

    // Iron pick phase
    if (balance > 0) {
      const offerings = rollIronOffering(equipped);
      if (offerings.length > 0) {
        const chosen = pickIron(playerType, offerings, equipped);
        equipped = equipIron(equipped, chosen, chambers);
        ironsCollected++;
      }
    }
  }

  return { finalBalance: balance, peakBalance, peakWanted, roundsSurvived, busted: balance <= 0, ironsCollected };
}

// ── Simulate a full run WITH round-by-round balance tracking (for charts) ──
export function simulateRunTracked(playerType, { numRounds = NUM_ROUNDS, picksPerRound = PICKS_PER_ROUND } = {}) {
  const player = { type: playerType, totalPicks: 0 };
  let balance = STARTING_BALANCE;
  let wantedLevel = 1;
  let equipped = [];
  const chambers = STARTING_CHAMBERS;
  const balanceHistory = [balance];
  const wantedHistory = [wantedLevel];

  for (let round = 0; round < numRounds; round++) {
    const fx = getIronEffects(equipped);
    const ante = Math.max(0, roundAnte(round, wantedLevel) - fx.anteReduction);
    balance -= ante;

    if (balance <= 0) {
      balanceHistory.push(balance);
      wantedHistory.push(wantedLevel);
      for (let r = round + 2; r <= numRounds; r++) {
        balanceHistory.push(balance);
        wantedHistory.push(wantedLevel);
      }
      return { balanceHistory, wantedHistory, busted: true, bustRound: round };
    }

    let roundNotoriety = 0;
    let skipCount = 0;
    let picksThisRound = 0;

    while (picksThisRound < picksPerRound) {
      if (balance <= 0) {
        balanceHistory.push(balance);
        wantedHistory.push(wantedLevel);
        for (let r = round + 2; r <= numRounds; r++) {
          balanceHistory.push(balance);
          wantedHistory.push(wantedLevel);
        }
        return { balanceHistory, wantedHistory, busted: true, bustRound: round + 1 };
      }

      const result = simulatePick(player, {
        balance, wantedLevel, roundNum: round, picksThisRound, skipCount, roundNotoriety,
      }, fx);

      balance = result.balance;
      roundNotoriety = result.roundNotoriety;
      skipCount = result.skipCount;
      if (result.picked) picksThisRound = result.picksThisRound;
    }

    // End of round: evaluate wanted level
    if (roundNotoriety >= NOTORIETY_UP_THRESHOLD) {
      wantedLevel = Math.max(1, wantedLevel + 1);
    } else if (roundNotoriety <= NOTORIETY_DOWN_THRESHOLD) {
      wantedLevel = Math.max(1, wantedLevel - 1);
    }

    // Iron pick
    if (balance > 0) {
      const offerings = rollIronOffering(equipped);
      if (offerings.length > 0) {
        const chosen = pickIron(playerType, offerings, equipped);
        equipped = equipIron(equipped, chosen, chambers);
      }
    }

    balanceHistory.push(balance);
    wantedHistory.push(wantedLevel);
  }

  return { balanceHistory, wantedHistory, busted: balance <= 0 };
}
