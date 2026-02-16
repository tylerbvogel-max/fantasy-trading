// ── Bounty Hunter Simulation — Web Dashboard HTML Generator ──

import {
  STARTING_BALANCE, PICKS_PER_ROUND, NUM_ROUNDS, STARTING_CHAMBERS,
  ANTE_BASE, DIR_SCORING, HOL_SCORING, NUM_RUNS, SAMPLE_RUNS,
  WANTED_MULT, WANTED_OVERFLOW_BASE,
  NOTORIETY_WEIGHT, NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
  ARCHETYPES, ARCHETYPE_LABELS, ARCHETYPE_COLORS,
} from './config.mjs';

export function generateDashboardHTML() {
  const profileDefaults = {
    random_monkey:        { accuracy: 50, confidence: 0, holster: 33, skip: 0 },
    cautious_turtle:      { accuracy: 55, confidence: 1, holster: 50, skip: 0 },
    aggro_gambler:        { accuracy: 50, confidence: 3, holster: 0,  skip: 0 },
    newbie:               { accuracy: 45, confidence: 1, holster: 20, skip: 0 },
    hot_tilt:             { accuracy: 48, confidence: 2, holster: 5,  skip: 0 },
    comeback_grinder:     { accuracy: 50, confidence: 1, holster: 25, skip: 8 },
    optimizer:            { accuracy: 55, confidence: 2, holster: 17, skip: 0 },
    skip_burner:          { accuracy: 55, confidence: 2, holster: 15, skip: 40 },
    streaky_pro:          { accuracy: 55, confidence: 2, holster: 20, skip: 5 },
    conservative_climber: { accuracy: 55, confidence: 1, holster: 30, skip: 0 },
  };

  const strategies = {
    random_monkey:        'Pure chaos. Random everything.',
    cautious_turtle:      'Plays it safe. Half holsters, always low confidence.',
    aggro_gambler:        'All-in every pick. Max confidence, never holsters.',
    newbie:               'Learns over time. Gains accuracy & confidence.',
    hot_tilt:             'Starts hot, tilts as wanted rises.',
    comeback_grinder:     'Hunkers down when broke, pushes when healthy.',
    optimizer:            'Adapts to wanted level. Cautious at high wanted.',
    skip_burner:          'Skips 40% of picks. Burns cash on skips.',
    streaky_pro:          'Cycles between 75% and 35% accuracy.',
    conservative_climber: 'Holsters often. Bumps to conf 2 at wanted 3+.',
  };

  const defaults = {
    game: {
      startingBalance: STARTING_BALANCE,
      picksPerRound: PICKS_PER_ROUND,
      numRounds: NUM_ROUNDS,
      startingChambers: STARTING_CHAMBERS,
      anteBase: ANTE_BASE,
    },
    scoring: { dir: DIR_SCORING, hol: HOL_SCORING },
    wanted: { mult: WANTED_MULT, overflowBase: WANTED_OVERFLOW_BASE },
    notoriety: {
      weight: NOTORIETY_WEIGHT,
      upThreshold: NOTORIETY_UP_THRESHOLD,
      downThreshold: NOTORIETY_DOWN_THRESHOLD,
    },
    skip: { base: 25, exp: 2.5, div: 5000 },
    sim: { statRuns: NUM_RUNS, sampleRuns: SAMPLE_RUNS },
    profiles: profileDefaults,
  };

  const archetypeMeta = ARCHETYPES.map(type => ({
    id: type, label: ARCHETYPE_LABELS[type], color: ARCHETYPE_COLORS[type],
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <title>Bounty Hunter — Simulation Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; color: #e0e0e0; font-family: 'Courier New', monospace; }

    header { background: #111; border-bottom: 1px solid #333; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { color: #FAD009; font-size: 16px; }
    #status { font-size: 12px; color: #666; }

    .dashboard { display: grid; grid-template-columns: 300px 1fr; height: calc(100vh - 50px); }
    @media (max-width: 900px) { .dashboard { grid-template-columns: 1fr; height: auto; } }

    /* ── Config Panel ── */
    .config-panel { background: #0f0f0f; border-right: 1px solid #222; overflow-y: auto; padding: 12px; }
    .config-panel details { margin-bottom: 8px; }
    .config-panel summary {
      font-size: 12px; font-weight: bold; color: #FAD009; cursor: pointer;
      padding: 6px 0; border-bottom: 1px solid #1a1a1a; user-select: none;
    }
    .config-panel summary:hover { color: #ffe14d; }

    .field { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 11px; }
    .field label { color: #999; }
    .field input {
      width: 68px; background: #1a1a1a; color: #e0e0e0; border: 1px solid #333;
      padding: 3px 5px; font-family: inherit; font-size: 11px; text-align: right; border-radius: 3px;
    }
    .field input:focus { border-color: #FAD009; outline: none; }

    .scoring-grid { display: grid; grid-template-columns: 50px 1fr 1fr; gap: 2px 6px; align-items: center; padding: 4px 0; font-size: 11px; }
    .scoring-grid .hdr { color: #666; text-align: center; font-size: 10px; }
    .scoring-grid .lbl { color: #999; }
    .scoring-grid input {
      width: 100%; background: #1a1a1a; color: #e0e0e0; border: 1px solid #333;
      padding: 3px 4px; font-family: inherit; font-size: 11px; text-align: right; border-radius: 3px;
    }
    .scoring-grid input:focus { border-color: #FAD009; outline: none; }

    .wanted-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; padding: 4px 0; }

    /* ── Presets ── */
    .preset-bar { padding: 8px 0 12px; border-bottom: 1px solid #222; margin-bottom: 10px; }
    .preset-bar label { color: #FAD009; font-size: 11px; font-weight: bold; display: block; margin-bottom: 6px; }
    .preset-select {
      width: 100%; background: #1a1a1a; color: #e0e0e0; border: 1px solid #333;
      padding: 5px 6px; font-family: inherit; font-size: 12px; border-radius: 3px; margin-bottom: 6px;
    }
    .preset-select:focus { border-color: #FAD009; outline: none; }
    .preset-btns { display: flex; gap: 6px; }
    .preset-btns button {
      flex: 1; background: #1a1a1a; color: #999; border: 1px solid #333; padding: 5px 8px;
      font-family: inherit; font-size: 11px; cursor: pointer; border-radius: 3px;
    }
    .preset-btns button:hover { background: #222; color: #e0e0e0; }
    .preset-btns button.danger:hover { background: #3a1111; color: #F44336; border-color: #F44336; }
    .preset-btns button:disabled { opacity: 0.3; cursor: not-allowed; }

    .btn-row { padding: 12px 0; display: flex; gap: 8px; }
    #runBtn {
      flex: 1; background: #FAD009; color: #0a0a0a; border: none; padding: 10px;
      font-family: inherit; font-size: 13px; font-weight: bold; cursor: pointer; border-radius: 4px;
    }
    #runBtn:hover { background: #ffe14d; }
    #runBtn:disabled { opacity: 0.5; cursor: wait; }
    #resetBtn {
      background: #222; color: #999; border: 1px solid #333; padding: 10px 14px;
      font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 4px;
    }
    #resetBtn:hover { background: #333; color: #e0e0e0; }

    /* ── Results Panel ── */
    .results-panel { overflow-y: auto; padding: 16px; }
    .chart-container { position: relative; width: 100%; height: 50vh; min-height: 300px; margin-bottom: 16px; }

    .stats-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .stats-table th { text-align: left; color: #666; padding: 4px 6px; border-bottom: 1px solid #333; font-weight: normal; white-space: nowrap; }
    .stats-table td { padding: 3px 6px; border-bottom: 1px solid #1a1a1a; white-space: nowrap; }
    .stats-table tr:hover { background: #111; }

    .chart-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .scale-toggle { display: flex; gap: 0; }
    .scale-toggle button {
      background: #1a1a1a; color: #888; border: 1px solid #333; padding: 4px 12px;
      font-family: inherit; font-size: 11px; cursor: pointer;
    }
    .scale-toggle button:first-child { border-radius: 4px 0 0 4px; }
    .scale-toggle button:last-child { border-radius: 0 4px 4px 0; border-left: none; }
    .scale-toggle button.active { background: #FAD009; color: #0a0a0a; border-color: #FAD009; font-weight: bold; }
    .chart-hint { color: #555; font-size: 10px; }
    .range-inputs { display: none; align-items: center; gap: 6px; margin-left: 10px; }
    .range-inputs.visible { display: flex; }
    .range-inputs input {
      width: 70px; background: #1a1a1a; color: #e0e0e0; border: 1px solid #333;
      padding: 3px 5px; font-family: inherit; font-size: 11px; text-align: right; border-radius: 3px;
    }
    .range-inputs input:focus { border-color: #FAD009; outline: none; }
    .range-inputs span { color: #555; font-size: 10px; }
    .chart-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }

    .profile-input {
      width: 48px; background: #1a1a1a; color: #e0e0e0; border: 1px solid #333;
      padding: 3px 4px; font-family: inherit; font-size: 11px; text-align: right; border-radius: 3px;
    }
    .profile-input:focus { border-color: #FAD009; outline: none; }
    .profile-select {
      background: #1a1a1a; color: #e0e0e0; border: 1px solid #333;
      padding: 3px 4px; font-family: inherit; font-size: 11px; border-radius: 3px;
    }
    .profile-select:focus { border-color: #FAD009; outline: none; }

    .note { text-align: center; color: #555; font-size: 10px; margin-top: 12px; }
    .elapsed { color: #666; font-size: 11px; text-align: right; margin-bottom: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>BOUNTY HUNTER — Simulation Dashboard</h1>
    <span id="status">Ready</span>
  </header>

  <main class="dashboard">
    <!-- ── Config Panel ── -->
    <aside class="config-panel">

      <div class="preset-bar">
        <label>Presets</label>
        <select class="preset-select" id="presetSelect">
          <option value="__default">Default</option>
        </select>
        <div class="preset-btns">
          <button id="presetSave">Save As…</button>
          <button id="presetOverwrite" disabled>Overwrite</button>
          <button id="presetDelete" class="danger" disabled>Delete</button>
        </div>
      </div>

      <details open>
        <summary>Game Setup</summary>
        <div class="field"><label>Starting Balance ($)</label><input type="number" id="g-balance" value="${defaults.game.startingBalance}"></div>
        <div class="field"><label>Picks / Round</label><input type="number" id="g-picks" value="${defaults.game.picksPerRound}" min="1" max="20"></div>
        <div class="field"><label>Rounds</label><input type="number" id="g-rounds" value="${defaults.game.numRounds}" min="1" max="50"></div>
        <div class="field"><label>Ante ($)</label><input type="number" id="g-ante" value="${defaults.game.anteBase}"></div>
        <div class="field"><label>Starting Chambers</label><input type="number" id="g-chambers" value="${defaults.game.startingChambers}" min="1" max="6"></div>
      </details>

      <details open>
        <summary>Directional Scoring (Rise/Fall)</summary>
        <div class="scoring-grid">
          <span class="hdr"></span><span class="hdr">Win</span><span class="hdr">Lose</span>
          <span class="lbl">Conf 1</span><input type="number" id="d-1-w" value="${defaults.scoring.dir[1].win}"><input type="number" id="d-1-l" value="${defaults.scoring.dir[1].lose}">
          <span class="lbl">Conf 2</span><input type="number" id="d-2-w" value="${defaults.scoring.dir[2].win}"><input type="number" id="d-2-l" value="${defaults.scoring.dir[2].lose}">
          <span class="lbl">Conf 3</span><input type="number" id="d-3-w" value="${defaults.scoring.dir[3].win}"><input type="number" id="d-3-l" value="${defaults.scoring.dir[3].lose}">
        </div>
      </details>

      <details open>
        <summary>Holster Scoring</summary>
        <div class="scoring-grid">
          <span class="hdr"></span><span class="hdr">Win</span><span class="hdr">Lose</span>
          <span class="lbl">Conf 1</span><input type="number" id="h-1-w" value="${defaults.scoring.hol[1].win}"><input type="number" id="h-1-l" value="${defaults.scoring.hol[1].lose}">
          <span class="lbl">Conf 2</span><input type="number" id="h-2-w" value="${defaults.scoring.hol[2].win}"><input type="number" id="h-2-l" value="${defaults.scoring.hol[2].lose}">
          <span class="lbl">Conf 3</span><input type="number" id="h-3-w" value="${defaults.scoring.hol[3].win}"><input type="number" id="h-3-l" value="${defaults.scoring.hol[3].lose}">
        </div>
      </details>

      <details>
        <summary>Wanted Level Multipliers</summary>
        <div class="wanted-grid">
          ${Array.from({length: 10}, (_, i) => {
            const lv = i + 1;
            return `<div class="field"><label>Lv ${lv}</label><input type="number" id="w-${lv}" value="${defaults.wanted.mult[lv]}" step="any"></div>`;
          }).join('\n          ')}
        </div>
        <div class="field"><label>11+ base</label><input type="number" id="w-base" value="${defaults.wanted.overflowBase}" step="0.1"></div>
      </details>

      <details>
        <summary>Notoriety</summary>
        <div class="field"><label>Conf 1 weight</label><input type="number" id="n-w1" value="${defaults.notoriety.weight[1]}" step="0.5"></div>
        <div class="field"><label>Conf 2 weight</label><input type="number" id="n-w2" value="${defaults.notoriety.weight[2]}" step="0.5"></div>
        <div class="field"><label>Conf 3 weight</label><input type="number" id="n-w3" value="${defaults.notoriety.weight[3]}" step="0.5"></div>
        <div class="field"><label>Up threshold</label><input type="number" id="n-up" value="${defaults.notoriety.upThreshold}" step="0.5"></div>
        <div class="field"><label>Down threshold</label><input type="number" id="n-down" value="${defaults.notoriety.downThreshold}" step="0.5"></div>
      </details>

      <details>
        <summary>Skip Cost</summary>
        <div class="field"><label>Base ($)</label><input type="number" id="s-base" value="${defaults.skip.base}"></div>
        <div class="field"><label>Exponent</label><input type="number" id="s-exp" value="${defaults.skip.exp}" step="0.1"></div>
        <div class="field"><label>Balance divisor</label><input type="number" id="s-div" value="${defaults.skip.div}"></div>
        <p style="color:#555; font-size:10px; padding:4px 0;">cost = base &times; exp^(n-1) &times; max(1, bal/div)</p>
      </details>

      <details open>
        <summary>Simulation</summary>
        <div class="field"><label>Stat runs</label><input type="number" id="sim-runs" value="${defaults.sim.statRuns}" min="10" max="2000" step="10"></div>
        <div class="field"><label>Chart samples</label><input type="number" id="sim-samples" value="${defaults.sim.sampleRuns}" min="1" max="20"></div>
      </details>

      <div class="btn-row">
        <button id="runBtn">RUN SIMULATION</button>
        <button id="resetBtn">Reset</button>
      </div>
      <div style="padding:0 0 8px;">
        <button id="exportBtn" style="width:100%;background:#1a1a1a;color:#999;border:1px solid #333;padding:8px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:4px;">Export Config (.json)</button>
      </div>
    </aside>

    <!-- ── Results Panel ── -->
    <section class="results-panel">
      <div class="chart-toolbar">
        <p class="elapsed" id="elapsed"></p>
        <div class="chart-controls">
          <span class="chart-hint">Scale: </span>
          <div class="scale-toggle">
            <button id="scaleLinear" class="active">Linear</button>
            <button id="scaleLog">Log</button>
          </div>
          <span class="chart-hint">Range: </span>
          <div class="scale-toggle">
            <button id="rangeAuto" class="active">Auto</button>
            <button id="rangeManual">Manual</button>
          </div>
          <div class="range-inputs" id="rangeInputs">
            <span>$</span><input type="number" id="yMin" value="0" placeholder="Min">
            <span>to $</span><input type="number" id="yMax" value="20000" placeholder="Max">
            <button id="rangeApply" style="background:#FAD009;color:#0a0a0a;border:none;padding:3px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:3px;font-weight:bold;">Apply</button>
          </div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="simChart"></canvas>
      </div>

      <div style="overflow-x:auto;">
        <table class="stats-table" id="mainTable">
          <thead id="mainHead"></thead>
          <tbody id="statsBody"></tbody>
        </table>
      </div>

      <details open style="margin-top:16px;">
        <summary style="color:#FAD009;font-size:12px;font-weight:bold;cursor:pointer;padding:6px 0;">Player Profiles</summary>
        <table class="stats-table" style="margin-top:6px;">
          <thead>
            <tr>
              <th>Archetype</th>
              <th style="text-align:right">Accuracy</th>
              <th style="text-align:right">Confidence</th>
              <th style="text-align:right">Holster%</th>
              <th style="text-align:right">Skip%</th>
              <th>Strategy</th>
            </tr>
          </thead>
          <tbody>
            ${archetypeMeta.map(a => {
              const p = profileDefaults[a.id];
              const s = strategies[a.id];
              const confOpts = [0,1,2,3].map(c =>
                '<option value="' + c + '"' + (p.confidence === c ? ' selected' : '') + '>' + (c === 0 ? 'Rand' : c) + '</option>'
              ).join('');
              return '<tr>' +
                '<td style="color:' + a.color + '">' + a.label + '</td>' +
                '<td style="text-align:right"><input type="number" id="p-' + a.id + '-accuracy" value="' + p.accuracy + '" min="0" max="100" class="profile-input">%</td>' +
                '<td style="text-align:center"><select id="p-' + a.id + '-confidence" class="profile-select">' + confOpts + '</select></td>' +
                '<td style="text-align:right"><input type="number" id="p-' + a.id + '-holster" value="' + p.holster + '" min="0" max="100" class="profile-input">%</td>' +
                '<td style="text-align:right"><input type="number" id="p-' + a.id + '-skip" value="' + p.skip + '" min="0" max="100" class="profile-input">%</td>' +
                '<td style="color:#555;font-size:10px">' + s + '</td></tr>';
            }).join('\n            ')}
          </tbody>
        </table>
      </details>

      <p class="note">Editing profile values overrides each archetype's built-in behavior with flat rates. Confidence 0 = random 1-3.</p>
      <p class="note">Chart shows individual sample runs (can spike high) | Table shows medians across all stat runs (typical outcome)</p>
      <p class="note">Solid line = primary run | Dashed = additional samples | Flat at bottom = busted</p>
    </section>
  </main>

  <script>
    const DEFAULTS = ${JSON.stringify(defaults)};
    const ARCHETYPES = ${JSON.stringify(archetypeMeta)};
    let prevStats = null;
    let lastStats = null;
    let lastHistogram = null;

    // ── Chart setup ──
    const ctx = document.getElementById('simChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1a', titleColor: '#FAD009', bodyColor: '#e0e0e0',
            borderColor: '#333', borderWidth: 1,
            callbacks: {
              label: ctx => ctx.dataset.label ? ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString() : null,
            },
            filter: item => item.dataset.label !== '',
          }
        },
        scales: {
          x: { grid: { color: '#222' }, ticks: { color: '#888', font: { family: 'Courier New' } }, title: { display: true, text: 'Round', color: '#888' } },
          y: { grid: { color: '#222' }, ticks: { color: '#888', font: { family: 'Courier New' }, callback: v => '$' + v.toLocaleString() }, title: { display: true, text: 'Balance ($)', color: '#888' } },
        }
      }
    });

    // ── Scale + Range controls ──
    let currentScale = 'linear';
    let manualRange = false;

    document.getElementById('scaleLinear').addEventListener('click', () => setScale('linear'));
    document.getElementById('scaleLog').addEventListener('click', () => setScale('logarithmic'));
    document.getElementById('rangeAuto').addEventListener('click', () => setRange(false));
    document.getElementById('rangeManual').addEventListener('click', () => setRange(true));
    document.getElementById('rangeApply').addEventListener('click', applyRange);
    document.getElementById('yMin').addEventListener('keydown', e => { if (e.key === 'Enter') applyRange(); });
    document.getElementById('yMax').addEventListener('keydown', e => { if (e.key === 'Enter') applyRange(); });

    function setScale(type) {
      currentScale = type;
      chart.options.scales.y.type = type;
      if (type === 'logarithmic') {
        chart.options.scales.y.ticks.callback = v => {
          if ([1,10,100,1000,10000,100000,1000000].includes(v)) return '$' + v.toLocaleString();
          return '';
        };
      } else {
        chart.options.scales.y.ticks.callback = v => '$' + v.toLocaleString();
      }
      applyRange();
      document.getElementById('scaleLinear').classList.toggle('active', type === 'linear');
      document.getElementById('scaleLog').classList.toggle('active', type === 'logarithmic');
    }

    function setRange(manual) {
      manualRange = manual;
      document.getElementById('rangeAuto').classList.toggle('active', !manual);
      document.getElementById('rangeManual').classList.toggle('active', manual);
      document.getElementById('rangeInputs').classList.toggle('visible', manual);
      applyRange();
    }

    function applyRange() {
      if (manualRange) {
        const yMin = parseFloat(document.getElementById('yMin').value);
        const yMax = parseFloat(document.getElementById('yMax').value);
        chart.options.scales.y.min = isNaN(yMin) ? undefined : yMin;
        chart.options.scales.y.max = isNaN(yMax) ? undefined : yMax;
      } else {
        if (currentScale === 'logarithmic') {
          chart.options.scales.y.min = 1;
        } else {
          delete chart.options.scales.y.min;
        }
        delete chart.options.scales.y.max;
      }
      chart.update();
    }

    // ── Collect form values ──
    function collectConfig() {
      const v = id => parseFloat(document.getElementById(id).value);
      return {
        game: { startingBalance: v('g-balance'), picksPerRound: v('g-picks'), numRounds: v('g-rounds'), startingChambers: v('g-chambers'), anteBase: v('g-ante') },
        scoring: {
          dir: { 1: { win: v('d-1-w'), lose: v('d-1-l') }, 2: { win: v('d-2-w'), lose: v('d-2-l') }, 3: { win: v('d-3-w'), lose: v('d-3-l') } },
          hol: { 1: { win: v('h-1-w'), lose: v('h-1-l') }, 2: { win: v('h-2-w'), lose: v('h-2-l') }, 3: { win: v('h-3-w'), lose: v('h-3-l') } },
        },
        wanted: {
          mult: Object.fromEntries(Array.from({length:10}, (_,i) => [i+1, v('w-'+(i+1))])),
          overflowBase: v('w-base'),
        },
        notoriety: { weight: { 1: v('n-w1'), 2: v('n-w2'), 3: v('n-w3') }, upThreshold: v('n-up'), downThreshold: v('n-down') },
        skip: { base: v('s-base'), exp: v('s-exp'), div: v('s-div') },
        sim: { statRuns: v('sim-runs'), sampleRuns: v('sim-samples') },
        profiles: Object.fromEntries(ARCHETYPES.map(a => [a.id, {
          accuracy: v('p-' + a.id + '-accuracy'),
          confidence: parseInt(document.getElementById('p-' + a.id + '-confidence').value),
          holster: v('p-' + a.id + '-holster'),
          skip: v('p-' + a.id + '-skip'),
        }])),
      };
    }

    // ── Update chart with API response ──
    function updateChart(chartData) {
      const numRounds = parseInt(document.getElementById('g-rounds').value);
      const datasets = [];
      for (const arch of ARCHETYPES) {
        const runs = chartData[arch.id] || [];
        runs.forEach((run, idx) => {
          datasets.push({
            label: idx === 0 ? arch.label : '',
            data: run.balanceHistory,
            borderColor: arch.color,
            backgroundColor: 'transparent',
            borderWidth: idx === 0 ? 2.5 : 1,
            borderDash: idx === 0 ? [] : [4, 3],
            pointRadius: 0,
            tension: 0.2,
          });
        });
      }
      chart.data.labels = Array.from({length: numRounds + 1}, (_, i) => i === 0 ? 'Start' : 'R'+i);
      chart.data.datasets = datasets;
      chart.update();
    }

    // ── Update combined stats + histogram table ──
    let cachedHistogram = null;

    function updateStats(stats) {
      rebuildTable(stats, cachedHistogram);
      prevStats = stats;
    }

    function updateHistogram(histogram) {
      cachedHistogram = histogram;
      if (lastStats) rebuildTable(lastStats, histogram);
    }

    function rebuildTable(stats, histogram) {
      const thead = document.getElementById('mainHead');
      const tbody = document.getElementById('statsBody');
      const buckets = histogram ? histogram.buckets : [];

      // Header
      let hdr = '<tr><th>Archetype</th>' +
        '<th style="text-align:right">Med Final</th>' +
        '<th style="text-align:right">Min</th>' +
        '<th style="text-align:right">Max</th>' +
        '<th style="text-align:right">Med Peak</th>' +
        '<th style="text-align:right">Bust%</th>' +
        '<th style="text-align:right">Pk Lv</th>' +
        '<th style="text-align:right">Delta</th>';
      if (buckets.length > 0) {
        hdr += '<th style="border-left:2px solid #333;padding-left:8px;text-align:center;color:#FAD009;font-size:10px" colspan="' + buckets.length + '">Distribution</th>';
      }
      hdr += '</tr>';
      if (buckets.length > 0) {
        hdr += '<tr><th colspan="8"></th>';
        for (const b of buckets) {
          hdr += '<th style="text-align:center;font-size:10px;color:#888;border-left:' + (b === buckets[0] ? '2px solid #333;padding-left:8px' : 'none') + '">' + b + '</th>';
        }
        hdr += '</tr>';
      }
      thead.innerHTML = hdr;

      // Body
      tbody.innerHTML = '';
      for (const arch of ARCHETYPES) {
        const s = stats[arch.id];
        if (!s) continue;
        let delta = '';
        if (prevStats && prevStats[arch.id]) {
          const d = s.medFinal - prevStats[arch.id].medFinal;
          if (d > 0) delta = '<span style="color:#4CAF50">\\u2191 +$' + d.toLocaleString() + '</span>';
          else if (d < 0) delta = '<span style="color:#F44336">\\u2193 -$' + Math.abs(d).toLocaleString() + '</span>';
        }
        let row =
          '<td style="color:' + arch.color + ';white-space:nowrap">' + arch.label + '</td>' +
          '<td style="text-align:right">$' + s.medFinal.toLocaleString() + '</td>' +
          '<td style="text-align:right;color:#666">$' + s.minFinal.toLocaleString() + '</td>' +
          '<td style="text-align:right;color:#666">$' + s.maxFinal.toLocaleString() + '</td>' +
          '<td style="text-align:right">$' + s.medPeak.toLocaleString() + '</td>' +
          '<td style="text-align:right">' + (s.bustRate * 100).toFixed(0) + '%</td>' +
          '<td style="text-align:right">' + s.peakWanted + '</td>' +
          '<td style="text-align:right">' + delta + '</td>';
        if (histogram && histogram.data[arch.id]) {
          for (let i = 0; i < buckets.length; i++) {
            const pct = histogram.data[arch.id][i];
            const intensity = Math.min(pct / 40, 1);
            const bg = pct > 0 ? 'rgba(250,208,9,' + (0.04 + intensity * 0.28).toFixed(2) + ')' : 'transparent';
            const border = i === 0 ? 'border-left:2px solid #333;padding-left:8px;' : '';
            row += '<td style="text-align:center;font-size:11px;' + border + 'background:' + bg + '">' + (pct > 0 ? pct + '%' : '\\u2014') + '</td>';
          }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = row;
        tbody.appendChild(tr);
      }
    }

    // ── Run simulation ──
    async function runSim() {
      const btn = document.getElementById('runBtn');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.textContent = 'RUNNING…';
      status.textContent = 'Simulating…';
      status.style.color = '#FAD009';

      const t0 = performance.now();
      try {
        const cfg = collectConfig();
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        const data = await res.json();
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

        lastStats = data.stats;
        lastHistogram = data.histogram || null;
        updateChart(data.chartData);
        updateStats(data.stats);
        if (data.histogram) updateHistogram(data.histogram);
        document.getElementById('elapsed').textContent = elapsed + 's';
        status.textContent = 'Done (' + elapsed + 's)';
        status.style.color = '#4CAF50';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = '#F44336';
      } finally {
        btn.disabled = false;
        btn.textContent = 'RUN SIMULATION';
      }
    }

    // ── Load config into form ──
    function loadConfig(d) {
      document.getElementById('g-balance').value = d.game.startingBalance;
      document.getElementById('g-picks').value = d.game.picksPerRound;
      document.getElementById('g-rounds').value = d.game.numRounds;
      document.getElementById('g-ante').value = d.game.anteBase;
      document.getElementById('g-chambers').value = d.game.startingChambers;
      for (let c = 1; c <= 3; c++) {
        document.getElementById('d-'+c+'-w').value = d.scoring.dir[c].win;
        document.getElementById('d-'+c+'-l').value = d.scoring.dir[c].lose;
        document.getElementById('h-'+c+'-w').value = d.scoring.hol[c].win;
        document.getElementById('h-'+c+'-l').value = d.scoring.hol[c].lose;
      }
      for (let i = 1; i <= 10; i++) document.getElementById('w-'+i).value = d.wanted.mult[i];
      document.getElementById('w-base').value = d.wanted.overflowBase;
      document.getElementById('n-w1').value = d.notoriety.weight[1];
      document.getElementById('n-w2').value = d.notoriety.weight[2];
      document.getElementById('n-w3').value = d.notoriety.weight[3];
      document.getElementById('n-up').value = d.notoriety.upThreshold;
      document.getElementById('n-down').value = d.notoriety.downThreshold;
      document.getElementById('s-base').value = d.skip.base;
      document.getElementById('s-exp').value = d.skip.exp;
      document.getElementById('s-div').value = d.skip.div;
      document.getElementById('sim-runs').value = d.sim.statRuns;
      document.getElementById('sim-samples').value = d.sim.sampleRuns;
      if (d.profiles) {
        for (const a of ARCHETYPES) {
          const p = d.profiles[a.id];
          if (!p) continue;
          document.getElementById('p-' + a.id + '-accuracy').value = p.accuracy;
          document.getElementById('p-' + a.id + '-confidence').value = p.confidence;
          document.getElementById('p-' + a.id + '-holster').value = p.holster;
          document.getElementById('p-' + a.id + '-skip').value = p.skip;
        }
      }
    }

    // ── Preset system (localStorage) ──
    const STORAGE_KEY = 'bounty-sim-presets';

    function loadPresets() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch { return {}; }
    }

    function savePresets(presets) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    }

    function refreshPresetDropdown(selectValue) {
      const sel = document.getElementById('presetSelect');
      const presets = loadPresets();
      sel.innerHTML = '<option value="__default">Default</option>';
      for (const name of Object.keys(presets).sort()) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
      if (selectValue) sel.value = selectValue;
      updatePresetButtons();
    }

    function updatePresetButtons() {
      const sel = document.getElementById('presetSelect');
      const isDefault = sel.value === '__default';
      document.getElementById('presetOverwrite').disabled = isDefault;
      document.getElementById('presetDelete').disabled = isDefault;
    }

    // Load preset when dropdown changes
    document.getElementById('presetSelect').addEventListener('change', () => {
      const sel = document.getElementById('presetSelect');
      if (sel.value === '__default') {
        loadConfig(DEFAULTS);
      } else {
        const presets = loadPresets();
        if (presets[sel.value]) loadConfig(presets[sel.value]);
      }
      updatePresetButtons();
      runSim();
    });

    // Save As — prompt for name, save current form values
    document.getElementById('presetSave').addEventListener('click', () => {
      const name = prompt('Preset name:');
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (trimmed === '__default') { alert('Reserved name.'); return; }
      const presets = loadPresets();
      if (presets[trimmed] && !confirm('"' + trimmed + '" already exists. Overwrite?')) return;
      presets[trimmed] = collectConfig();
      savePresets(presets);
      refreshPresetDropdown(trimmed);
    });

    // Overwrite — save current values over the selected preset
    document.getElementById('presetOverwrite').addEventListener('click', () => {
      const sel = document.getElementById('presetSelect');
      if (sel.value === '__default') return;
      if (!confirm('Overwrite "' + sel.value + '" with current values?')) return;
      const presets = loadPresets();
      presets[sel.value] = collectConfig();
      savePresets(presets);
    });

    // Delete selected preset
    document.getElementById('presetDelete').addEventListener('click', () => {
      const sel = document.getElementById('presetSelect');
      if (sel.value === '__default') return;
      if (!confirm('Delete "' + sel.value + '"?')) return;
      const presets = loadPresets();
      delete presets[sel.value];
      savePresets(presets);
      refreshPresetDropdown('__default');
      loadConfig(DEFAULTS);
      runSim();
    });

    // ── Export config as JSON file ──
    document.getElementById('exportBtn').addEventListener('click', () => {
      const presetName = document.getElementById('presetSelect');
      const name = presetName.value === '__default' ? 'Default' : presetName.value;
      const outcomes = {};
      if (lastStats) {
        for (const a of ARCHETYPES) {
          const s = lastStats[a.id];
          if (!s) continue;
          outcomes[a.id] = {
            label: s.label,
            medianFinal: s.medFinal,
            minFinal: s.minFinal,
            maxFinal: s.maxFinal,
            medianPeak: s.medPeak,
            bustRate: s.bustRate,
            peakWanted: s.peakWanted,
          };
          if (lastHistogram && lastHistogram.data[a.id]) {
            outcomes[a.id].distribution = {};
            lastHistogram.buckets.forEach((b, i) => {
              outcomes[a.id].distribution[b] = lastHistogram.data[a.id][i] + '%';
            });
          }
        }
      }
      const exportData = {
        _meta: {
          exported: new Date().toISOString(),
          preset: name,
          note: 'Bounty Hunter sim config — hand this file to Claude to apply to game settings.',
        },
        ...collectConfig(),
        outcomes,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = 'bounty-config-' + dateStr + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // ── Wire up buttons ──
    document.getElementById('runBtn').addEventListener('click', runSim);
    document.getElementById('resetBtn').addEventListener('click', () => {
      document.getElementById('presetSelect').value = '__default';
      updatePresetButtons();
      loadConfig(DEFAULTS);
      runSim();
    });

    // ── Init presets + auto-run ──
    refreshPresetDropdown();
    runSim();
  <\/script>
</body>
</html>`;
}
