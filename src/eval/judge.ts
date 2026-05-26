import { GoogleGenAI, Type } from '@google/genai';
import { PRICING } from '../pricing';
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserMessage } from './prompts';

const JUDGE_MODEL = 'gemini-2.5-pro';

const STRING_FIELD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    match: { type: Type.BOOLEAN },
    notes: { type: Type.STRING },
  },
  required: ['match', 'notes'],
};

const LIST_FIELD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    precision: { type: Type.NUMBER },
    recall: { type: Type.NUMBER },
    hallucinated: { type: Type.ARRAY, items: { type: Type.STRING } },
    missed: { type: Type.ARRAY, items: { type: Type.STRING } },
    merges: { type: Type.ARRAY, items: { type: Type.STRING } },
    notes: { type: Type.STRING },
  },
  required: ['precision', 'recall', 'hallucinated', 'missed', 'merges', 'notes'],
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    location: STRING_FIELD_SCHEMA,
    salary_range: STRING_FIELD_SCHEMA,
    benefits: LIST_FIELD_SCHEMA,
    required_skills: LIST_FIELD_SCHEMA,
    nice_to_have_skills: LIST_FIELD_SCHEMA,
  },
  required: ['location', 'salary_range', 'benefits', 'required_skills', 'nice_to_have_skills'],
};

export type JudgeStringFieldRaw = { match: boolean; notes: string };
export type JudgeListFieldRaw = {
  precision: number;
  recall: number;
  hallucinated: string[];
  missed: string[];
  merges: string[];
  notes: string;
};

export type JudgeVerdict = {
  location: JudgeStringFieldRaw;
  salary_range: JudgeStringFieldRaw;
  benefits: JudgeListFieldRaw;
  required_skills: JudgeListFieldRaw;
  nice_to_have_skills: JudgeListFieldRaw;
};

export type JudgeResult = {
  verdict: JudgeVerdict;
  costUsd: number;
  latencyMs: number;
};

export function f1Score(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export async function runJudge(
  inputPosting: string,
  reference: Record<string, unknown>,
  modelOutput: Record<string, unknown>
): Promise<JudgeResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is required to run the judge');
  }

  const ai = new GoogleGenAI({ apiKey });
  const userMessage = buildJudgeUserMessage({ inputPosting, reference, modelOutput });

  const start = Date.now();
  const response = await ai.models.generateContent({
    model: JUDGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: JUDGE_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const latencyMs = Date.now() - start;

  const text = response.text;
  if (!text) {
    throw new Error('Empty response from judge');
  }

  const verdict = JSON.parse(text) as JudgeVerdict;

  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const pricing = PRICING[JUDGE_MODEL];
  const costUsd = pricing
    ? (inputTokens / 1_000_000) * pricing.inputPerMToken + (outputTokens / 1_000_000) * pricing.outputPerMToken
    : 0;

  return { verdict, costUsd, latencyMs };
}
