// ── Bounty Hunter Simulation — Rolling Window Engine ──
// Supports continuous 30-minute windows with variable picks per window
// Players open app anytime, see active windows, make 1-10 picks at own pace

import {
  WINDOW_DURATION_MINUTES, TOTAL_SIMULATION_DAYS, STARTING_BALANCE, STARTING_CHAMBERS,
  MAX_CHAMBERS, DIR_SCORING, HOL_SCORING, NOTORIETY_WEIGHT,
  NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
  wantedMultiplier, skipCost, windowAnte, STOCK_POOL_SIZE,
  MIN_PICKS_PER_WINDOW, MAX_PICKS_PER_WINDOW, EXPECTED_PICKS_PER_WINDOW,
} from './config.mjs';
import { rollIronOffering, getIronEffects, equipIron } from './irons.mjs';
import { getPlayerAction, getAccuracy, pickIron } from './archetypes.mjs';

// Calculate total number of windows
export function getTotalWindows() {
  const hoursPerDay = 8; // trading hours
  const minutesPerWindow = WINDOW_DURATION_MINUTES;
  const minutesPerDay = hoursPerDay * 60;
  const windowsPerDay = Math.floor(minutesPerDay / minutesPerWindow);
  return windowsPerDay * TOTAL_SIMULATION_DAYS;
}

// Create rolling window data for all stocks
export function createRollingWindows(stockData) {
  const stocks = Object.keys(stockData);
  const totalCandles = Math.min(...stocks.map(s => stockData[s].length));
  const candlesPerWindow = Math.max(1, Math.floor(WINDOW_DURATION_MINUTES / 60)); // 1 candle per 60 min
  const totalWindows = Math.floor(totalCandles / candlesPerWindow);

  const windows = [];
  for (let w = 0; w < totalWindows; w++) {
    const startIdx = w * candlesPerWindow;
    const endIdx = startIdx + candlesPerWindow - 1;

    const windowData = {};
    for (const stock of stocks) {
      const candles = stockData[stock].slice(startIdx, endIdx + 1);
      if (candles.length > 0) {
        const open = candles[0].o;
        const close = candles[candles.length - 1].c;
        windowData[stock] = {
          direction: close > open ? 'rise' : close < open ? 'fall' : 'neutral',
          open,
          close,
          high: Math.max(...candles.map(c => c.h)),
          low: Math.min(...candles.map(c => c.l)),
          volatility: (Math.max(...candles.map(c => c.h)) - Math.min(...candles.map(c => c.l))) / open,
        };
      }
    }

    windows.push({
      id: w,
      startCandle: startIdx,
      endCandle: endIdx,
      data: windowData,
    });
  }

  return windows;
}

// Simulate one pick in a rolling window
function doSimulatePick(player, state, fx, pickState, cfg, windowData, stockSymbol) {
  let { balance, wantedLevel, windowNum, picksThisWindow, skipCount, windowNotoriety } = state;
  const effectiveLevel = Math.max(1, wantedLevel + (fx.manifestDestiny || 0));
  const mult = cfg.wantedMultiplier(effectiveLevel);
  const equippedCount = pickState.equippedCount || 0;

  const action = pickState.getPlayerAction(player, {
    balance, wantedLevel, windowNum, pickInWindow: picksThisWindow,
  });

  // ── Skip ──
  if (action.action === 'skip') {
    let cost = cfg.skipCost(skipCount + 1, balance);
    cost = Math.ceil(cost * (1 - Math.min(fx.skipDiscount, 0.95)));
    if (balance >= cost) { balance -= cost; skipCount++; }
    pickState.lastWasSkip = true;
    return { balance, windowNotoriety, picksThisWindow, skipCount, picked: false };
  }

  // ── Determine accuracy ──
  let accuracy = pickState.getAccuracy(player, {
    balance, wantedLevel, windowNum, pickInWindow: picksThisWindow,
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
  if (picksThisWindow === 0) accuracy += fx.firstPickAccuracyBonus;
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
    // For directional: check against actual price movement
    const actualDirection = windowData[stockSymbol]?.direction || 'neutral';
    if (direction === 'holster') {
      isCorrect = Math.random() < accuracy;
    } else {
      isCorrect = (direction === actualDirection) && (Math.random() < accuracy);
    }
  }

  // Apply irons' correctness modifiers (Ace of Spades, Ghost Rider, etc.)
  if (fx.aceOfSpadesInterval > 0) {
    pickState.aceOfSpadesCounter = (pickState.aceOfSpadesCounter || 0) + 1;
    if (pickState.aceOfSpadesCounter >= fx.aceOfSpadesInterval) {
      isCorrect = true;
      pickState.aceOfSpadesCounter = 0;
    }
  }

  if (fx.highNoon && !pickState.highNoonUsed) {
    isCorrect = true;
    pickState.highNoonUsed = true;
    pickState.highNoonPenalty = true;
  } else if (pickState.highNoonPenalty) {
    isCorrect = false;
    pickState.highNoonPenalty = false;
  }

  if (!isCorrect && fx.ghostChance > 0 && Math.random() < fx.ghostChance) {
    isCorrect = true;
  }

  let tombstoneFlip = false;
  if (!isCorrect && isDE && fx.tombstoneAceChance > 0 && Math.random() < fx.tombstoneAceChance) {
    tombstoneFlip = true;
  }

  // ── Calculate win/loss values ──
  let confForScoring = action.confidence;
  if (fx.twinRevolvers && confForScoring === 2) confForScoring = 3;
  if (fx.peacemaker) confForScoring = 3;

  const scoring = isHolster ? cfg.HOL_SCORING[confForScoring] : cfg.DIR_SCORING[confForScoring];
  let winVal = scoring.win;
  let loseVal = scoring.lose;

  if (action.confidence === 1) winVal += fx.drawWinBonus;
  if (action.confidence === 2) winVal += fx.qdWinBonus;
  if (isHolster) winVal += fx.holsterWinBonus;
  if (isDir) winVal += fx.dirWinBonus;
  if (direction === 'rise') winVal += fx.riseWinBonus;
  if (direction === 'fall') winVal += fx.fallWinBonus;

  winVal += fx.perLevelWinBonus * wantedLevel;
  if (wantedLevel >= 5) winVal += fx.highLevelWinBonus;
  if (wantedLevel <= 2) winVal += fx.lowLevelWinBonus;
  if (picksThisWindow === 0) winVal += fx.firstPickWinBonus;
  if (pickState.lastWasSkip) winVal += fx.postSkipWinBonus;
  if (windowNotoriety < 0) winVal += fx.negNotorietyWinBonus;
  if (fx.warDrumBonus > 0 && pickState.correctThisWindow >= 2) winVal += fx.warDrumBonus;
  winVal += fx.dynamiteWinBonus;
  winVal += fx.wornBootsPerRound * windowNum; // scaled to windows

  if (isDE && isDir && fx.deWinMultiplier > 1) {
    winVal = Math.round(winVal * fx.deWinMultiplier);
  }

  if (fx.moonshineWinMult > 1) winVal = Math.round(winVal * fx.moonshineWinMult);

  loseVal = Math.max(0, loseVal - fx.allLoseReduction);
  if (isHolster) loseVal = Math.max(0, loseVal - fx.holsterLoseReduction);
  if (isDir) loseVal = Math.max(0, loseVal - fx.dirLoseReduction);
  if (fx.snakeOil && isHolster && action.confidence === 1) loseVal = 0;

  if (fx.moonshineLoseMult > 1) loseVal = Math.round(loseVal * fx.moonshineLoseMult);

  if (fx.smokeBomb && !isCorrect && !tombstoneFlip && !pickState.firstLossApplied) {
    loseVal = Math.round(loseVal * 0.5);
    pickState.firstLossApplied = true;
  }

  if (fx.lowBalanceLossHalved && balance < 2000 && !isCorrect && !tombstoneFlip) {
    loseVal = Math.round(loseVal * 0.5);
  }

  // ── Compute scaled points ──
  const effectiveCorrect = isCorrect || tombstoneFlip;
  const basePoints = effectiveCorrect ? winVal : -loseVal;
  let scaledPoints = Math.round(basePoints * mult * fx.scoreMultiplier);

  if (isHolster && fx.holsterScoreMult > 1) {
    scaledPoints = Math.round(scaledPoints * fx.holsterScoreMult);
  }

  if (fx.gatlingGun && effectiveCorrect && isDE) {
    scaledPoints *= 2;
  }

  if (fx.goldRush) {
    scaledPoints = scaledPoints >= 0 ? scaledPoints * 2 : scaledPoints * 2;
  }

  if (effectiveCorrect && fx.flatCashPerCorrect > 0) {
    scaledPoints += fx.flatCashPerCorrect;
  }

  if (fx.flatPerPick > 0) scaledPoints += fx.flatPerPick;

  if (effectiveCorrect && isHolster && fx.holsterCorrectBonus > 0) {
    scaledPoints += fx.holsterCorrectBonus;
  }

  balance += scaledPoints;

  if (effectiveCorrect && fx.sixShooterInterval > 0) {
    pickState.sixShooterCount = (pickState.sixShooterCount || 0) + 1;
    if (pickState.sixShooterCount >= fx.sixShooterInterval) {
      balance += fx.sixShooterBonus;
      pickState.sixShooterCount = 0;
    }
  }

  // ── Notoriety ──
  let notorietyDelta = cfg.NOTORIETY_WEIGHT[action.confidence] * (isCorrect ? 1 : -1);
  if (isCorrect && fx.notorietyBonus > 0) notorietyDelta += fx.notorietyBonus;
  if (isCorrect && isDir && fx.dirNotorietyBonus > 0) notorietyDelta += fx.dirNotorietyBonus;
  windowNotoriety += notorietyDelta;

  // ── Update pick state ──
  player.totalPicks++;
  picksThisWindow++;
  if (isCorrect) pickState.correctThisWindow = (pickState.correctThisWindow || 0) + 1;
  pickState.windowCorrect = (pickState.windowCorrect || 0) + (isCorrect ? 1 : 0);
  pickState.windowAccNum = (pickState.windowAccNum || 0) + 1;
  pickState.markedCardsActive = !isCorrect && fx.markedCardsAccuracy > 0;
  pickState.lastWasSkip = false;
  if (isDir) pickState.lastDirection = direction;

  return { balance, windowNotoriety, picksThisWindow, skipCount, picked: true };
}

// Core rolling window simulation
export function simulateRunRolling(playerType, windows, cfg = {}, ironsMod = {}, archetypesMod = {}) {
  if (!windows || windows.length === 0) {
    return { finalBalance: 0, peakBalance: 0, peakWanted: 1, windowsSurvived: 0, busted: true, ironsCollected: 0, totalPicks: 0 };
  }

  const player = { type: playerType, totalPicks: 0 };
  let balance = cfg.STARTING_BALANCE || 5000;
  let wantedLevel = 1;
  let peakBalance = balance;
  let peakWanted = 1;
  let windowsSurvived = 0;
  let equipped = [];
  let chambers = cfg.STARTING_CHAMBERS || 2;
  let ironsCollected = 0;
  let phoenixUsed = false;
  let saloonUsed = false;

  const balanceHistory = [];
  const wantedHistory = [];

  // Helper: handle bust
  function handleBust(window) {
    const fx = ironsMod.getIronEffects?.(equipped) || {};
    if (fx.saloonDoor && !saloonUsed) {
      saloonUsed = true;
      balance = 500;
      return false;
    }
    if (fx.phoenixFeather && !phoenixUsed) {
      phoenixUsed = true;
      balance = 1000;
      return false;
    }
    if (fx.deadMansHand) {
      balance = Math.round(peakBalance * 0.5);
      return 'dead_mans_hand';
    }
    return true;
  }

  const initFx = ironsMod.getIronEffects?.(equipped) || {};
  if (initFx.startingLevelBonus > 0) wantedLevel += initFx.startingLevelBonus;

  for (let w = 0; w < windows.length; w++) {
    const window = windows[w];
    const fx = ironsMod.getIronEffects?.(equipped) || {};

    // Determine picks for this window: 1-10, targeting ~3 per window
    // Some archetypes check less often (turtle), some more often (gambler)
    let targetPicks = cfg.EXPECTED_PICKS_PER_WINDOW || 3;
    const variability = 0.5 + Math.random() * 1.5; // 0.5 to 2.0x
    let picksThisWindow = Math.max(
      cfg.MIN_PICKS_PER_WINDOW || 1,
      Math.min(cfg.MAX_PICKS_PER_WINDOW || 10, Math.round(targetPicks * variability))
    );

    chambers = Math.min(cfg.STARTING_CHAMBERS + fx.extraChambers, cfg.MAX_CHAMBERS || 6);

    // Window income
    let income = (fx.roundIncome || 0) + (fx.foolsGoldIncome || 0);
    income += (fx.incomePerIron || 0) * equipped.length;
    if (balance > 10000) income += fx.highBalanceIncome || 0;
    if (balance < (cfg.STARTING_BALANCE || 5000)) income += fx.lowBalanceIncome || 0;
    income += (fx.bountyMarkIncome || 0) * wantedLevel;
    if ((fx.elDoradoBase || 0) > 0) income += fx.elDoradoBase + (fx.elDoradoIncrement || 0) * w;
    balance += income;

    // Pay ante
    let ante = cfg.windowAnte?.(w, wantedLevel) || 15;
    ante -= (fx.anteReduction || 0);
    ante += (fx.antePenalty || 0);
    ante = Math.round(Math.max(0, ante) * (fx.anteMultiplier || 1));

    const anteRecovery = Math.round(ante * (fx.anteRecoveryPct || 0));
    balance -= ante;
    balance += anteRecovery;

    if (balance <= 0) {
      const bustResult = handleBust(w);
      if (bustResult === true) {
        return { finalBalance: balance, peakBalance, peakWanted, windowsSurvived: w, busted: true, ironsCollected, totalPicks: player.totalPicks };
      }
      if (bustResult === 'dead_mans_hand') {
        return { finalBalance: balance, peakBalance, peakWanted, windowsSurvived: w, busted: true, ironsCollected, totalPicks: player.totalPicks };
      }
    }

    // Pick phase: player picks 1-10 stocks at own pace
    const pickState = {
      correctThisWindow: 0,
      firstLossApplied: false,
      highNoonUsed: false,
      highNoonPenalty: false,
      lastWasSkip: false,
      lastDirection: null,
      markedCardsActive: false,
      windowCorrect: 0,
      windowAccNum: 0,
      equippedCount: equipped.length,
      sixShooterCount: player._sixShooterCount || 0,
      aceOfSpadesCounter: player._aceOfSpadesCounter || 0,
      getPlayerAction: archetypesMod.getPlayerAction || getPlayerAction,
      getAccuracy: archetypesMod.getAccuracy || getAccuracy,
    };

    let windowNotoriety = fx.flatNotorietyPerRound || 0;
    let skipCount = 0;
    let picksAttempted = 0;

    // Unswipped stocks auto-settle as misses
    const availableStocks = Object.keys(window.data);
    const stocksToProcess = Math.min(picksThisWindow, availableStocks.length);
    const selectedStocks = availableStocks.sort(() => Math.random() - 0.5).slice(0, stocksToProcess);

    for (const stock of selectedStocks) {
      if (balance <= 0) {
        const bustResult = handleBust(w);
        if (bustResult === true) {
          return { finalBalance: balance, peakBalance, peakWanted, windowsSurvived: w + 1, busted: true, ironsCollected, totalPicks: player.totalPicks };
        }
        if (bustResult === 'dead_mans_hand') {
          return { finalBalance: balance, peakBalance, peakWanted, windowsSurvived: w + 1, busted: true, ironsCollected, totalPicks: player.totalPicks };
        }
      }

      const result = doSimulatePick(
        player,
        { balance, wantedLevel, windowNum: w, picksThisWindow: picksAttempted, skipCount, windowNotoriety },
        fx,
        pickState,
        cfg,
        window.data,
        stock
      );

      balance = result.balance;
      windowNotoriety = result.windowNotoriety;
      skipCount = result.skipCount;
      if (result.picked) picksAttempted = result.picksThisWindow;
    }

    player._sixShooterCount = pickState.sixShooterCount;
    player._aceOfSpadesCounter = pickState.aceOfSpadesCounter;

    if (balance > peakBalance) peakBalance = balance;
    windowsSurvived = w + 1;

    // End of window: evaluate wanted level
    const upThreshold = cfg.NOTORIETY_UP_THRESHOLD - (fx.outlawLegacy || 0);
    if (windowNotoriety >= upThreshold) {
      const prevLevel = wantedLevel;
      wantedLevel = Math.max(1, wantedLevel + 1);
      if ((fx.thunderclapBonus || 0) > 0 && wantedLevel > prevLevel) {
        balance += fx.thunderclapBonus;
      }
    } else if (windowNotoriety <= cfg.NOTORIETY_DOWN_THRESHOLD) {
      if (!(fx.wantedNeverDecrease || false)) wantedLevel = Math.max(1, wantedLevel - 1);
    }
    if (wantedLevel > peakWanted) peakWanted = wantedLevel;

    // Iron pick phase
    if (balance > 0 && ironsMod.rollIronOffering) {
      const offerings = ironsMod.rollIronOffering(equipped);
      if (offerings.length > 0 && archetypesMod.pickIron) {
        const chosen = archetypesMod.pickIron(playerType, offerings, equipped);
        equipped = ironsMod.equipIron(equipped, chosen, chambers);
        ironsCollected++;
      }
    }

    balanceHistory.push(balance);
    wantedHistory.push(wantedLevel);
  }

  return {
    finalBalance: balance,
    peakBalance,
    peakWanted,
    windowsSurvived,
    busted: balance <= 0,
    ironsCollected,
    totalPicks: player.totalPicks,
    balanceHistory,
    wantedHistory,
  };
}

export default { simulateRunRolling, createRollingWindows, getTotalWindows };
