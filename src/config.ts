import { PRICING } from './pricing';

export type ModelConfig = {
  slug: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'gemini';
  highEffort: boolean;
  thinkingEnabled: boolean;
  thinkingBudget?: number;
};

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  haiku: {
    slug: 'claude-haiku-4-5',
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    highEffort: false,
    thinkingEnabled: false,
  },
  sonnet: {
    slug: 'claude-sonnet-4-6',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    highEffort: false,
    thinkingEnabled: false,
  },
  'sonnet-thinking': {
    slug: 'claude-sonnet-4-6',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    highEffort: true,
    thinkingEnabled: true,
    thinkingBudget: 10000,
  },
  'gpt4o-mini': {
    slug: 'gpt-4o-mini',
    model: 'gpt-4o-mini',
    provider: 'openai',
    highEffort: false,
    thinkingEnabled: false,
  },
  gpt4o: {
    slug: 'gpt-4o',
    model: 'gpt-4o',
    provider: 'openai',
    highEffort: false,
    thinkingEnabled: false,
  },
  'o4-mini': {
    slug: 'o4-mini',
    model: 'o4-mini',
    provider: 'openai',
    highEffort: true,
    thinkingEnabled: true,
  },
  'gemini-flash': {
    slug: 'gemini-2.5-flash',
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    highEffort: false,
    thinkingEnabled: false,
  },
  'gemini-pro': {
    slug: 'gemini-2.5-pro',
    model: 'gemini-2.5-pro',
    provider: 'gemini',
    highEffort: false,
    thinkingEnabled: false,
  },
  'gemini-pro-thinking': {
    slug: 'gemini-2.5-pro-thinking',
    model: 'gemini-2.5-pro',
    provider: 'gemini',
    highEffort: true,
    thinkingEnabled: true,
    thinkingBudget: 8192,
  },
};

export function getOutputDir(config: ModelConfig): string {
  return config.highEffort ? `${config.slug}_high_effort` : config.slug;
}

export function calculateCost(config: ModelConfig, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[config.slug];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPerMToken + (outputTokens / 1_000_000) * pricing.outputPerMToken;
}
