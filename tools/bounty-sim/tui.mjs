// ── Bounty Hunter Simulation — Terminal Dashboard (TUI) ──
// Zero npm deps — readline raw mode + ANSI escape codes

import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { ARCHETYPES, ARCHETYPE_LABELS, NUM_RUNS, NUM_ROUNDS } from './config.mjs';
import { runSimulation, runTrackedSimulation, reimportModules } from './runner.mjs';
import { computeStats, formatSummaryLines } from './stats.mjs';
import { computeDiff, formatDiffLines } from './diff.mjs';
import { startWatch } from './watch.mjs';
import { generateChart } from './chart.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── ANSI helpers ──
const ESC = '\x1b[';
const CLEAR = ESC + '2J' + ESC + 'H';
const HIDE_CURSOR = ESC + '?25l';
const SHOW_CURSOR = ESC + '?25h';
const BOLD = ESC + '1m';
const DIM = ESC + '2m';
const RESET = ESC + '0m';
const GREEN = ESC + '32m';
const RED = ESC + '31m';
const YELLOW = ESC + '33m';
const CYAN = ESC + '36m';
const MAGENTA = ESC + '35m';
const WHITE = ESC + '37m';
const BG_DARK = ESC + '48;5;234m';

function box(text, width) {
  return '│ ' + text + ' '.repeat(Math.max(0, width - stripAnsi(text).length - 4)) + ' │';
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function hline(width, left = '├', right = '┤') {
  return left + '─'.repeat(width - 2) + right;
}

// ── TUI State ──
export function startTUI({ numRuns: initRuns = NUM_RUNS, numRounds: initRounds = NUM_ROUNDS } = {}) {
  let numRuns = initRuns;
  let numRounds = initRounds;
  let enabled = {};
  for (const type of ARCHETYPES) enabled[type] = true;

  let currentStats = null;
  let previousStats = null;
  let diff = null;
  let lastElapsed = 0;
  let running = false;
  let watching = false;
  let serving = false;
  let watchHandle = null;
  let serverHandle = null;

  // ── Run simulation ──
  async function rerun(modules = null) {
    if (running) return;
    running = true;

    const activeArchetypes = ARCHETYPES.filter(t => enabled[t]);
    const t0 = performance.now();
    const { allResults } = runSimulation({
      numRuns, numRounds, archetypes: activeArchetypes, modules,
    });
    lastElapsed = ((performance.now() - t0) / 1000).toFixed(1);

    previousStats = currentStats;
    currentStats = computeStats(allResults, { numRuns, archetypes: activeArchetypes });

    if (previousStats) {
      diff = computeDiff(previousStats, currentStats);
    }

    running = false;
    render();
  }

  // ── Render ──
  function render() {
    const W = Math.min(process.stdout.columns || 80, 100);
    const lines = [];

    // Header
    lines.push('┌' + '─'.repeat(W - 2) + '┐');
    const title = `${BOLD}${YELLOW}BOUNTY SIM${RESET}       Runs: ${numRuns}   Rounds: ${numRounds}`;
    const rightInfo = `[last run: ${lastElapsed}s]`;
    const titleLine = `  ${title}` + ' '.repeat(Math.max(0, W - stripAnsi(title).length - rightInfo.length - 6)) + rightInfo + '  ';
    lines.push(box(titleLine, W));
    lines.push(hline(W));

    // Stats table header
    const hdr = '  ' +
      'Archetype'.padEnd(24) +
      'Med Final'.padStart(12) +
      'Med Peak'.padStart(12) +
      'Bust%'.padStart(7) +
      'PkLv'.padStart(6) +
      '  Delta';
    lines.push(box(hdr, W));
    lines.push(box('  ' + '─'.repeat(Math.min(W - 6, 73)), W));

    // Per-archetype rows
    for (let i = 0; i < ARCHETYPES.length; i++) {
      const type = ARCHETYPES[i];
      const check = enabled[type] ? GREEN + '[x]' + RESET : DIM + '[ ]' + RESET;
      const key = DIM + (i + 1 === 10 ? '0' : String(i + 1)) + RESET;
      const label = ARCHETYPE_LABELS[type];

      let row;
      const s = currentStats && currentStats[type];
      if (s) {
        let deltaStr = '';
        if (diff && diff[type]) {
          const d = diff[type].medFinal.delta;
          if (d > 0) deltaStr = GREEN + '↑ +$' + d.toLocaleString() + RESET;
          else if (d < 0) deltaStr = RED + '↓ -$' + Math.abs(d).toLocaleString() + RESET;
        }

        row = `  ${key} ${check} ${label.padEnd(20)}` +
          ('$' + s.medFinal.toLocaleString()).padStart(12) +
          ('$' + s.medPeak.toLocaleString()).padStart(12) +
          ((s.bustRate * 100).toFixed(0) + '%').padStart(7) +
          s.peakWanted.toString().padStart(6) +
          '  ' + deltaStr;
      } else {
        row = `  ${key} ${check} ${DIM}${label}${RESET}`;
      }

      lines.push(box(row, W));
    }

    // Status indicators
    lines.push(hline(W));
    const watchStatus = watching ? GREEN + 'ON' + RESET : DIM + 'OFF' + RESET;
    const serveStatus = serving ? GREEN + 'ON :8080' + RESET : DIM + 'OFF' + RESET;
    lines.push(box(`  Watch: ${watchStatus}    Serve: ${serveStatus}    ${running ? YELLOW + 'Running…' + RESET : ''}`, W));

    // Diff lines
    if (diff) {
      lines.push(hline(W));
      const diffLines = formatDiffLines(diff);
      for (const dl of diffLines.slice(0, 6)) {
        lines.push(box('  ' + dl, W));
      }
    }

    // Keybindings
    lines.push(hline(W));
    lines.push(box(`  ${BOLD}[1-0]${RESET} toggle  ${BOLD}[r]${RESET} rerun  ${BOLD}[c]${RESET} chart  ${BOLD}[+/-]${RESET} runs  ${BOLD}[</>]${RESET} rounds`, W));
    lines.push(box(`  ${BOLD}[w]${RESET} watch   ${BOLD}[d]${RESET} diff   ${BOLD}[s]${RESET} serve  ${BOLD}[q]${RESET} quit`, W));
    lines.push('└' + '─'.repeat(W - 2) + '┘');

    // Single write to avoid flicker
    process.stdout.write(CLEAR + HIDE_CURSOR + lines.join('\n') + '\n');
  }

  // ── Keyboard handler ──
  function handleKey(key) {
    // Ctrl+C / q
    if (key === '\x03' || key === 'q') {
      cleanup();
      return;
    }

    // Number keys: toggle archetypes (1-9 = index 0-8, 0 = index 9)
    if (key >= '1' && key <= '9') {
      const idx = parseInt(key) - 1;
      if (idx < ARCHETYPES.length) {
        enabled[ARCHETYPES[idx]] = !enabled[ARCHETYPES[idx]];
        render();
      }
      return;
    }
    if (key === '0') {
      if (ARCHETYPES.length >= 10) {
        enabled[ARCHETYPES[9]] = !enabled[ARCHETYPES[9]];
        render();
      }
      return;
    }

    // r — rerun
    if (key === 'r') {
      rerun();
      return;
    }

    // c — generate chart
    if (key === 'c') {
      try {
        generateChart({ numRounds, serveMode: serving });
      } catch (err) {
        // ignore
      }
      render();
      return;
    }

    // + — increase runs
    if (key === '+' || key === '=') {
      if (numRuns < 1000) numRuns = Math.min(1000, numRuns + 50);
      render();
      return;
    }

    // - — decrease runs
    if (key === '-' || key === '_') {
      if (numRuns > 10) numRuns = Math.max(10, numRuns - 50);
      render();
      return;
    }

    // > — increase rounds
    if (key === '>' || key === '.') {
      if (numRounds < 50) numRounds++;
      render();
      return;
    }

    // < — decrease rounds
    if (key === '<' || key === ',') {
      if (numRounds > 1) numRounds--;
      render();
      return;
    }

    // w — toggle watch
    if (key === 'w') {
      if (watching) {
        if (watchHandle) { watchHandle.stop(); watchHandle = null; }
        watching = false;
      } else {
        watching = true;
        watchHandle = startWatch({
          basePath: __dirname,
          onRerun: async () => {
            try {
              const modules = await reimportModules();
              await rerun(modules);
            } catch (err) {
              // render error message
            }
          },
        });
      }
      render();
      return;
    }

    // d — force diff (re-run and show diff)
    if (key === 'd') {
      rerun();
      return;
    }

    // s — toggle serve
    if (key === 's') {
      if (serving) {
        if (serverHandle) {
          serverHandle.close();
          serverHandle = null;
        }
        serving = false;
      } else {
        serving = true;
        startServe();
      }
      render();
      return;
    }
  }

  // ── HTTP Server ──
  function startServe() {
    import('node:http').then(({ createServer }) => {
      import('node:fs').then(({ readFileSync }) => {
        import('node:path').then(({ join }) => {
          const chartPath = join(__dirname, 'output', 'chart.html');

          serverHandle = createServer((req, res) => {
            const url = new URL(req.url, 'http://localhost');

            if (url.pathname === '/api/rerun') {
              const { allData } = runTrackedSimulation({ numRounds });
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify(allData));
              return;
            }

            if (url.pathname === '/api/stats') {
              const activeArchetypes = ARCHETYPES.filter(t => enabled[t]);
              const { allResults } = runSimulation({ numRuns, numRounds, archetypes: activeArchetypes });
              const stats = computeStats(allResults, { numRuns, archetypes: activeArchetypes });
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify(stats));
              return;
            }

            try {
              generateChart({ numRounds, serveMode: true });
              const html = readFileSync(chartPath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(html);
            } catch {
              res.writeHead(404);
              res.end('Chart not found.');
            }
          });

          serverHandle.on('error', (err) => {
            serving = false;
            render();
          });

          serverHandle.listen(8080, () => {
            render();
          });
        });
      });
    });
  }

  // ── Cleanup ──
  function cleanup() {
    process.stdout.write(SHOW_CURSOR + '\n');
    if (watchHandle) watchHandle.stop();
    if (serverHandle) serverHandle.close();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.exit(0);
  }

  // ── Init ──
  if (!process.stdin.isTTY) {
    console.error('TUI mode requires an interactive terminal (TTY). Run without --tui for piped/scripted usage.');
    process.exit(1);
  }
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', handleKey);
  process.on('SIGINT', cleanup);

  // Initial run
  rerun();
}
