import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { calculateCost, type ModelConfig } from '../config';
import { logRawResponse, parseModelJson } from '../parse';
import { SYSTEM_PROMPT } from '../prompts';
import type { RunResult } from '../types';

export async function runAnthropic(
  config: ModelConfig,
  inputFile: string,
  jobText: string
): Promise<RunResult> {
  const client = new Anthropic();
  const start = Date.now();
  let response: Message;

  if (config.thinkingEnabled) {
    response = (await (client.beta.messages as any).create({
      model: config.model,
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: config.thinkingBudget ?? 10000 },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: jobText }],
      betas: ['interleaved-thinking-2025-05-14'],
    })) as Message;
  } else {
    response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: jobText }],
    });
  }

  const latencyMs = Date.now() - start;

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content block in Anthropic response');
  }

  const rawResponse = textBlock.text;
  await logRawResponse(config, inputFile, rawResponse);
  const output = parseModelJson(rawResponse);
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  let thinkingTokens: number | undefined;
  if (config.thinkingEnabled) {
    thinkingTokens = (response.usage as any).thinking_input_tokens ?? undefined;
  }

  return {
    provider: 'anthropic',
    model: config.model,
    thinkingEnabled: config.thinkingEnabled,
    thinkingTokens,
    inputFile,
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd: calculateCost(config, inputTokens, outputTokens),
    output,
    rawResponse,
    timestamp: new Date().toISOString(),
  };
}
