import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { MODEL_CONFIGS } from './config';
import { processFile } from './processor';

const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_API_KEY',
};

async function main() {
  const configKey = process.argv[2];
  const fileArgs = process.argv.slice(3);

  if (!configKey) {
    console.error('Usage: tsx src/index.ts <configKey> [file1.txt file2.txt file3.txt]');
    console.error('Available configs:', Object.keys(MODEL_CONFIGS).join(', '));
    process.exit(1);
  }

  const config = MODEL_CONFIGS[configKey];
  if (!config) {
    console.error(`Unknown config key: "${configKey}"`);
    console.error('Available configs:', Object.keys(MODEL_CONFIGS).join(', '));
    process.exit(1);
  }

  const envKey = PROVIDER_ENV_KEYS[config.provider];
  if (!process.env[envKey]) {
    console.error(`Missing environment variable: ${envKey}`);
    console.error(`Set it in .env before running ${configKey}`);
    process.exit(1);
  }

  let filePaths: string[];

  if (config.highEffort) {
    if (fileArgs.length !== 3) {
      console.error(
        `Error: "${configKey}" is a high-effort config and requires exactly 3 file arguments.`
      );
      console.error(`Usage: npm run run:${configKey} -- file1.txt file2.txt file3.txt`);
      process.exit(1);
    }
    filePaths = fileArgs.map((f) => path.join('input', f));
    for (const fp of filePaths) {
      try {
        await fs.access(fp);
      } catch {
        console.error(`File not found: ${fp}`);
        process.exit(1);
      }
    }
  } else {
    const entries = await fs.readdir('input');
    filePaths = entries.filter((f) => f.endsWith('.txt')).map((f) => path.join('input', f));
    if (filePaths.length === 0) {
      console.error('No .txt files found in input/ directory');
      process.exit(1);
    }
  }

  console.log(`Running ${configKey} (${config.model}) on ${filePaths.length} file(s)...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const filePath of filePaths) {
    try {
      await processFile(config, filePath);
      succeeded++;
    } catch {
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
}

main();
