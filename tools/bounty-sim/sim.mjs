#!/usr/bin/env node
// ── Bounty Hunter Simulation — CLI Entry Point ──
//
// Usage:
//   node tools/bounty-sim/sim.mjs              # Stats + chart (default)
//   node tools/bounty-sim/sim.mjs --stats      # Stats only
//   node tools/bounty-sim/sim.mjs --chart      # Chart only
//   node tools/bounty-sim/sim.mjs --runs=500   # Override run count
//   node tools/bounty-sim/sim.mjs --rounds=20  # Override rounds
//   node tools/bounty-sim/sim.mjs --serve      # Interactive dashboard in browser
//   node tools/bounty-sim/sim.mjs --watch      # Stats + auto-rerun on file save + diffs
//   node tools/bounty-sim/sim.mjs --tui        # Full interactive terminal dashboard
//   node tools/bounty-sim/sim.mjs --watch --serve  # Watch + serve together

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { NUM_RUNS, NUM_ROUNDS, ARCHETYPES, ARCHETYPE_LABELS, ARCHETYPE_COLORS, SAMPLE_RUNS, PICKS_PER_ROUND, ANTE_BASE } from './config.mjs';
import { printDetailedResults, printSummaryTable, computeStats, computeHistogram } from './stats.mjs';
import { generateChart } from './chart.mjs';
import { runSimulation, runTrackedSimulation } from './runner.mjs';
import { createEngine } from './engine.mjs';
import * as defaultIronsMod from './irons.mjs';
import * as defaultArchetypesMod from './archetypes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Parse CLI args ──
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

const statsOnly = getFlag('stats');
const chartOnly = getFlag('chart');
const serve = getFlag('serve');
const watch = getFlag('watch');
const tui = getFlag('tui');
const numRuns = getOption('runs', NUM_RUNS);
const numRounds = getOption('rounds', NUM_ROUNDS);

// ── TUI mode: hand off entirely ──
if (tui) {
  const { startTUI } = await import('./tui.mjs');
  startTUI({ numRuns, numRounds });
  // TUI takes over — nothing below runs
} else if (watch) {
  // ── Watch mode ──
  const { startWatch } = await import('./watch.mjs');
  const { computeDiff, printDiffTable } = await import('./diff.mjs');
  const { reimportModules } = await import('./runner.mjs');

  let previous = null;

  async function runOnce(modules = null) {
    const t0 = performance.now();
    const { allResults } = runSimulation({ numRuns, numRounds, modules });
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

    console.clear();
    printDetailedResults(allResults, { numRuns, numRounds });
    printSummaryTable(allResults, { numRuns });

    const current = computeStats(allResults, { numRuns });
    if (previous) {
      const diff = computeDiff(previous, current);
      printDiffTable(diff);
    }
    previous = current;

    console.log(`\n⏱  ${elapsed}s | Watching for changes… (Ctrl+C to stop)`);
  }

  // Initial run with static imports
  await runOnce();

  // Start watcher
  startWatch({
    basePath: __dirname,
    onRerun: async () => {
      try {
        const modules = await reimportModules();
        await runOnce(modules);
      } catch (err) {
        console.error('\nRerun error:', err.message);
      }
    },
  });

  // Also start serve if requested
  if (serve) {
    startServeServer();
  }
} else {
  // ── Normal mode ──
  const doStats = !chartOnly;
  const doChart = !statsOnly || serve;

  if (doStats) {
    const { allResults } = runSimulation({ numRuns, numRounds });
    printDetailedResults(allResults, { numRuns, numRounds });
    printSummaryTable(allResults, { numRuns });
  }

  if (doChart) {
    generateChart({ numRounds });
  }

  if (serve) {
    startServeServer();
  }
}

// ── Build an archetypesMod from POSTed profile overrides ──
// Replaces the complex per-archetype behavior with flat rates from the form.
function buildArchetypesMod(profiles) {
  return {
    getPlayerAction(player, state) {
      const p = profiles[player.type];
      if (!p) return defaultArchetypesMod.getPlayerAction(player, state);

      const conf = p.confidence === 0
        ? [1, 2, 3][Math.floor(Math.random() * 3)]
        : p.confidence;

      // Skip check first
      if (p.skip > 0 && Math.random() * 100 < p.skip) {
        return { action: 'skip', confidence: conf };
      }
      // Holster check
      if (p.holster > 0 && Math.random() * 100 < p.holster) {
        return { action: 'holster', confidence: conf };
      }
      // Directional (coin flip)
      return { action: Math.random() < 0.5 ? 'rise' : 'fall', confidence: conf };
    },
    getAccuracy(player, state) {
      const p = profiles[player.type];
      if (!p) return defaultArchetypesMod.getAccuracy(player, state);
      return p.accuracy / 100;
    },
    pickIron: defaultArchetypesMod.pickIron,
    ironPriority: defaultArchetypesMod.ironPriority,
  };
}

// ── Build a configMod from POSTed config values ──
function buildConfigMod(cfg) {
  return {
    STARTING_BALANCE: cfg.game.startingBalance,
    PICKS_PER_ROUND: cfg.game.picksPerRound,
    NUM_ROUNDS: cfg.game.numRounds,
    STARTING_CHAMBERS: cfg.game.startingChambers,
    DIR_SCORING: cfg.scoring.dir,
    HOL_SCORING: cfg.scoring.hol,
    NOTORIETY_WEIGHT: cfg.notoriety.weight,
    NOTORIETY_UP_THRESHOLD: cfg.notoriety.upThreshold,
    NOTORIETY_DOWN_THRESHOLD: cfg.notoriety.downThreshold,
    wantedMultiplier: (level) => {
      if (cfg.wanted.mult[level]) return cfg.wanted.mult[level];
      return Math.round(cfg.wanted.mult[10] * Math.pow(cfg.wanted.overflowBase, level - 10));
    },
    skipCost: (n, balance) => {
      return Math.ceil(cfg.skip.base * Math.pow(cfg.skip.exp, n - 1) * Math.max(1, balance / cfg.skip.div));
    },
    roundAnte: () => cfg.game.anteBase,
  };
}

// ── HTTP Server for --serve ──
function startServeServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    // ── POST /api/simulate — run with custom config ──
    if (req.method === 'POST' && url.pathname === '/api/simulate') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const cfg = JSON.parse(body);
          const configMod = buildConfigMod(cfg);
          const archetypesMod = cfg.profiles
            ? buildArchetypesMod(cfg.profiles)
            : defaultArchetypesMod;
          const engine = createEngine(configMod, defaultIronsMod, archetypesMod);

          // Stats runs
          const statRuns = cfg.sim.statRuns || 200;
          const allResults = {};
          for (const type of ARCHETYPES) {
            allResults[type] = [];
            for (let i = 0; i < statRuns; i++) {
              allResults[type].push(engine.simulateRun(type, { numRounds: cfg.game.numRounds }));
            }
          }
          const stats = computeStats(allResults, { numRuns: statRuns });

          // Chart runs
          const sampleRuns = cfg.sim.sampleRuns || 5;
          const chartData = {};
          for (const type of ARCHETYPES) {
            chartData[type] = [];
            for (let i = 0; i < sampleRuns; i++) {
              chartData[type].push(engine.simulateRunTracked(type, { numRounds: cfg.game.numRounds }));
            }
          }

          const histogram = computeHistogram(allResults, { numRuns: statRuns });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ stats, chartData, histogram }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/rerun') {
      const { allData } = runTrackedSimulation({ numRounds });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(allData));
      return;
    }

    if (url.pathname === '/api/stats') {
      const { allResults } = runSimulation({ numRuns, numRounds });
      const stats = computeStats(allResults, { numRuns });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(stats));
      return;
    }

    // ── Serve dashboard HTML ──
    import('./dashboard.mjs').then(({ generateDashboardHTML }) => {
      const html = generateDashboardHTML();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    }).catch(() => {
      res.writeHead(500);
      res.end('Failed to generate dashboard.');
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort 8080 already in use. Run: fuser -k 8080/tcp`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  server.listen(8080, () => {
    const url = 'http://localhost:8080';
    console.log('');
    console.log(`Dashboard at ${url}`);
    console.log('Press Ctrl+C to stop.');
    try { execSync(`xdg-open ${url}`, { stdio: 'ignore' }); } catch {}
  });
}
