// ── Bounty Hunter Simulation — Before/After Diff ──

import { ARCHETYPES, ARCHETYPE_LABELS } from './config.mjs';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ── Compare two stats snapshots ──
// Both `previous` and `current` are objects from computeStats():
//   { [type]: { label, medFinal, medPeak, bustRate, peakWanted, medIrons } }
export function computeDiff(previous, current) {
  const diff = {};
  const types = Object.keys(current);

  for (const type of types) {
    const prev = previous[type];
    const curr = current[type];
    if (!prev || !curr) continue;

    diff[type] = {
      label: curr.label,
      medFinal: { prev: prev.medFinal, curr: curr.medFinal, delta: curr.medFinal - prev.medFinal },
      medPeak: { prev: prev.medPeak, curr: curr.medPeak, delta: curr.medPeak - prev.medPeak },
      bustRate: { prev: prev.bustRate, curr: curr.bustRate, delta: curr.bustRate - prev.bustRate },
      peakWanted: { prev: prev.peakWanted, curr: curr.peakWanted, delta: curr.peakWanted - prev.peakWanted },
      medIrons: { prev: prev.medIrons, curr: curr.medIrons, delta: curr.medIrons - prev.medIrons },
    };
  }

  return diff;
}

// ── Format a dollar delta with color ──
function fmtDollar(delta) {
  if (delta === 0) return DIM + '  ─' + RESET;
  const sign = delta > 0 ? '↑' : '↓';
  const color = delta > 0 ? GREEN : RED;
  return color + sign + ' $' + Math.abs(delta).toLocaleString() + RESET;
}

// ── Format a percentage-point delta with color ──
function fmtPct(delta) {
  if (Math.abs(delta) < 0.005) return DIM + '  ─' + RESET;
  const sign = delta > 0 ? '↑' : '↓';
  // For bust rate, going UP is bad (red), going DOWN is good (green)
  const color = delta > 0 ? RED : GREEN;
  return color + sign + ' ' + (Math.abs(delta) * 100).toFixed(0) + 'pp' + RESET;
}

// ── Format an integer delta ──
function fmtInt(delta, invertColor = false) {
  if (delta === 0) return DIM + '  ─' + RESET;
  const sign = delta > 0 ? '↑' : '↓';
  const color = invertColor
    ? (delta > 0 ? RED : GREEN)    // Higher is worse (e.g. wanted level)
    : (delta > 0 ? GREEN : RED);   // Higher is better
  return color + sign + ' ' + Math.abs(delta) + RESET;
}

// ── Print colored diff table ──
export function printDiffTable(diff) {
  const types = Object.keys(diff);
  if (types.length === 0) return;

  console.log('');
  console.log(YELLOW + '── CHANGES FROM PREVIOUS RUN ──' + RESET);
  console.log('Archetype'.padEnd(24) + 'Med Final'.padStart(16) + 'Med Peak'.padStart(16) + 'Bust%'.padStart(12) + 'PkLv'.padStart(8));
  console.log('─'.repeat(76));

  for (const type of types) {
    const d = diff[type];
    const anyChange = d.medFinal.delta !== 0 || d.medPeak.delta !== 0 ||
                      Math.abs(d.bustRate.delta) >= 0.005 || d.peakWanted.delta !== 0;
    if (!anyChange) continue;

    console.log(
      d.label.padEnd(24) +
      fmtDollar(d.medFinal.delta).padStart(28) +   // extra padding for ANSI
      fmtDollar(d.medPeak.delta).padStart(28) +
      fmtPct(d.bustRate.delta).padStart(24) +
      fmtInt(d.peakWanted.delta, true).padStart(20)
    );
  }
  console.log('');
}

// ── Return diff as string array (for TUI rendering) ──
export function formatDiffLines(diff) {
  const types = Object.keys(diff);
  if (types.length === 0) return ['  No previous run to compare.'];

  const lines = [];
  lines.push(YELLOW + '── CHANGES ──' + RESET);

  for (const type of types) {
    const d = diff[type];
    const anyChange = d.medFinal.delta !== 0 || d.medPeak.delta !== 0 ||
                      Math.abs(d.bustRate.delta) >= 0.005 || d.peakWanted.delta !== 0;
    if (!anyChange) continue;

    lines.push(
      '  ' + d.label.padEnd(22) +
      fmtDollar(d.medFinal.delta) + '  ' +
      fmtDollar(d.medPeak.delta) + '  ' +
      fmtPct(d.bustRate.delta)
    );
  }

  if (lines.length === 1) lines.push('  No significant changes.');
  return lines;
}
