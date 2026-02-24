// ── Bounty Hunter Simulation — Rolling Window Runner ──
// Orchestrates 30-minute rolling window simulations with historical data

import * as config from './config.mjs';
import * as irons from './irons.mjs';
import * as archetypes from './archetypes.mjs';
import { simulateRunRolling, createRollingWindows } from './engine-rolling.mjs';
import { getHistoricalData } from './data-fetcher.mjs';

export async function runSimulationRolling(options = {}) {
  const {
    numRuns = config.NUM_RUNS,
    archetype = null,
    stockData = null,
    windows = null,
  } = options;

  // Fetch or use provided stock data
  let data = stockData;
  let rolling_windows = windows;

  if (!data) {
    console.log('📥 Fetching historical stock data...');
    data = await getHistoricalData({
      stocks: Array.from(
        { length: config.STOCK_POOL_SIZE },
        (_, i) => ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK.B', 'JNJ', 'V',
          'WMT', 'JPM', 'PG', 'MA', 'HD', 'DIS', 'NFLX', 'BAC', 'ASML', 'KO',
          'CSCO', 'CRM', 'ABT', 'TMO', 'XOM'][i]
      ),
      days: config.TOTAL_SIMULATION_DAYS,
      useSynthetic: true,
    });
  }

  if (!rolling_windows) {
    console.log('🏗  Creating rolling windows...');
    rolling_windows = createRollingWindows(data);
  }

  console.log(`📊 Running ${numRuns} simulations across ${rolling_windows.length} windows...\n`);

  const targetArchetypes = archetype ? [archetype] : config.ARCHETYPES;
  const allResults = [];

  for (const arch of targetArchetypes) {
    const archetypeResults = [];

    for (let run = 0; run < numRuns; run++) {
      const result = simulateRunRolling(arch, rolling_windows, config, irons, archetypes);

      archetypeResults.push({
        archetype: arch,
        run,
        ...result,
      });

      if ((run + 1) % 50 === 0) {
        process.stdout.write(`  ${arch}: ${run + 1}/${numRuns}\r`);
      }
    }

    allResults.push(...archetypeResults);
    console.log(`✅ ${arch.padEnd(25)} ${numRuns} runs complete`);
  }

  return {
    allResults,
    stockData: data,
    windows: rolling_windows,
    config,
  };
}

export default { runSimulationRolling };
