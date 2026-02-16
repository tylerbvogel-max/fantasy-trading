// ── Bounty Hunter Simulation — Statistics & Table Formatting ──

import {
  NUM_RUNS, NUM_ROUNDS, PICKS_PER_ROUND, STARTING_BALANCE, ANTE_BASE,
  ARCHETYPES, ARCHETYPE_LABELS,
} from './config.mjs';
import { IRONS } from './irons.mjs';
import { topIronPreferences } from './archetypes.mjs';

// ── Statistical helpers ──
export function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

export function median(arr) {
  return percentile(arr, 0.5);
}

export function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ── Detailed per-archetype box output ──
export function printDetailedResults(allResults, { numRuns = NUM_RUNS, numRounds = NUM_ROUNDS } = {}) {
  console.log('='.repeat(130));
  console.log(`BOUNTY HUNTER SIM V4 — WITH IRONS — 10 Archetypes × ${numRuns} Runs × ${numRounds} Rounds (${PICKS_PER_ROUND} picks/round)`);
  console.log(`Starting: $${STARTING_BALANCE.toLocaleString()} | 2 chambers | Pick 1 of 3 Irons after each round | $${ANTE_BASE} flat ante`);
  console.log('='.repeat(130));
  console.log('');

  for (const type of ARCHETYPES) {
    const runs = allResults[type];
    const finals = runs.map(r => r.finalBalance);
    const peaks = runs.map(r => r.peakBalance);
    const peakWanteds = runs.map(r => r.peakWanted);
    const bustCount = runs.filter(r => r.busted).length;
    const bustedRuns = runs.filter(r => r.busted);
    const survivedRounds = bustedRuns.map(r => r.roundsSurvived);
    const irons = runs.map(r => r.ironsCollected);
    const label = ARCHETYPE_LABELS[type];

    console.log(`┌─ ${label} ${'─'.repeat(Math.max(0, 105 - label.length))}┐`);
    console.log(`│  Final Balance    │  Median: $${median(finals).toLocaleString().padStart(12)}  │  P10: $${percentile(finals, 0.1).toLocaleString().padStart(12)}  │  P90: $${percentile(finals, 0.9).toLocaleString().padStart(12)}  │`);
    console.log(`│  Peak Balance     │  Median: $${median(peaks).toLocaleString().padStart(12)}  │  P10: $${percentile(peaks, 0.1).toLocaleString().padStart(12)}  │  P90: $${percentile(peaks, 0.9).toLocaleString().padStart(12)}  │`);
    console.log(`│  Peak Wanted Lv   │  Median: ${median(peakWanteds).toString().padStart(3)}       │  Max: ${Math.max(...peakWanteds).toString().padStart(3)}        │  Min: ${Math.min(...peakWanteds).toString().padStart(3)}        │`);
    console.log(`│  Irons Collected  │  Median: ${median(irons).toString().padStart(3)}       │  Avg: ${mean(irons).toFixed(1).padStart(5)}      │                          │`);
    console.log(`│  Bust Rate        │  ${bustCount}/${numRuns} (${(bustCount / numRuns * 100).toFixed(0)}%)`.padEnd(110) + '│');
    if (bustedRuns.length > 0) {
      console.log(`│  Avg Bust Round   │  ${mean(survivedRounds).toFixed(1)} / ${numRounds}`.padEnd(110) + '│');
    }
    console.log(`└${'─'.repeat(109)}┘`);
    console.log('');
  }
}

// ── Compact summary table ──
export function printSummaryTable(allResults, { numRuns = NUM_RUNS } = {}) {
  console.log('='.repeat(130));
  console.log('SUMMARY');
  console.log('='.repeat(130));
  console.log('');
  console.log('Archetype'.padEnd(24) + 'Med Final'.padStart(14) + 'Med Peak'.padStart(14) + 'Bust %'.padStart(10) + 'Peak Lv'.padStart(10) + 'Irons'.padStart(8) + '  Risk Profile');
  console.log('─'.repeat(110));

  for (const type of ARCHETYPES) {
    const runs = allResults[type];
    const finals = runs.map(r => r.finalBalance);
    const peaks = runs.map(r => r.peakBalance);
    const peakWanteds = runs.map(r => r.peakWanted);
    const irons = runs.map(r => r.ironsCollected);
    const bustRate = runs.filter(r => r.busted).length / numRuns;

    let risk = '';
    if (bustRate > 0.6) risk = '☠️  VERY HIGH RISK';
    else if (bustRate > 0.3) risk = '🔥 HIGH RISK';
    else if (bustRate > 0.1) risk = '⚠️  MODERATE';
    else if (bustRate > 0) risk = '🛡️  LOW RISK';
    else risk = '✅ SAFE';

    console.log(
      ARCHETYPE_LABELS[type].padEnd(24) +
      ('$' + median(finals).toLocaleString()).padStart(14) +
      ('$' + median(peaks).toLocaleString()).padStart(14) +
      (bustRate * 100).toFixed(0).padStart(8) + '%' +
      median(peakWanteds).toString().padStart(9) +
      median(irons).toString().padStart(7) +
      '  ' + risk
    );
  }

  console.log('');
  console.log('─'.repeat(110));

  // Iron popularity
  console.log('');
  console.log('MOST POPULAR IRONS BY ARCHETYPE (top 3 preference):');
  console.log('─'.repeat(110));
  for (const type of ARCHETYPES) {
    const top = topIronPreferences(type, 3);
    const top3 = top ? top.map(i => i.name).join(', ') : 'Random';
    console.log(`  ${ARCHETYPE_LABELS[type].padEnd(22)} → ${top3}`);
  }
  console.log('');
}

// ── Programmatic stats access (for TUI + diff) ──
export function computeStats(allResults, { numRuns = NUM_RUNS, archetypes = ARCHETYPES } = {}) {
  const stats = {};
  for (const type of archetypes) {
    const runs = allResults[type];
    if (!runs) continue;
    const finals = runs.map(r => r.finalBalance);
    const peaks = runs.map(r => r.peakBalance);
    const peakWanteds = runs.map(r => r.peakWanted);
    const irons = runs.map(r => r.ironsCollected);
    const bustCount = runs.filter(r => r.busted).length;
    stats[type] = {
      label: ARCHETYPE_LABELS[type],
      medFinal: median(finals),
      medPeak: median(peaks),
      bustRate: bustCount / numRuns,
      peakWanted: median(peakWanteds),
      medIrons: median(irons),
      p10Final: percentile(finals, 0.1),
      p90Final: percentile(finals, 0.9),
      minFinal: Math.min(...finals),
      maxFinal: Math.max(...finals),
      minPeak: Math.min(...peaks),
      maxPeak: Math.max(...peaks),
    };
  }
  return stats;
}

// ── Histogram: bucket final balances into ranges ──
const HIST_BUCKETS = [
  { label: 'Busted',    max: 0 },
  { label: '$1-2.5k',   max: 2500 },
  { label: '$2.5-5k',   max: 5000 },
  { label: '$5-10k',    max: 10000 },
  { label: '$10-25k',   max: 25000 },
  { label: '$25-50k',   max: 50000 },
  { label: '$50-100k',  max: 100000 },
  { label: '$100k+',    max: Infinity },
];

export function computeHistogram(allResults, { numRuns = NUM_RUNS, archetypes = ARCHETYPES } = {}) {
  const data = {};
  for (const type of archetypes) {
    const runs = allResults[type];
    if (!runs) continue;
    const counts = new Array(HIST_BUCKETS.length).fill(0);
    for (const r of runs) {
      for (let i = 0; i < HIST_BUCKETS.length; i++) {
        if (r.finalBalance <= HIST_BUCKETS[i].max) { counts[i]++; break; }
      }
    }
    data[type] = counts.map(c => Math.round(c / numRuns * 100));
  }
  return { buckets: HIST_BUCKETS.map(b => b.label), data };
}

export function formatSummaryLines(allResults, { numRuns = NUM_RUNS, archetypes = ARCHETYPES } = {}) {
  const stats = computeStats(allResults, { numRuns, archetypes });
  const lines = [];
  lines.push('Archetype'.padEnd(24) + 'Med Final'.padStart(14) + 'Med Peak'.padStart(14) + 'Bust%'.padStart(8) + 'PkLv'.padStart(6) + 'Irons'.padStart(7));
  lines.push('─'.repeat(73));
  for (const type of archetypes) {
    const s = stats[type];
    if (!s) continue;
    lines.push(
      s.label.padEnd(24) +
      ('$' + s.medFinal.toLocaleString()).padStart(14) +
      ('$' + s.medPeak.toLocaleString()).padStart(14) +
      ((s.bustRate * 100).toFixed(0) + '%').padStart(8) +
      s.peakWanted.toString().padStart(6) +
      s.medIrons.toString().padStart(7)
    );
  }
  return lines;
}
