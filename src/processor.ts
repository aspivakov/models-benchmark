import fs from 'fs/promises';
import path from 'path';
import type { ModelConfig } from './config';
import { getOutputDir } from './config';
import { runAnthropic } from './providers/anthropic';
import { runOpenAI } from './providers/openai';
import { runGemini } from './providers/gemini';

export async function processFile(config: ModelConfig, filePath: string): Promise<void> {
  const inputFile = path.basename(filePath);
  const jobText = await fs.readFile(filePath, 'utf-8');

  let result;
  try {
    switch (config.provider) {
      case 'anthropic':
        result = await runAnthropic(config, inputFile, jobText);
        break;
      case 'openai':
        result = await runOpenAI(config, inputFile, jobText);
        break;
      case 'gemini':
        result = await runGemini(config, inputFile, jobText);
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${inputFile}: ${message}`);
    throw err;
  }

  const outputDir = path.join('output', getOutputDir(config));
  await fs.mkdir(outputDir, { recursive: true });

  const outputFilename = inputFile.replace(/\.txt$/, '.json');
  const outputPath = path.join(outputDir, outputFilename);
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

  console.log(
    `[${config.slug}] ${inputFile} → ${outputPath} (${result.latencyMs}ms, $${result.costUsd.toFixed(6)})`
  );
}
