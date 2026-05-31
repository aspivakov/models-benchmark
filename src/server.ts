import { createServer } from "node:http";
import { SERVE_MODELS } from "./config";
import { loadSummaries } from "./eval/runReport";

const PORT = Number(process.env.PORT) || 3000;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Models Benchmark — Eval Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
  :root { --border: #e5e5e5; --muted: #666; --bg: #fafafa; --card: #fff; --accent: #2563eb; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: var(--bg); color: #222; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .subtitle { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card h2 { margin: 0 0 12px; font-size: 15px; }
  .controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin-bottom: 16px; }
  .controls .models { display: flex; flex-wrap: wrap; gap: 8px 14px; }
  .controls label { font-size: 13px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .actions { display: flex; gap: 6px; }
  button { padding: 5px 10px; font-size: 12px; border: 1px solid #d0d0d0; background: #f5f5f5; border-radius: 6px; cursor: pointer; }
  button:hover { background: #ececec; }

  table.leaderboard { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.leaderboard th, table.leaderboard td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
  table.leaderboard th { background: #f7f7f7; font-weight: 600; cursor: pointer; user-select: none; position: sticky; top: 0; }
  table.leaderboard th .arrow { color: var(--muted); margin-left: 4px; font-size: 11px; }
  table.leaderboard td.model, table.leaderboard th.model { text-align: left; }
  table.leaderboard tr.dimmed { opacity: 0.35; }
  .bar-cell { position: relative; min-width: 80px; }
  .bar-cell .bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(37, 99, 235, 0.12); border-right: 2px solid var(--accent); pointer-events: none; }
  .bar-cell .val { position: relative; }

  .tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); margin: 24px 0 16px; }
  .tab { padding: 8px 14px; font-size: 13px; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; cursor: pointer; background: transparent; color: #555; }
  .tab:hover { background: #f0f0f0; }
  .tab.active { background: var(--card); border-color: var(--border); color: #222; font-weight: 600; position: relative; top: 1px; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .charts.single { grid-template-columns: 1fr; }
  .chart-wrap { position: relative; height: 360px; }
  .chart-wrap.tall { height: 480px; }
  @media (max-width: 1100px) { .charts { grid-template-columns: 1fr; } }
  .empty { padding: 32px; color: var(--muted); text-align: center; }
  .legend-note { font-size: 12px; color: var(--muted); margin-top: 8px; }
</style>
</head>
<body>
<h1>Models Benchmark — Eval Report</h1>
<div class="subtitle">Per-model summaries from <code>runReport</code>: deterministic field accuracy, LLM-judge scores, and extraction efficiency.</div>

<div id="empty" class="card empty" style="display:none;">
  No eval results found. Run <code>npm run eval:all</code> to generate scores in <code>eval/scores/</code>.
</div>

<div id="app" style="display:none;">
  <div class="card" style="margin-bottom: 24px;">
    <div class="controls">
      <div style="font-size:13px; font-weight:600;">Models:</div>
      <div id="models" class="models"></div>
      <div class="actions">
        <button id="all">Select all</button>
        <button id="none">Clear</button>
      </div>
      <label style="margin-left:auto;"><input type="checkbox" id="pct" checked /> Show as %</label>
    </div>
    <h2>Leaderboard</h2>
    <div style="overflow:auto; max-height: 480px;">
      <table class="leaderboard" id="leaderboard"></table>
    </div>
    <div class="legend-note">Click a column header to sort. Click a model row to toggle inclusion in the charts below.</div>
  </div>

  <div class="tabs">
    <button class="tab active" data-target="tab-overall">Overall</button>
    <button class="tab" data-target="tab-det">Deterministic fields</button>
    <button class="tab" data-target="tab-judge">Judge fields</button>
    <button class="tab" data-target="tab-skills">Skills detail</button>
    <button class="tab" data-target="tab-eff">Efficiency</button>
  </div>

  <div id="tab-overall" class="tab-panel active">
    <div class="charts">
      <div class="card"><h2>Overall score</h2><div class="chart-wrap"><canvas id="c-overall"></canvas></div></div>
      <div class="card"><h2>Deterministic vs Judge mean</h2><div class="chart-wrap"><canvas id="c-det-vs-judge"></canvas></div></div>
    </div>
  </div>

  <div id="tab-det" class="tab-panel">
    <div class="charts">
      <div class="card"><h2>Deterministic mean</h2><div class="chart-wrap"><canvas id="c-det-mean"></canvas></div></div>
      <div class="card"><h2>Per-field accuracy</h2><div class="chart-wrap tall"><canvas id="c-det-fields"></canvas></div></div>
    </div>
  </div>

  <div id="tab-judge" class="tab-panel">
    <div class="charts">
      <div class="card"><h2>Judge mean</h2><div class="chart-wrap"><canvas id="c-judge-mean"></canvas></div></div>
      <div class="card"><h2>Per-field accuracy / F1</h2><div class="chart-wrap tall"><canvas id="c-judge-fields"></canvas></div></div>
    </div>
  </div>

  <div id="tab-skills" class="tab-panel">
    <div class="charts">
      <div class="card"><h2>Required skills (precision / recall / F1)</h2><div class="chart-wrap tall"><canvas id="c-req-skills"></canvas></div></div>
      <div class="card"><h2>Nice-to-have skills (precision / recall / F1)</h2><div class="chart-wrap tall"><canvas id="c-nth-skills"></canvas></div></div>
      <div class="card"><h2>Benefits (precision / recall / F1)</h2><div class="chart-wrap tall"><canvas id="c-benefits"></canvas></div></div>
    </div>
  </div>

  <div id="tab-eff" class="tab-panel">
    <div class="charts">
      <div class="card"><h2>Extraction cost total (USD)</h2><div class="chart-wrap"><canvas id="c-cost"></canvas></div></div>
      <div class="card"><h2>Extraction latency mean (ms)</h2><div class="chart-wrap"><canvas id="c-lat-mean"></canvas></div></div>
      <div class="card"><h2>Extraction latency p95 (ms)</h2><div class="chart-wrap"><canvas id="c-lat-p95"></canvas></div></div>
      <div class="card"><h2>Overall score vs cost (per file)</h2><div class="chart-wrap"><canvas id="c-cost-vs-overall"></canvas></div></div>
    </div>
  </div>
</div>

<script>
const palette = ["#2563eb","#dc2626","#16a34a","#d97706","#9333ea","#0891b2","#db2777","#65a30d","#7c3aed","#0d9488"];
const naturalCompare = (a,b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

let summaries = [];
let selected = new Set();
let charts = {};
let sortKey = "overall";
let sortDir = "desc"; // 'asc' | 'desc'
let showPct = true;

const DET_FIELDS = ["seniority","remote_policy","years_experience","company","title"];
const JUDGE_SCALAR = ["location","salary_range"];
const JUDGE_LIST_F1 = [
  { key: "benefits_f1", label: "benefits F1" },
  { key: "required_skills_f1", label: "required_skills F1" },
  { key: "nice_to_have_skills_f1", label: "nice_to_have_skills F1" },
];

const TABLE_COLUMNS = [
  { key: "slug", label: "Model", kind: "string", className: "model" },
  { key: "filesScored", label: "Files", kind: "int" },
  { key: "overall", label: "Overall", kind: "frac" },
  { key: "det_mean", label: "Det mean", kind: "frac" },
  { key: "judge_mean", label: "Judge mean", kind: "frac" },
  { key: "benefits_f1", label: "Benefits F1", kind: "frac" },
  { key: "required_skills_f1", label: "Req skills F1", kind: "frac" },
  { key: "nice_to_have_skills_f1", label: "NTH skills F1", kind: "frac" },
  { key: "cost_total", label: "Cost (USD)", kind: "money" },
  { key: "lat_mean", label: "Lat mean (ms)", kind: "ms" },
  { key: "lat_p95", label: "Lat p95 (ms)", kind: "ms" },
];

function rowFor(s) {
  return {
    slug: s.slug,
    filesScored: s.filesScored,
    overall: s.overall,
    det_mean: s.deterministic.mean,
    judge_mean: s.judge.mean,
    benefits_f1: s.judge.benefits_f1,
    required_skills_f1: s.judge.required_skills_f1,
    nice_to_have_skills_f1: s.judge.nice_to_have_skills_f1,
    cost_total: s.extractionCostUsdTotal,
    lat_mean: s.extractionLatencyMsMean,
    lat_p95: s.extractionLatencyMsP95,
    _raw: s,
  };
}

function formatCell(kind, v) {
  if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
  if (kind === 'frac') return showPct ? (v * 100).toFixed(1) + '%' : v.toFixed(3);
  if (kind === 'money') return '$' + v.toFixed(4);
  if (kind === 'ms') return Math.round(v).toLocaleString();
  if (kind === 'int') return String(v);
  return String(v);
}

function paletteFor(slug) {
  const all = summaries.map(s => s.slug).sort(naturalCompare);
  const i = all.indexOf(slug);
  return palette[(i < 0 ? 0 : i) % palette.length];
}

function selectedRowsSorted() {
  // Always sort table by current sortKey/sortDir; chart input is whichever models are selected.
  const rows = summaries.map(rowFor);
  rows.sort((a, b) => {
    const A = a[sortKey], B = b[sortKey];
    if (typeof A === 'string' && typeof B === 'string') {
      return sortDir === 'asc' ? naturalCompare(A, B) : naturalCompare(B, A);
    }
    return sortDir === 'asc' ? (A - B) : (B - A);
  });
  return rows;
}

function renderTable() {
  const tbl = document.getElementById('leaderboard');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of TABLE_COLUMNS) {
    const th = document.createElement('th');
    th.className = col.className || '';
    th.textContent = col.label;
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '';
    th.appendChild(arrow);
    th.addEventListener('click', () => {
      if (sortKey === col.key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = col.key; sortDir = col.kind === 'string' ? 'asc' : 'desc'; }
      renderTable();
    });
    headRow.appendChild(th);
  }
  head.appendChild(headRow);

  const body = document.createElement('tbody');
  const rows = selectedRowsSorted();

  // For bar visualization, normalize per-column on the full set
  const colMax = {};
  for (const col of TABLE_COLUMNS) {
    if (col.kind === 'string' || col.kind === 'int') continue;
    colMax[col.key] = Math.max(0, ...rows.map(r => Number(r[col.key]) || 0));
  }

  for (const r of rows) {
    const tr = document.createElement('tr');
    if (!selected.has(r.slug)) tr.classList.add('dimmed');
    tr.addEventListener('click', () => {
      if (selected.has(r.slug)) selected.delete(r.slug); else selected.add(r.slug);
      renderTable();
      renderCharts();
      syncCheckboxes();
    });
    for (const col of TABLE_COLUMNS) {
      const td = document.createElement('td');
      td.className = col.className || '';
      if (col.kind !== 'string' && col.kind !== 'int') {
        td.classList.add('bar-cell');
        const max = colMax[col.key] || 1;
        const v = Number(r[col.key]) || 0;
        const ratio = max ? Math.min(1, v / max) : 0;
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.width = (ratio * 100).toFixed(1) + '%';
        bar.style.background = paletteFor(r.slug) + '22';
        bar.style.borderRightColor = paletteFor(r.slug);
        td.appendChild(bar);
        const val = document.createElement('span');
        val.className = 'val';
        val.textContent = formatCell(col.kind, r[col.key]);
        td.appendChild(val);
      } else {
        td.textContent = formatCell(col.kind, r[col.key]);
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  tbl.replaceChildren(head, body);
}

function syncCheckboxes() {
  document.querySelectorAll('#models input').forEach(i => {
    i.checked = selected.has(i.value);
  });
}

function selectedSummaries() {
  return summaries.filter(s => selected.has(s.slug));
}

function sortedByMetric(values) {
  // values: [{ slug, v }]
  return [...values].sort((a, b) => a.v - b.v);
}

function makeBarChart(canvasId, opts) {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: Object.assign({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    }, opts || {}),
  });
}

function makeGroupedBar(canvasId) {
  return new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { beginAtZero: true, max: 1, ticks: { callback: v => fmtFraction(v) } } },
    },
  });
}

function fmtFraction(v) { return showPct ? (v * 100).toFixed(0) + '%' : Number(v).toFixed(2); }

function setSingleBar(chart, rows, opts) {
  rows = sortedByMetric(rows);
  chart.data.labels = rows.map(r => r.slug);
  chart.data.datasets = [{
    label: opts.label,
    data: rows.map(r => r.v),
    backgroundColor: rows.map(r => paletteFor(r.slug)),
    borderColor: rows.map(r => paletteFor(r.slug)),
    borderWidth: 1,
  }];
  const max = opts.max;
  const isFrac = !!opts.frac;
  chart.options.scales.x.max = max;
  chart.options.scales.x.ticks = { callback: v => isFrac ? fmtFraction(v) : opts.tickFmt ? opts.tickFmt(v) : v };
  chart.options.plugins.tooltip = {
    callbacks: { label: c => opts.tooltipFmt ? opts.tooltipFmt(c.parsed.x) : (isFrac ? fmtFraction(c.parsed.x) : String(c.parsed.x)) },
  };
  chart.update();
}

function setGroupedBar(chart, sums, fields, fieldLabel, valueAt) {
  // datasets = one per field; labels = model slugs (sorted by mean across fields desc)
  const slugs = sums.map(s => s.slug);
  // Sort slugs by mean across the displayed fields (descending) so leaders are on top.
  slugs.sort((a, b) => {
    const sa = sums.find(s => s.slug === a), sb = sums.find(s => s.slug === b);
    const ma = fields.reduce((acc, f) => acc + valueAt(sa, f.key), 0) / (fields.length || 1);
    const mb = fields.reduce((acc, f) => acc + valueAt(sb, f.key), 0) / (fields.length || 1);
    return ma - mb;
  });
  const slugColor = (slug) => paletteFor(slug);
  chart.data.labels = slugs;
  chart.data.datasets = fields.map((f, i) => ({
    label: f.label || f.key,
    data: slugs.map(slug => valueAt(sums.find(s => s.slug === slug), f.key)),
    backgroundColor: slugs.map(slug => withAlpha(slugColor(slug), 0.5 + 0.5 * (i / Math.max(1, fields.length - 1)))),
    borderColor: slugs.map(slug => slugColor(slug)),
    borderWidth: 1,
  }));
  chart.options.plugins.tooltip = {
    callbacks: { label: c => c.dataset.label + ': ' + fmtFraction(c.parsed.x) },
  };
  chart.update();
}

function withAlpha(hex, a) {
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(2) + ')';
}

function renderCharts() {
  const sums = selectedSummaries();
  if (sums.length === 0) {
    Object.values(charts).forEach(c => { c.data.labels = []; c.data.datasets = []; c.update(); });
    return;
  }

  setSingleBar(charts['c-overall'], sums.map(s => ({ slug: s.slug, v: s.overall })),
    { label: 'overall', max: 1, frac: true });

  // Det vs Judge mean as grouped bars
  setGroupedBar(charts['c-det-vs-judge'], sums,
    [{ key: 'det_mean', label: 'deterministic mean' }, { key: 'judge_mean', label: 'judge mean' }],
    null,
    (s, k) => k === 'det_mean' ? s.deterministic.mean : s.judge.mean);

  setSingleBar(charts['c-det-mean'], sums.map(s => ({ slug: s.slug, v: s.deterministic.mean })),
    { label: 'det mean', max: 1, frac: true });

  setGroupedBar(charts['c-det-fields'], sums,
    DET_FIELDS.map(f => ({ key: f, label: f })),
    null,
    (s, k) => s.deterministic[k]);

  setSingleBar(charts['c-judge-mean'], sums.map(s => ({ slug: s.slug, v: s.judge.mean })),
    { label: 'judge mean', max: 1, frac: true });

  const judgeFields = [
    ...JUDGE_SCALAR.map(k => ({ key: k, label: k })),
    ...JUDGE_LIST_F1,
  ];
  setGroupedBar(charts['c-judge-fields'], sums, judgeFields, null,
    (s, k) => s.judge[k]);

  setGroupedBar(charts['c-req-skills'], sums,
    [
      { key: 'required_skills_precision', label: 'precision' },
      { key: 'required_skills_recall', label: 'recall' },
      { key: 'required_skills_f1', label: 'F1' },
    ], null, (s, k) => s.judge[k]);

  setGroupedBar(charts['c-nth-skills'], sums,
    [
      { key: 'nice_to_have_skills_precision', label: 'precision' },
      { key: 'nice_to_have_skills_recall', label: 'recall' },
      { key: 'nice_to_have_skills_f1', label: 'F1' },
    ], null, (s, k) => s.judge[k]);

  setGroupedBar(charts['c-benefits'], sums,
    [
      { key: 'benefits_precision', label: 'precision' },
      { key: 'benefits_recall', label: 'recall' },
      { key: 'benefits_f1', label: 'F1' },
    ], null, (s, k) => s.judge[k]);

  setSingleBar(charts['c-cost'], sums.map(s => ({ slug: s.slug, v: s.extractionCostUsdTotal })),
    { label: 'cost', tickFmt: v => '$' + Number(v).toFixed(3), tooltipFmt: v => '$' + Number(v).toFixed(4) });

  setSingleBar(charts['c-lat-mean'], sums.map(s => ({ slug: s.slug, v: s.extractionLatencyMsMean })),
    { label: 'latency mean (ms)', tickFmt: v => Math.round(v).toLocaleString(), tooltipFmt: v => Math.round(v).toLocaleString() + ' ms' });

  setSingleBar(charts['c-lat-p95'], sums.map(s => ({ slug: s.slug, v: s.extractionLatencyMsP95 })),
    { label: 'latency p95 (ms)', tickFmt: v => Math.round(v).toLocaleString(), tooltipFmt: v => Math.round(v).toLocaleString() + ' ms' });

  // Cost-vs-Overall scatter (one point per model)
  const scatter = charts['c-cost-vs-overall'];
  scatter.data.datasets = [{
    label: 'models',
    data: sums.map(s => ({ x: s.extractionCostUsdTotal, y: s.overall, slug: s.slug })),
    backgroundColor: sums.map(s => paletteFor(s.slug)),
    borderColor: sums.map(s => paletteFor(s.slug)),
    pointRadius: 6,
    pointHoverRadius: 8,
  }];
  scatter.update();
}

function activateTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.target === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
}

function init(payload) {
  summaries = payload || [];
  if (summaries.length === 0) {
    document.getElementById('empty').style.display = 'block';
    return;
  }
  document.getElementById('app').style.display = 'block';
  selected = new Set(summaries.map(s => s.slug));

  // Build model checkbox row.
  const all = summaries.map(s => s.slug).sort(naturalCompare);
  const container = document.getElementById('models');
  container.innerHTML = all.map(m =>
    '<label><input type="checkbox" value="' + m + '" checked /> ' + m + '</label>'
  ).join('');
  container.addEventListener('change', () => {
    selected = new Set([...container.querySelectorAll('input:checked')].map(i => i.value));
    renderTable();
    renderCharts();
  });
  document.getElementById('all').addEventListener('click', () => {
    selected = new Set(all); syncCheckboxes(); renderTable(); renderCharts();
  });
  document.getElementById('none').addEventListener('click', () => {
    selected = new Set(); syncCheckboxes(); renderTable(); renderCharts();
  });
  document.getElementById('pct').addEventListener('change', (e) => {
    showPct = e.target.checked;
    renderTable();
    renderCharts();
  });

  // Charts.
  ['c-overall','c-det-mean','c-judge-mean','c-cost','c-lat-mean','c-lat-p95']
    .forEach(id => charts[id] = makeBarChart(id));
  ['c-det-vs-judge','c-det-fields','c-judge-fields','c-req-skills','c-nth-skills','c-benefits']
    .forEach(id => charts[id] = makeGroupedBar(id));
  charts['c-cost-vs-overall'] = new Chart(document.getElementById('c-cost-vs-overall'), {
    type: 'scatter',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.raw.slug + ' — overall ' + fmtFraction(c.raw.y) + ', cost $' + Number(c.raw.x).toFixed(4) } },
      },
      scales: {
        x: { title: { display: true, text: 'extraction cost total (USD)' }, beginAtZero: true, ticks: { callback: v => '$' + Number(v).toFixed(3) } },
        y: { title: { display: true, text: 'overall score' }, beginAtZero: true, max: 1, ticks: { callback: v => fmtFraction(v) } },
      },
    },
  });

  document.querySelectorAll('.tabs').forEach(tabsEl => {
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (btn) activateTab(btn.dataset.target);
    });
  });

  renderTable();
  renderCharts();
}

fetch('/api/summaries').then(r => r.json()).then(init).catch(err => {
  document.getElementById('empty').style.display = 'block';
  document.getElementById('empty').textContent = 'Failed to load report: ' + err;
});
</script>
</body>
</html>
`;

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400).end();
      return;
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }
    if (req.url === "/api/summaries") {
      const summaries = await loadSummaries(SERVE_MODELS);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(summaries));
      return;
    }
    res.writeHead(404).end("Not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(err));
  }
});

server.listen(PORT, () => {
  console.log(`Models benchmark UI running at http://localhost:${PORT}`);
});
