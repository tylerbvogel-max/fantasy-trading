// ── Bounty Hunter Simulation — Rolling Window Statistics & Analysis ──
// Generates survival curves, win rates, interaction frequencies, progression analysis

export function computeRollingStats(allResults, options = {}) {
  const { numRuns = 500 } = options;

  const stats = {};

  // Group by archetype
  const byArchetype = {};
  for (const result of allResults) {
    if (!byArchetype[result.archetype]) {
      byArchetype[result.archetype] = [];
    }
    byArchetype[result.archetype].push(result);
  }

  // Compute stats per archetype
  for (const [arch, results] of Object.entries(byArchetype)) {
    const survived = results.filter(r => !r.busted).length;
    const avgBalance = results.reduce((sum, r) => sum + r.finalBalance, 0) / results.length;
    const avgPeakBalance = results.reduce((sum, r) => sum + r.peakBalance, 0) / results.length;
    const avgPeakWanted = results.reduce((sum, r) => sum + r.peakWanted, 0) / results.length;
    const avgWindowsSurvived = results.reduce((sum, r) => sum + r.windowsSurvived, 0) / results.length;
    const avgIronsCollected = results.reduce((sum, r) => sum + r.ironsCollected, 0) / results.length;
    const avgTotalPicks = results.reduce((sum, r) => sum + (r.totalPicks || 0), 0) / results.length;

    // Survival curve: how many players make it past each window milestone
    const survivalMilestones = [25, 50, 100, 150, 200];
    const survivalCurve = {};
    for (const milestone of survivalMilestones) {
      const survivedMilestone = results.filter(r => r.windowsSurvived >= milestone).length;
      survivalCurve[milestone] = {
        count: survivedMilestone,
        percentage: ((survivedMilestone / results.length) * 100).toFixed(1),
      };
    }

    // Win rate by archetype (peak balance > starting balance)
    const winners = results.filter(r => r.finalBalance > 5000).length;
    const winRate = ((winners / results.length) * 100).toFixed(1);

    // Iron progression curve
    const ironProgression = {};
    for (let i = 0; i <= 10; i++) {
      const withIrons = results.filter(r => r.ironsCollected === i).length;
      ironProgression[i] = withIrons;
    }

    // Wanted level progression
    const wantedDistribution = {};
    for (let level = 1; level <= 15; level++) {
      const atLevel = results.filter(r => r.peakWanted === level).length;
      wantedDistribution[level] = atLevel;
    }

    // Interaction frequency: total picks / windows survived
    const interactionFrequency = results.map(r => r.totalPicks / Math.max(1, r.windowsSurvived));
    const avgInteractionFreq = (interactionFrequency.reduce((a, b) => a + b, 0) / interactionFrequency.length).toFixed(2);

    stats[arch] = {
      survivalRate: ((survived / results.length) * 100).toFixed(1),
      winRate,
      survivalCurve,
      avgBalance: avgBalance.toFixed(0),
      avgPeakBalance: avgPeakBalance.toFixed(0),
      avgPeakWanted: avgPeakWanted.toFixed(1),
      avgWindowsSurvived: avgWindowsSurvived.toFixed(1),
      avgIronsCollected: avgIronsCollected.toFixed(1),
      avgTotalPicks: avgTotalPicks.toFixed(0),
      avgInteractionFrequency: avgInteractionFreq,
      ironProgression,
      wantedDistribution,
      // Sample for charting
      samples: results.slice(0, 5),
    };
  }

  return stats;
}

export function printRollingStats(stats, config) {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         30-MINUTE ROLLING WINDOW SIMULATION RESULTS                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const archetypes = Object.keys(stats);

  // Table header
  console.log('ARCHETYPE                 SURVIVAL    WIN    AVG BALANCE    PEAK $    PEAK W    WINDOWS');
  console.log('─'.repeat(88));

  for (const arch of archetypes) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const survival = s.survivalRate.padStart(8) + '%';
    const win = s.winRate.padStart(6) + '%';
    const balance = s.avgBalance.padStart(12);
    const peak = s.avgPeakBalance.padStart(7);
    const wantedPeak = s.avgPeakWanted.padStart(7);
    const windows = s.avgWindowsSurvived.padStart(8);

    console.log(`${name}  ${survival}  ${win}  $${balance}  $${peak}  ${wantedPeak}  ${windows}`);
  }

  console.log('\n📊 SURVIVAL CURVES (% of players reaching window milestone)');
  console.log('─'.repeat(88));

  const milestones = [25, 50, 100, 150, 200];
  for (const arch of archetypes) {
    const curve = stats[arch].survivalCurve;
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const milestoneStr = milestones
      .map(m => `${m}w: ${curve[m]?.percentage || '0'}%`)
      .join('  |  ');
    console.log(`${name}  ${milestoneStr}`);
  }

  console.log('\n🎯 INTERACTION FREQUENCY (picks per window)');
  console.log('─'.repeat(88));

  for (const arch of archetypes) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const freq = s.avgInteractionFrequency.padStart(5);
    const picks = s.avgTotalPicks.padStart(6);
    console.log(`${name}  Freq: ${freq}/window  |  Total: ${picks} picks`);
  }

  console.log('\n🎖️  IRON PROGRESSION (avg irons collected)');
  console.log('─'.repeat(88));

  for (const arch of archetypes) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const irons = s.avgIronsCollected.padStart(5);
    console.log(`${name}  ${irons} irons`);
  }

  console.log('\n⚡ WANTED LEVEL PROGRESSION (peak wanted by archetype)');
  console.log('─'.repeat(88));

  for (const arch of archetypes) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const peak = s.avgPeakWanted.padStart(5);
    console.log(`${name}  Peak level: ${peak}`);
  }

  console.log('\n');
}

export function generateCharts(stats, config) {
  // ASCII sparkline chart helper
  function sparkline(value, maxValue, width = 20) {
    const chars = '▁▂▃▄▅▆▇█';
    const filled = Math.round((value / maxValue) * width);
    return chars[Math.min(7, Math.floor((filled / width) * 8))] + '░'.repeat(Math.max(0, width - filled - 1));
  }

  console.log('\n📈 SURVIVAL CURVE VISUALIZATION\n');

  const allArches = Object.keys(stats);
  const maxSurvival = Math.max(...allArches.map(a => parseFloat(stats[a].survivalRate)));

  for (const arch of allArches) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const spark = sparkline(parseFloat(s.survivalRate), maxSurvival);
    const pct = s.survivalRate.padStart(5) + '%';
    console.log(`${name} ${spark} ${pct}`);
  }

  console.log('\n📊 WIN RATE VISUALIZATION\n');

  const maxWin = Math.max(...allArches.map(a => parseFloat(stats[a].winRate)));

  for (const arch of allArches) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const spark = sparkline(parseFloat(s.winRate), maxWin);
    const pct = s.winRate.padStart(5) + '%';
    console.log(`${name} ${spark} ${pct}`);
  }

  console.log('\n🎯 INTERACTION FREQUENCY VISUALIZATION\n');

  const maxFreq = Math.max(...allArches.map(a => parseFloat(stats[a].avgInteractionFrequency)));

  for (const arch of allArches) {
    const s = stats[arch];
    const name = (config.ARCHETYPE_LABELS?.[arch] || arch).padEnd(23);
    const spark = sparkline(parseFloat(s.avgInteractionFrequency), maxFreq);
    const freq = s.avgInteractionFrequency.padStart(5);
    console.log(`${name} ${spark} ${freq}/window`);
  }

  console.log('\n');
}

export default { computeRollingStats, printRollingStats, generateCharts };
