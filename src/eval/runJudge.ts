import 'dotenv/config';
import { existsSync } from 'fs';
import { mkdir, readdir, writeFile } from 'fs/promises';
import path from 'path';
import { scoreOnePair } from './scoreOne';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'output');
const INPUT_DIR = path.join(ROOT, 'input');
const GROUND_TRUTH_DIR = path.join(ROOT, 'ground_truth');
const SCORES_DIR = path.join(ROOT, 'eval', 'scores');

async function listSlugs(filter: string[]): Promise<string[]> {
  if (!existsSync(OUTPUT_DIR)) return [];
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const all = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (filter.length === 0) return all;
  return all.filter((s) => filter.includes(s));
}

async function listScoredFiles(slug: string, fileFilter: string[]): Promise<string[]> {
  const dir = path.join(OUTPUT_DIR, slug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const jsons = entries.filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'));
  if (fileFilter.length === 0) return jsons;
  return jsons.filter((f) => fileFilter.includes(f.replace(/\.json$/, '')));
}

function parseArgs(argv: string[]): { slugs: string[]; files: string[] } {
  const slugs: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') {
      const next = argv[++i];
      if (!next) {
        console.error('Missing value for --file');
        process.exit(1);
      }
      files.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--file=')) {
      files.push(...a.slice('--file='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else {
      slugs.push(a);
    }
  }
  return { slugs, files: files.map((f) => f.replace(/\.(txt|json)$/, '')) };
}

async function main(): Promise<void> {
  const { slugs: argSlugs, files: fileFilter } = parseArgs(process.argv.slice(2));
  const slugs = await listSlugs(argSlugs);

  if (slugs.length === 0) {
    console.error('No model output directories found in output/.');
    process.exit(1);
  }

  let totalCost = 0;
  let totalScored = 0;
  let totalSkipped = 0;

  for (const slug of slugs) {
    const files = await listScoredFiles(slug, fileFilter);
    if (files.length === 0) continue;

    const scoreDir = path.join(SCORES_DIR, slug);
    await mkdir(scoreDir, { recursive: true });

    for (const file of files) {
      const baseName = file.replace(/\.json$/, '');
      const inputPath = path.join(INPUT_DIR, `${baseName}.txt`);
      const groundTruthPath = path.join(GROUND_TRUTH_DIR, `${baseName}.json`);
      const modelOutputPath = path.join(OUTPUT_DIR, slug, file);
      const scoreOutPath = path.join(scoreDir, file);

      if (!existsSync(inputPath)) {
        console.warn(`[${slug}] ${file} → skipped (no input file at ${inputPath})`);
        continue;
      }
      if (!existsSync(groundTruthPath)) {
        console.warn(`[${slug}] ${file} → skipped (no ground truth at ${groundTruthPath})`);
        continue;
      }
      if (existsSync(scoreOutPath)) {
        totalSkipped++;
        continue;
      }

      try {
        const score = await scoreOnePair({
          inputFile: `${baseName}.txt`,
          slug,
          inputPath,
          groundTruthPath,
          modelOutputPath,
        });
        await writeFile(scoreOutPath, JSON.stringify(score, null, 2));
        totalCost += score.judgeCostUsd;
        totalScored++;
        console.log(
          `[${slug}] ${file} → score ${score.overall.score.toFixed(2)} ($${score.judgeCostUsd.toFixed(4)} judge cost, ${score.judgeLatencyMs}ms)`
        );
      } catch (err) {
        console.error(`[${slug}] ${file} → ERROR:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log('');
  console.log(`Scored ${totalScored} pairs (skipped ${totalSkipped} already-scored).`);
  console.log(`Total judge cost: $${totalCost.toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
