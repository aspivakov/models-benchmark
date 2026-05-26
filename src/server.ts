import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "..", "output");
const GROUND_TRUTH_DIR = resolve(__dirname, "..", "ground_truth");
const PORT = Number(process.env.PORT) || 3000;

type Stat = {
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  accuracy: number | null;
  accuracyExclSkills: number | null;
};

const SKILL_KEYS = new Set(["required_skills", "nice_to_have_skills", "benefits"]);

type Dataset = Record<string, Record<string, Stat>>;

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual((a as any)[k], (b as any)[k]));
  }
  return false;
}

function score(truth: unknown, candidate: unknown, excludeKeys?: Set<string>): { total: number; matches: number } {
  if (Array.isArray(truth)) {
    if (truth.length === 0) {
      const ok = Array.isArray(candidate) && candidate.length === 0;
      return { total: 1, matches: ok ? 1 : 0 };
    }
    let matches = 0;
    if (Array.isArray(candidate)) {
      const used = new Set<number>();
      for (const t of truth) {
        for (let i = 0; i < candidate.length; i++) {
          if (used.has(i)) continue;
          if (deepEqual(t, candidate[i])) {
            used.add(i);
            matches++;
            break;
          }
        }
      }
    }
    return { total: truth.length, matches };
  }
  if (truth && typeof truth === "object") {
    let total = 0;
    let matches = 0;
    const obj = truth as Record<string, unknown>;
    const cand = (candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {});
    for (const k of Object.keys(obj)) {
      if (excludeKeys?.has(k)) continue;
      const s = score(obj[k], cand[k], excludeKeys);
      total += s.total;
      matches += s.matches;
    }
    return { total, matches };
  }
  return { total: 1, matches: deepEqual(truth, candidate) ? 1 : 0 };
}

async function loadGroundTruth(): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  try {
    const files = (await readdir(GROUND_TRUTH_DIR)).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const raw = await readFile(join(GROUND_TRUTH_DIR, f), "utf8");
        out.set(f.replace(/\.json$/, ""), JSON.parse(raw));
      } catch {
        // skip
      }
    }
  } catch {
    // ground_truth dir may not exist
  }
  return out;
}

async function loadData(): Promise<Dataset> {
  const truth = await loadGroundTruth();
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const models = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const data: Dataset = {};
  for (const model of models) {
    const modelDir = join(OUTPUT_DIR, model);
    const files = (await readdir(modelDir)).filter((f) => f.endsWith(".json"));
    const stats: Record<string, Stat> = {};
    for (const file of files) {
      try {
        const raw = await readFile(join(modelDir, file), "utf8");
        const json = JSON.parse(raw);
        const key = file.replace(/\.json$/, "");
        let accuracy: number | null = null;
        let accuracyExclSkills: number | null = null;
        if (truth.has(key)) {
          const full = score(truth.get(key), json.output);
          accuracy = full.total === 0 ? 0 : (full.matches / full.total) * 100;
          const noSkills = score(truth.get(key), json.output, SKILL_KEYS);
          accuracyExclSkills = noSkills.total === 0 ? 0 : (noSkills.matches / noSkills.total) * 100;
        }
        stats[key] = {
          latencyMs: Number(json.latencyMs ?? 0),
          costUsd: Number(json.costUsd ?? 0),
          inputTokens: Number(json.inputTokens ?? 0),
          outputTokens: Number(json.outputTokens ?? 0),
          accuracy,
          accuracyExclSkills,
        };
      } catch {
        // skip malformed files
      }
    }
    data[model] = stats;
  }
  return data;
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Models Benchmark</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #fafafa; color: #222; }
  h1 { margin: 0 0 16px; font-size: 22px; }
  .controls { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  .controls .group { display: flex; flex-direction: column; gap: 8px; }
  .controls label { font-size: 13px; }
  .models { display: flex; flex-wrap: wrap; gap: 8px 16px; }
  .models label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .actions { display: flex; gap: 8px; }
  button { padding: 6px 12px; font-size: 13px; border: 1px solid #d0d0d0; background: #f5f5f5; border-radius: 6px; cursor: pointer; }
  button:hover { background: #ececec; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; }
  .card h2 { margin: 0 0 12px; font-size: 16px; }
  .chart-wrap { position: relative; height: 320px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #e5e5e5; margin-bottom: 20px; }
  .tab { padding: 8px 14px; font-size: 13px; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; cursor: pointer; background: transparent; color: #555; }
  .tab:hover { background: #f0f0f0; }
  .tab.active { background: #fff; border-color: #e5e5e5; color: #222; font-weight: 600; position: relative; top: 1px; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .section-title { margin: 32px 0 16px; font-size: 18px; }
  .section-title:first-child { margin-top: 0; }
  @media (max-width: 1100px) { .charts { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Models Benchmark</h1>
<div class="controls">
  <div class="group">
    <strong style="font-size:13px;">Models</strong>
    <div id="models" class="models"></div>
    <div class="actions">
      <button id="all">Select all</button>
      <button id="none">Clear</button>
    </div>
  </div>
  <div class="group">
    <strong style="font-size:13px;">Display</strong>
    <label><input type="checkbox" id="avg" /> Show average per model</label>
    <label><input type="checkbox" id="excl-skills" /> Accuracy: exclude required_skills, nice_to_have_skills &amp; benefits</label>
  </div>
</div>
<div class="tabs">
  <button class="tab active" data-target="tab-latency">Latency</button>
  <button class="tab" data-target="tab-costs">Costs</button>
  <button class="tab" data-target="tab-tokens">Tokens</button>
  <button class="tab" data-target="tab-accuracy">Accuracy</button>
</div>
<div id="tab-latency" class="tab-panel active">
  <div class="charts">
    <div class="card"><h2>Latency per file (ms)</h2><div class="chart-wrap"><canvas id="latency"></canvas></div></div>
    <div class="card"><h2>Average latency (ms)</h2><div class="chart-wrap"><canvas id="bar-avg-latency"></canvas></div></div>
    <div class="card"><h2>Min latency (ms)</h2><div class="chart-wrap"><canvas id="bar-min-latency"></canvas></div></div>
    <div class="card"><h2>Max latency (ms)</h2><div class="chart-wrap"><canvas id="bar-max-latency"></canvas></div></div>
  </div>
</div>
<div id="tab-costs" class="tab-panel">
  <div class="charts">
    <div class="card"><h2>Cost per file (USD)</h2><div class="chart-wrap"><canvas id="cost"></canvas></div></div>
    <div class="card"><h2>Total cost (USD)</h2><div class="chart-wrap"><canvas id="bar-total-cost"></canvas></div></div>
    <div class="card"><h2>Min cost (USD)</h2><div class="chart-wrap"><canvas id="bar-min-cost"></canvas></div></div>
    <div class="card"><h2>Max cost (USD)</h2><div class="chart-wrap"><canvas id="bar-max-cost"></canvas></div></div>
  </div>
</div>
<div id="tab-tokens" class="tab-panel">
  <div class="charts">
    <div class="card"><h2>Input tokens per file</h2><div class="chart-wrap"><canvas id="input"></canvas></div></div>
    <div class="card"><h2>Output tokens per file</h2><div class="chart-wrap"><canvas id="output"></canvas></div></div>
    <div class="card"><h2>Total tokens (input + output)</h2><div class="chart-wrap"><canvas id="bar-total-tokens"></canvas></div></div>
  </div>
</div>
<div id="tab-accuracy" class="tab-panel">
  <div class="charts">
    <div class="card"><h2>Average accuracy</h2><div class="chart-wrap"><canvas id="acc-__avg__"></canvas></div></div>
  </div>
  <div id="accuracy-per-file" class="charts" style="margin-top:24px;"></div>
</div>
<script>
const palette = ["#2563eb","#dc2626","#16a34a","#d97706","#9333ea","#0891b2","#db2777","#65a30d","#7c3aed","#0d9488"];
const naturalCompare = (a,b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

let data = {};
let charts = {};
const metrics = [
  { key: "latencyMs", canvas: "latency" },
  { key: "costUsd", canvas: "cost" },
  { key: "inputTokens", canvas: "input" },
  { key: "outputTokens", canvas: "output" },
];
const barCharts = [
  { canvas: "bar-min-latency",   field: "latencyMs", agg: "min" },
  { canvas: "bar-max-latency",   field: "latencyMs", agg: "max" },
  { canvas: "bar-avg-latency",   field: "latencyMs", agg: "avg" },
  { canvas: "bar-min-cost",      field: "costUsd",   agg: "min" },
  { canvas: "bar-max-cost",      field: "costUsd",   agg: "max" },
  { canvas: "bar-total-cost",    field: "costUsd",   agg: "sum" },
  { canvas: "bar-total-tokens",  field: "totalTokens", agg: "sum" },
];

let accuracyCharts = {};
let accuracyFiles = [];

function aggregate(values, agg) {
  if (!values.length) return 0;
  if (agg === "min") return Math.min(...values);
  if (agg === "max") return Math.max(...values);
  if (agg === "sum") return values.reduce((a,b)=>a+b,0);
  if (agg === "avg") return values.reduce((a,b)=>a+b,0) / values.length;
  return 0;
}

function modelValues(model, field) {
  const stats = data[model] || {};
  return Object.values(stats).map(s => {
    if (field === "totalTokens") return Number(s.inputTokens || 0) + Number(s.outputTokens || 0);
    return Number(s[field] || 0);
  });
}

function selectedModels() {
  return [...document.querySelectorAll('#models input:checked')].map(i => i.value);
}

function buildDatasets(metric, models, showAvg) {
  const fileSet = new Set();
  models.forEach(m => Object.keys(data[m] || {}).forEach(f => fileSet.add(f)));
  const labels = [...fileSet].sort(naturalCompare);
  const datasets = models.map((m, idx) => {
    const color = palette[idx % palette.length];
    const points = labels.map(l => {
      const v = data[m]?.[l]?.[metric];
      return v === undefined ? null : v;
    });
    const ds = [{
      label: m,
      data: points,
      borderColor: color,
      backgroundColor: color,
      spanGaps: true,
      tension: 0.2,
      pointRadius: 2,
    }];
    if (showAvg) {
      const nums = points.filter(p => typeof p === "number");
      const avg = nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
      ds.push({
        label: m + " (avg)",
        data: labels.map(() => avg),
        borderColor: color,
        backgroundColor: color,
        borderDash: [6, 4],
        pointRadius: 0,
        borderWidth: 1.5,
      });
    }
    return ds;
  }).flat();
  return { labels, datasets };
}

function render() {
  const models = selectedModels();
  const showAvg = document.getElementById('avg').checked;
  metrics.forEach(({ key, canvas }) => {
    const { labels, datasets } = buildDatasets(key, models, showAvg);
    const chart = charts[canvas];
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
  });
  barCharts.forEach(({ canvas, field, agg }) => {
    const chart = charts[canvas];
    const rows = models
      .map((m, i) => ({ m, v: aggregate(modelValues(m, field), agg), color: palette[i % palette.length] }))
      .sort((a, b) => a.v - b.v);
    chart.data.labels = rows.map(r => r.m);
    chart.data.datasets = [{
      label: agg + " " + field,
      data: rows.map(r => r.v),
      backgroundColor: rows.map(r => r.color),
      borderColor: rows.map(r => r.color),
      borderWidth: 1,
    }];
    chart.update();
  });
  renderAccuracy(models);
}

function renderAccuracy(models) {
  const allModelsAlpha = Object.keys(data).sort(naturalCompare);
  const field = document.getElementById('excl-skills').checked ? 'accuracyExclSkills' : 'accuracy';
  accuracyFiles.forEach(file => {
    const chart = accuracyCharts[file];
    if (!chart) return;
    const rows = models.map(m => {
      const idx = allModelsAlpha.indexOf(m);
      let v;
      if (file === "__avg__") {
        const stats = data[m] || {};
        const acc = Object.values(stats).map(s => s[field]).filter(x => typeof x === "number");
        v = acc.length ? acc.reduce((a,b)=>a+b,0) / acc.length : 0;
      } else {
        v = data[m]?.[file]?.[field] ?? 0;
      }
      return { m, v, color: palette[idx % palette.length] };
    }).sort((a, b) => a.v - b.v);
    chart.data.labels = rows.map(r => r.m);
    chart.data.datasets = [{
      label: "accuracy %",
      data: rows.map(r => r.v),
      backgroundColor: rows.map(r => r.color),
      borderColor: rows.map(r => r.color),
      borderWidth: 1,
    }];
    chart.update();
  });
}

function activateTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.target === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
}

function init(initial) {
  data = initial;
  const allModels = Object.keys(data).sort(naturalCompare);
  const container = document.getElementById('models');
  container.innerHTML = allModels.map(m =>
    '<label><input type="checkbox" value="' + m + '" checked /> ' + m + '</label>'
  ).join('');
  container.addEventListener('change', render);
  document.getElementById('avg').addEventListener('change', render);
  document.getElementById('excl-skills').addEventListener('change', render);
  document.getElementById('all').addEventListener('click', () => {
    document.querySelectorAll('#models input').forEach(i => i.checked = true); render();
  });
  document.getElementById('none').addEventListener('click', () => {
    document.querySelectorAll('#models input').forEach(i => i.checked = false); render();
  });
  metrics.forEach(({ canvas }) => {
    charts[canvas] = new Chart(document.getElementById(canvas), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: { y: { beginAtZero: true } },
      },
    });
  });
  barCharts.forEach(({ canvas }) => {
    charts[canvas] = new Chart(document.getElementById(canvas), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  });
  document.querySelectorAll('.tabs').forEach(tabsEl => {
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (btn) activateTab(btn.dataset.target);
    });
  });

  const fileSet = new Set();
  allModels.forEach(m => Object.entries(data[m] || {}).forEach(([f, s]) => {
    if (typeof s.accuracy === "number") fileSet.add(f);
  }));
  const perFileAccuracy = [...fileSet].sort(naturalCompare);
  accuracyFiles = ["__avg__", ...perFileAccuracy];
  const accPerFileEl = document.getElementById('accuracy-per-file');
  accPerFileEl.innerHTML = perFileAccuracy.map(f =>
    '<div class="card"><h2>' + f + ' accuracy</h2><div class="chart-wrap"><canvas id="acc-' + f + '"></canvas></div></div>'
  ).join('');
  accuracyFiles.forEach(f => {
    accuracyCharts[f] = new Chart(document.getElementById('acc-' + f), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x.toFixed(1) + '%' } } },
        scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
      },
    });
  });
  render();
}

fetch('/api/data').then(r => r.json()).then(init);
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
    if (req.url === "/api/data") {
      const data = await loadData();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
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
