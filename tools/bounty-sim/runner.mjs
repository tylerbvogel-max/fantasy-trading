// ── Bounty Hunter Simulation — Centralized Runner ──

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ARCHETYPES, NUM_RUNS, NUM_ROUNDS, SAMPLE_RUNS } from './config.mjs';
import { simulateRun, simulateRunTracked, createEngine } from './engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Re-import modules with cache busting (for watch mode) ──
export async function reimportModules() {
  const t = '?t=' + Date.now();
  const base = pathToFileURL(__dirname + '/').href;
  const [configMod, ironsMod, archetypesMod] = await Promise.all([
    import(new URL('config.mjs' + t, base).href),
    import(new URL('irons.mjs' + t, base).href),
    import(new URL('archetypes.mjs' + t, base).href),
  ]);
  return { configMod, ironsMod, archetypesMod };
}

// ── Run full simulation (stats mode) ──
// If modules are provided, uses createEngine factory; otherwise uses static imports.
export function runSimulation({
  numRuns = NUM_RUNS,
  numRounds = NUM_ROUNDS,
  archetypes = ARCHETYPES,
  modules = null,
} = {}) {
  let simRun = simulateRun;

  if (modules) {
    const engine = createEngine(modules.configMod, modules.ironsMod, modules.archetypesMod);
    simRun = engine.simulateRun;
  }

  const allResults = {};
  for (const type of archetypes) {
    const runs = [];
    for (let i = 0; i < numRuns; i++) {
      runs.push(simRun(type, { numRounds }));
    }
    allResults[type] = runs;
  }

  return { allResults, config: { numRuns, numRounds, archetypes } };
}

// ── Run tracked simulation (chart mode) ──
export function runTrackedSimulation({
  numRounds = NUM_ROUNDS,
  sampleRuns = SAMPLE_RUNS,
  archetypes = ARCHETYPES,
  modules = null,
} = {}) {
  let simRunTracked = simulateRunTracked;

  if (modules) {
    const engine = createEngine(modules.configMod, modules.ironsMod, modules.archetypesMod);
    simRunTracked = engine.simulateRunTracked;
  }

  const allData = {};
  for (const type of archetypes) {
    allData[type] = [];
    for (let i = 0; i < sampleRuns; i++) {
      allData[type].push(simRunTracked(type, { numRounds }));
    }
  }

  return { allData, config: { numRounds, sampleRuns, archetypes } };
}
