import OpenAI from 'openai';
import { calculateCost, type ModelConfig } from '../config';
import { logRawResponse, parseModelJson } from '../parse';
import { SYSTEM_PROMPT } from '../prompts';
import type { RunResult } from '../types';

export async function runOpenAI(
  config: ModelConfig,
  inputFile: string,
  jobText: string
): Promise<RunResult> {
  const client = new OpenAI();
  const start = Date.now();
  let response: OpenAI.Chat.ChatCompletion;

  if (config.thinkingEnabled) {
    // Reasoning model: no system role, use max_completion_tokens and reasoning_effort.
    response = await client.chat.completions.create({
      model: config.model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 8000,
      ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${jobText}` }],
    });
  } else {
    response = await client.chat.completions.create({
      model: config.model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: jobText },
      ],
    });
  }

  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const rawResponse = content;
  await logRawResponse(config, inputFile, rawResponse);
  const output = parseModelJson(rawResponse);
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const thinkingTokens = config.thinkingEnabled
    ? ((response.usage?.completion_tokens_details as any)?.reasoning_tokens ?? undefined)
    : undefined;

  return {
    provider: 'openai',
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
