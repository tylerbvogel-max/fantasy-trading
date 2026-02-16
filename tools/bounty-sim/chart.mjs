// ── Bounty Hunter Simulation — Chart.js HTML Generator ──

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  NUM_ROUNDS, PICKS_PER_ROUND, ANTE_BASE, SAMPLE_RUNS,
  ARCHETYPES, ARCHETYPE_LABELS, ARCHETYPE_COLORS,
} from './config.mjs';
import { simulateRunTracked } from './engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function generateChart({ numRounds = NUM_ROUNDS, sampleRuns = SAMPLE_RUNS, serveMode = false } = {}) {
  const allData = {};
  for (const type of ARCHETYPES) {
    allData[type] = [];
    for (let i = 0; i < sampleRuns; i++) {
      allData[type].push(simulateRunTracked(type, { numRounds }));
    }
  }

  // Build Chart.js datasets
  const datasets = [];
  for (const type of ARCHETYPES) {
    const color = ARCHETYPE_COLORS[type];
    allData[type].forEach((run, idx) => {
      datasets.push({
        label: idx === 0 ? ARCHETYPE_LABELS[type] : '',
        data: run.balanceHistory,
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: idx === 0 ? 2.5 : 1,
        borderDash: idx === 0 ? [] : [4, 3],
        pointRadius: 0,
        tension: 0.2,
        hidden: false,
        _archetype: type,
      });
    });
  }

  const roundLabels = Array.from({ length: numRounds + 1 }, (_, i) => i === 0 ? 'Start' : `R${i}`);

  // Compute per-archetype stats for overlay
  const statsData = {};
  for (const type of ARCHETYPES) {
    const finals = allData[type].map(r => r.balanceHistory[r.balanceHistory.length - 1]);
    const peaks = allData[type].map(r => Math.max(...r.balanceHistory));
    const busts = allData[type].filter(r => r.busted).length;
    finals.sort((a, b) => a - b);
    peaks.sort((a, b) => a - b);
    statsData[type] = {
      label: ARCHETYPE_LABELS[type],
      color: ARCHETYPE_COLORS[type],
      medFinal: finals[Math.floor(finals.length / 2)],
      medPeak: peaks[Math.floor(peaks.length / 2)],
      bustRate: ((busts / sampleRuns) * 100).toFixed(0),
    };
  }

  const rerollScript = serveMode ? `
    document.getElementById('rerollBtn').style.display = 'inline-block';
    document.getElementById('rerollBtn').addEventListener('click', async () => {
      const btn = document.getElementById('rerollBtn');
      btn.textContent = 'Rolling…';
      btn.disabled = true;
      try {
        const res = await fetch('/api/rerun');
        const allData = await res.json();
        const archetypes = ${JSON.stringify(ARCHETYPES)};
        const colors = ${JSON.stringify(ARCHETYPE_COLORS)};
        const labels = ${JSON.stringify(ARCHETYPE_LABELS)};
        const newDatasets = [];
        for (const type of archetypes) {
          const runs = allData[type] || [];
          runs.forEach((run, idx) => {
            newDatasets.push({
              label: idx === 0 ? labels[type] : '',
              data: run.balanceHistory,
              borderColor: colors[type],
              backgroundColor: 'transparent',
              borderWidth: idx === 0 ? 2.5 : 1,
              borderDash: idx === 0 ? [] : [4, 3],
              pointRadius: 0,
              tension: 0.2,
              hidden: false,
              _archetype: type,
            });
          });
        }
        chart.data.datasets = newDatasets;
        // Re-apply checkbox states
        document.querySelectorAll('.toggle-cb').forEach(cb => {
          const arch = cb.dataset.archetype;
          const hidden = !cb.checked;
          chart.data.datasets.forEach((ds, i) => {
            if (ds._archetype === arch) {
              chart.getDatasetMeta(i).hidden = hidden;
            }
          });
        });
        chart.update();
        updateStatsOverlay();
      } catch (err) {
        console.error('Rerun failed:', err);
      } finally {
        btn.textContent = 'Re-roll';
        btn.disabled = false;
      }
    });
  ` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Bounty Hunter Simulation — Player Trajectories</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>
  <style>
    body { background: #0a0a0a; color: #e0e0e0; font-family: 'Courier New', monospace; margin: 0; padding: 20px; }
    h1 { color: #FAD009; text-align: center; font-size: 20px; margin-bottom: 4px; }
    h2 { color: #888; text-align: center; font-size: 13px; font-weight: normal; margin-top: 0; }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 12px; margin: 12px auto; max-width: 1300px; }
    .toggle-label { display: flex; align-items: center; gap: 5px; font-size: 12px; cursor: pointer; user-select: none; padding: 3px 8px; border-radius: 4px; transition: background 0.15s; }
    .toggle-label:hover { background: #1a1a1a; }
    .toggle-label input { cursor: pointer; accent-color: var(--color); }
    .swatch { width: 20px; height: 3px; border-radius: 2px; }
    #rerollBtn { display: none; background: #FAD009; color: #0a0a0a; border: none; padding: 6px 16px; font-family: 'Courier New', monospace; font-size: 12px; font-weight: bold; cursor: pointer; border-radius: 4px; margin-left: 12px; }
    #rerollBtn:hover { background: #e6c200; }
    #rerollBtn:disabled { opacity: 0.5; cursor: wait; }
    .chart-container { position: relative; width: 95vw; max-width: 1400px; height: 60vh; margin: 0 auto; }
    .stats-panel { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 16px auto; max-width: 1300px; }
    .stat-card { background: #111; border: 1px solid #222; border-radius: 6px; padding: 8px 12px; font-size: 11px; min-width: 140px; }
    .stat-card .name { font-weight: bold; margin-bottom: 4px; }
    .stat-card .row { display: flex; justify-content: space-between; gap: 12px; }
    .stat-card .val { color: #aaa; }
    .note { text-align: center; color: #666; font-size: 11px; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>BOUNTY HUNTER — Player Trajectory Simulation</h1>
  <h2>${numRounds} rounds | ${PICKS_PER_ROUND} picks/round | $${ANTE_BASE} ante | Irons (pick 1 of 3/round) | ${sampleRuns} sample runs per archetype</h2>

  <div class="controls">
    ${ARCHETYPES.map(type => `<label class="toggle-label" style="--color:${ARCHETYPE_COLORS[type]}"><input type="checkbox" class="toggle-cb" data-archetype="${type}" checked><span class="swatch" style="background:${ARCHETYPE_COLORS[type]}"></span>${ARCHETYPE_LABELS[type]}</label>`).join('\n    ')}
    <button id="rerollBtn">Re-roll</button>
  </div>

  <div class="chart-container">
    <canvas id="mainChart"></canvas>
  </div>

  <div class="stats-panel" id="statsPanel">
    ${ARCHETYPES.map(type => {
      const s = statsData[type];
      return `<div class="stat-card" data-archetype="${type}" style="border-left: 3px solid ${s.color}"><div class="name" style="color:${s.color}">${s.label}</div><div class="row"><span>Med Final</span><span class="val">$${s.medFinal.toLocaleString()}</span></div><div class="row"><span>Med Peak</span><span class="val">$${s.medPeak.toLocaleString()}</span></div><div class="row"><span>Bust</span><span class="val">${s.bustRate}%</span></div></div>`;
    }).join('\n    ')}
  </div>

  <p class="note">Solid line = primary run | Dashed lines = additional sample runs | Flat line at bottom = busted</p>

  <script>
    const ctx = document.getElementById('mainChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(roundLabels)},
        datasets: ${JSON.stringify(datasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1a',
            titleColor: '#FAD009',
            bodyColor: '#e0e0e0',
            borderColor: '#333',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                if (!context.dataset.label) return null;
                return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
              }
            },
            filter: function(tooltipItem) { return tooltipItem.dataset.label !== ''; }
          }
        },
        scales: {
          x: {
            grid: { color: '#222' },
            ticks: { color: '#888', font: { family: 'Courier New' } },
            title: { display: true, text: 'Round', color: '#888' }
          },
          y: {
            grid: { color: '#222' },
            ticks: {
              color: '#888',
              font: { family: 'Courier New' },
              callback: function(val) { return '$' + val.toLocaleString(); }
            },
            title: { display: true, text: 'Balance ($)', color: '#888' }
          }
        }
      }
    });

    // Toggle archetype visibility
    document.querySelectorAll('.toggle-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const arch = cb.dataset.archetype;
        const hidden = !cb.checked;
        chart.data.datasets.forEach((ds, i) => {
          if (ds._archetype === arch) {
            chart.getDatasetMeta(i).hidden = hidden;
          }
        });
        chart.update();
        // Toggle stat card visibility
        const card = document.querySelector('.stat-card[data-archetype="' + arch + '"]');
        if (card) card.style.display = hidden ? 'none' : '';
      });
    });

    function updateStatsOverlay() {
      // When re-rolling via API, we could update stat cards — but the main
      // stats come from the static render, so this is a placeholder for now.
    }

    ${rerollScript}
  <\/script>
</body>
</html>`;

  const outPath = join(__dirname, 'output', 'chart.html');
  writeFileSync(outPath, html);
  console.log(`Chart saved to ${outPath}`);

  // Quick summary
  console.log('');
  console.log('Sample run final balances:');
  for (const type of ARCHETYPES) {
    const finals = allData[type].map(r => r.balanceHistory[r.balanceHistory.length - 1]);
    const busts = allData[type].filter(r => r.busted).length;
    console.log(`  ${ARCHETYPE_LABELS[type].padEnd(22)} → ${finals.map(f => ('$' + f.toLocaleString()).padStart(10)).join('  ')}  (${busts}/${sampleRuns} busted)`);
  }
}
