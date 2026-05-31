import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { calculateCost, type ModelConfig } from '../config';
import { logRawResponse, parseModelJson } from '../parse';
import { SYSTEM_PROMPT } from '../prompts';
import type { RunResult } from '../types';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    company: { type: Type.STRING },
    location: { type: Type.STRING },
    remote_policy: { type: Type.STRING, enum: ['remote', 'hybrid', 'on-site', 'not specified'] },
    salary_range: { type: Type.STRING },
    benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
    required_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    nice_to_have_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    years_experience: { type: Type.STRING },
    seniority: { type: Type.STRING, enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'staff', 'not specified'] },
  },
  required: ['title', 'company', 'location', 'remote_policy', 'salary_range', 'benefits', 'required_skills', 'nice_to_have_skills', 'years_experience', 'seniority'],
};

export async function runGemini(
  config: ModelConfig,
  inputFile: string,
  jobText: string
): Promise<RunResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  const generationConfig: Record<string, unknown> = {
    systemInstruction: SYSTEM_PROMPT,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  };

  if (config.thinkingEnabled) {
    if (config.thinkingLevel != null) {
      // Gemini 3.x: control reasoning via thinkingLevel.
      const levelMap: Record<'low' | 'medium' | 'high', ThinkingLevel> = {
        low: ThinkingLevel.LOW,
        medium: ThinkingLevel.MEDIUM,
        high: ThinkingLevel.HIGH,
      };
      generationConfig.thinkingConfig = { thinkingLevel: levelMap[config.thinkingLevel] };
    } else if (config.thinkingBudget != null) {
      generationConfig.thinkingConfig = { thinkingBudget: config.thinkingBudget };
    }
  }

  const start = Date.now();

  const response = await ai.models.generateContent({
    model: config.model,
    contents: [{ role: 'user', parts: [{ text: jobText }] }],
    config: generationConfig,
  });

  const latencyMs = Date.now() - start;

  const text = response.text;
  if (!text) {
    throw new Error('Empty response from Gemini');
  }

  const rawResponse = text;
  await logRawResponse(config, inputFile, rawResponse);
  const output = parseModelJson(rawResponse);
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const thinkingTokens = config.thinkingEnabled
    ? ((response.usageMetadata as any)?.thoughtsTokenCount ?? undefined)
    : undefined;

  return {
    provider: 'gemini',
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
