import 'dotenv/config';
import { existsSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RunResult } from '../types';
import type { ModelSummary, PairScore } from './types';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'output');
const SCORES_DIR = path.join(ROOT, 'eval', 'scores');
const SUMMARY_PATH = path.join(ROOT, 'eval', 'summary.json');

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function readScoreFiles(slug: string): Promise<PairScore[]> {
  const dir = path.join(SCORES_DIR, slug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: PairScore[] = [];
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    const text = await readFile(path.join(dir, f), 'utf8');
    out.push(JSON.parse(text) as PairScore);
  }
  return out;
}

async function readExtractionStats(
  slug: string
): Promise<{ costTotal: number; latencyMean: number; latencyP95: number }> {
  const dir = path.join(OUTPUT_DIR, slug);
  if (!existsSync(dir)) return { costTotal: 0, latencyMean: 0, latencyP95: 0 };
  const entries = await readdir(dir);
  const results: RunResult[] = [];
  for (const f of entries) {
    if (!f.endsWith('.json') || f.endsWith('.raw.json')) continue;
    const text = await readFile(path.join(dir, f), 'utf8');
    results.push(JSON.parse(text) as RunResult);
  }
  const costTotal = results.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  const latencies = results.map((r) => r.latencyMs ?? 0);
  return {
    costTotal,
    latencyMean: mean(latencies),
    latencyP95: percentile(latencies, 95),
  };
}

function summarize(slug: string, scores: PairScore[], extraction: { costTotal: number; latencyMean: number; latencyP95: number }): ModelSummary {
  const first = scores[0];
  const det = {
    seniority: mean(scores.map((s) => (s.deterministic.seniority.match ? 1 : 0))),
    remote_policy: mean(scores.map((s) => (s.deterministic.remote_policy.match ? 1 : 0))),
    years_experience: mean(scores.map((s) => (s.deterministic.years_experience.match ? 1 : 0))),
    company: mean(scores.map((s) => (s.deterministic.company.match ? 1 : 0))),
    title: mean(scores.map((s) => (s.deterministic.title.match ? 1 : 0))),
    mean: 0,
  };
  det.mean = mean([det.seniority, det.remote_policy, det.years_experience, det.company, det.title]);

  const judge = {
    location: mean(scores.map((s) => (s.judge.location.match ? 1 : 0))),
    salary_range: mean(scores.map((s) => (s.judge.salary_range.match ? 1 : 0))),
    benefits_f1: mean(scores.map((s) => s.judge.benefits.f1)),
    benefits_precision: mean(scores.map((s) => s.judge.benefits.precision)),
    benefits_recall: mean(scores.map((s) => s.judge.benefits.recall)),
    required_skills_f1: mean(scores.map((s) => s.judge.required_skills.f1)),
    required_skills_precision: mean(scores.map((s) => s.judge.required_skills.precision)),
    required_skills_recall: mean(scores.map((s) => s.judge.required_skills.recall)),
    nice_to_have_skills_f1: mean(scores.map((s) => s.judge.nice_to_have_skills.f1)),
    nice_to_have_skills_precision: mean(scores.map((s) => s.judge.nice_to_have_skills.precision)),
    nice_to_have_skills_recall: mean(scores.map((s) => s.judge.nice_to_have_skills.recall)),
    mean: 0,
  };
  judge.mean = mean([
    judge.location,
    judge.salary_range,
    judge.benefits_f1,
    judge.required_skills_f1,
    judge.nice_to_have_skills_f1,
  ]);

  const overall = mean(scores.map((s) => s.overall.score));

  return {
    slug,
    model: first.model,
    provider: first.provider,
    filesScored: scores.length,
    deterministic: det,
    judge,
    overall,
    extractionCostUsdTotal: extraction.costTotal,
    extractionLatencyMsMean: extraction.latencyMean,
    extractionLatencyMsP95: extraction.latencyP95,
  };
}

export async function loadSummaries(): Promise<ModelSummary[]> {
  if (!existsSync(SCORES_DIR)) return [];
  const slugEntries = await readdir(SCORES_DIR, { withFileTypes: true });
  const slugs = slugEntries.filter((e) => e.isDirectory()).map((e) => e.name);

  const summaries: ModelSummary[] = [];
  for (const slug of slugs) {
    const scores = await readScoreFiles(slug);
    if (scores.length === 0) continue;
    const extraction = await readExtractionStats(slug);
    summaries.push(summarize(slug, scores, extraction));
  }
  summaries.sort((a, b) => b.overall - a.overall);
  return summaries;
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

async function main(): Promise<void> {
  if (!existsSync(SCORES_DIR)) {
    console.error(`No scores directory at ${SCORES_DIR}. Run 'npm run eval:judge' first.`);
    process.exit(1);
  }

  const summaries = await loadSummaries();

  await writeFile(SUMMARY_PATH, JSON.stringify(summaries, null, 2));

  const table = summaries.map((s) => ({
    slug: s.slug,
    files: s.filesScored,
    overall: fmt(s.overall),
    det_mean: fmt(s.deterministic.mean),
    judge_mean: fmt(s.judge.mean),
    benefits_f1: fmt(s.judge.benefits_f1),
    req_skills_f1: fmt(s.judge.required_skills_f1),
    extract_cost: `$${s.extractionCostUsdTotal.toFixed(4)}`,
    extract_p95_ms: Math.round(s.extractionLatencyMsP95),
  }));

  console.table(table);
  console.log(`\nWrote ${summaries.length} model summaries to ${SUMMARY_PATH}`);
}

const isCli = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
