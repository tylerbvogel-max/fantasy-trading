#!/usr/bin/env node
// ── Bounty Hunter Simulation — 30-Minute Rolling Window Mode ──
// Full end-to-end simulation with historical data, 500 runs, and analysis

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import * as config from './config.mjs';
import { runSimulationRolling } from './runner-rolling.mjs';
import { computeRollingStats, printRollingStats, generateCharts } from './stats-rolling.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
function getFlag(name) {
  return args.includes(`--${name}`);
}
function getOption(name, fallback) {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const val = parseInt(arg.split('=')[1], 10);
  return isNaN(val) ? fallback : val;
}

const dryRun = getFlag('dry-run');
const numRuns = getOption('runs', config.NUM_RUNS);
const verbose = getFlag('verbose');

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
  console.log(`║   BOUNTY HUNTER — 30-MIN ROLLING WINDOW SIMULATION (500 RUNS)      ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════╝`);

  console.log(`\n⚙️  Configuration:`);
  console.log(`   • Window duration: ${config.WINDOW_DURATION_MINUTES} minutes`);
  console.log(`   • Simulation days: ${config.TOTAL_SIMULATION_DAYS} days`);
  console.log(`   • Stocks: ${config.STOCK_POOL_SIZE}`);
  console.log(`   • Expected picks/window: ${config.EXPECTED_PICKS_PER_WINDOW}`);
  console.log(`   • Runs per archetype: ${numRuns}`);
  console.log(`   • Total archetypes: ${config.ARCHETYPES.length}`);
  console.log(`   • Total runs: ${numRuns * config.ARCHETYPES.length}`);

  if (dryRun) {
    console.log(`\n🏜️  DRY RUN — no actual execution\n`);
    return;
  }

  const startTime = Date.now();

  console.log(`\n🚀 Starting simulation...\n`);

  try {
    // Run full simulation
    const result = await runSimulationRolling({ numRuns });

    const { allResults, stockData, windows, config: cfg } = result;

    // Compute statistics
    console.log(`\n📊 Computing statistics...`);
    const stats = computeRollingStats(allResults, { numRuns });

    // Print results
    printRollingStats(stats, cfg);
    generateCharts(stats, cfg);

    // Create output directory
    const outputDir = resolve(join(__dirname, '..', '..', 'output'));
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    // Export results as JSON
    const resultsFile = join(outputDir, 'rolling-simulation-results.json');
    writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      config: {
        numRuns,
        windowDurationMinutes: config.WINDOW_DURATION_MINUTES,
        totalSimulationDays: config.TOTAL_SIMULATION_DAYS,
        stockPoolSize: config.STOCK_POOL_SIZE,
        expectedPicksPerWindow: config.EXPECTED_PICKS_PER_WINDOW,
        archetypes: config.ARCHETYPES,
      },
      stats,
      summary: {
        totalRuns: numRuns * config.ARCHETYPES.length,
        windowsPerRun: windows.length,
        durationSeconds: Math.round((Date.now() - startTime) / 1000),
      },
    }, null, 2));

    console.log(`\n✅ Results exported to ${resultsFile}`);

    // Export detailed run data for charting
    const detailedFile = join(outputDir, 'rolling-simulation-detailed.json');
    writeFileSync(detailedFile, JSON.stringify(allResults, null, 2));
    console.log(`✅ Detailed data exported to ${detailedFile}`);

    // Generate summary report
    const report = generateReport(stats, config, allResults);
    const reportFile = join(outputDir, 'rolling-simulation-report.md');
    writeFileSync(reportFile, report);
    console.log(`✅ Report exported to ${reportFile}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n⏱️  Total time: ${elapsed}s`);
    console.log(`\n✨ Simulation complete!\n`);

  } catch (err) {
    console.error(`\n❌ Error:`, err.message);
    process.exit(1);
  }
}

function generateReport(stats, config, allResults) {
  let report = `# 30-Minute Rolling Window Simulation Results\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;

  report += `## Configuration\n\n`;
  report += `- **Window Duration:** ${config.WINDOW_DURATION_MINUTES} minutes\n`;
  report += `- **Simulation Period:** ${config.TOTAL_SIMULATION_DAYS} days\n`;
  report += `- **Stock Pool Size:** ${config.STOCK_POOL_SIZE} stocks\n`;
  report += `- **Expected Picks/Window:** ${config.EXPECTED_PICKS_PER_WINDOW}\n`;
  report += `- **Starting Balance:** $${config.STARTING_BALANCE}\n`;
  report += `- **Runs per Archetype:** ${config.NUM_RUNS}\n\n`;

  report += `## Key Findings\n\n`;

  const byArchetype = {};
  for (const result of allResults) {
    if (!byArchetype[result.archetype]) byArchetype[result.archetype] = [];
    byArchetype[result.archetype].push(result);
  }

  // Find best performer
  let bestArch = null;
  let bestRate = -1;
  for (const [arch, results] of Object.entries(byArchetype)) {
    const winRate = parseFloat(stats[arch].winRate);
    if (winRate > bestRate) {
      bestRate = winRate;
      bestArch = arch;
    }
  }

  // Find most resilient
  let mostResilient = null;
  let longestSurvival = 0;
  for (const [arch, results] of Object.entries(byArchetype)) {
    const avgSurvival = parseFloat(stats[arch].avgWindowsSurvived);
    if (avgSurvival > longestSurvival) {
      longestSurvival = avgSurvival;
      mostResilient = arch;
    }
  }

  report += `### Top Performer\n`;
  report += `**${config.ARCHETYPE_LABELS[bestArch]}** with ${bestRate}% win rate\n\n`;

  report += `### Most Resilient\n`;
  report += `**${config.ARCHETYPE_LABELS[mostResilient]}** surviving avg ${longestSurvival} windows\n\n`;

  report += `## Results by Archetype\n\n`;

  for (const arch of config.ARCHETYPES) {
    const s = stats[arch];
    const label = config.ARCHETYPE_LABELS[arch];

    report += `### ${label}\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Survival Rate | ${s.survivalRate}% |\n`;
    report += `| Win Rate | ${s.winRate}% |\n`;
    report += `| Avg Final Balance | $${s.avgBalance} |\n`;
    report += `| Avg Peak Balance | $${s.avgPeakBalance} |\n`;
    report += `| Avg Peak Wanted | ${s.avgPeakWanted} |\n`;
    report += `| Avg Windows Survived | ${s.avgWindowsSurvived} |\n`;
    report += `| Avg Irons Collected | ${s.avgIronsCollected} |\n`;
    report += `| Avg Total Picks | ${s.avgTotalPicks} |\n`;
    report += `| Interaction Frequency | ${s.avgInteractionFrequency}/window |\n\n`;

    report += `**Survival Curve:**\n`;
    for (const milestone of [25, 50, 100, 150, 200]) {
      const curve = s.survivalCurve[milestone];
      report += `- Window ${milestone}: ${curve.percentage}% of players\n`;
    }
    report += `\n`;
  }

  report += `## Analysis\n\n`;

  report += `### Noise and Volatility (30-min vs 120-min windows)\n`;
  report += `With 30-minute rolling windows, we expect higher volatility and more rapid swings.\n`;
  report += `This creates a more dynamic gameplay experience with shorter decision windows.\n`;
  report += `Win rates may be lower due to increased noise in price action.\n\n`;

  report += `### Player Engagement (3-5 picks/day target)\n`;
  report += `The simulation targets ${config.EXPECTED_PICKS_PER_WINDOW} picks per 30-minute window.\n`;
  report += `Over ${config.TOTAL_SIMULATION_DAYS} days, this generates realistic engagement patterns.\n\n`;

  report += `### Iron Progression\n`;
  report += `Iron collection drives long-term progression and power scaling.\n`;
  report += `Archetypes with high survival rates accumulate more irons over time.\n\n`;

  report += `### Wanted Level Dynamics\n`;
  report += `Wanted level increases with successful picks and creates multiplier scaling.\n`;
  report += `Balance management becomes critical at higher wanted levels.\n\n`;

  return report;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
