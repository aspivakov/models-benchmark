import fs from 'fs/promises';
import path from 'path';
import { jsonrepair } from 'jsonrepair';
import { getOutputDir } from './config';
import type { ModelConfig } from './config';
import type { Output } from './types';

export async function logRawResponse(config: ModelConfig, inputFile: string, raw: string): Promise<void> {
  const outputDir = path.join('output', getOutputDir(config));
  await fs.mkdir(outputDir, { recursive: true });
  const rawPath = path.join(outputDir, inputFile.replace(/\.txt$/, '.raw.txt'));
  await fs.writeFile(rawPath, raw);
}

export function parseModelJson(text: string): Output {
  let cleaned = text.trim();
  const fence = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence) {
    cleaned = fence[1].trim();
  }
  try {
    return JSON.parse(cleaned) as Output;
  } catch {
    return JSON.parse(jsonrepair(cleaned)) as Output;
  }
}
