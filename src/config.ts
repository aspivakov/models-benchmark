import { PRICING } from './pricing';

// Provider-native reasoning effort levels.
// Gemini 3.x: thinkingConfig.thinkingLevel ('low' | 'high', etc.)
// OpenAI GPT-5.x / o-series: reasoning_effort ('low' | 'medium' | 'high', etc.)
export type ThinkingLevel = 'low' | 'medium' | 'high';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export type ModelConfig = {
  slug: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'gemini';
  highEffort: boolean;
  thinkingEnabled: boolean;
  thinkingBudget?: number;
  // Gemini 3.x uses thinkingLevel instead of a token budget.
  thinkingLevel?: ThinkingLevel;
  // OpenAI reasoning models use reasoning_effort.
  reasoningEffort?: ReasoningEffort;
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
  'gpt5.4-mini': {
    slug: 'gpt-5.4-mini',
    model: 'gpt-5.4-mini',
    provider: 'openai',
    highEffort: false,
    thinkingEnabled: false,
  },
  'gpt5.4': {
    slug: 'gpt-5.4',
    model: 'gpt-5.4',
    provider: 'openai',
    highEffort: false,
    thinkingEnabled: false,
  },
  'gpt5.4-thinking': {
    slug: 'gpt-5.4-thinking',
    model: 'gpt-5.4',
    provider: 'openai',
    highEffort: true,
    thinkingEnabled: true,
    reasoningEffort: 'high',
  },
  'gemini-flash': {
    slug: 'gemini-3.1-flash-lite',
    model: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    highEffort: false,
    thinkingEnabled: false,
  },
  'gemini-pro': {
    slug: 'gemini-3.1-pro-preview',
    model: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    highEffort: false,
    thinkingEnabled: false,
  },
  'gemini-pro-thinking': {
    slug: 'gemini-3.1-pro-preview-thinking',
    model: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    highEffort: true,
    thinkingEnabled: true,
    thinkingLevel: 'high',
  },
};

export function getOutputDir(config: ModelConfig): string {
  return config.highEffort ? `${config.slug}_high_effort` : config.slug;
}

// Resolve a model filter to its output-directory slug. The filter may be a
// config key (e.g. "haiku", "gemini-pro-thinking") matching the run:* scripts,
// or an already-resolved output-dir name (e.g. "claude-haiku-4-5").
export function resolveOutputDir(keyOrSlug: string): string {
  const config = MODEL_CONFIGS[keyOrSlug];
  return config ? getOutputDir(config) : keyOrSlug;
}

// Models the `serve` UI loads and charts. Each entry may be a config key
// (e.g. "haiku", "gemini-pro-thinking") or a raw output-dir slug
// (e.g. "claude-haiku-4-5"). Leave empty to display every scored model.
// This controls which models the server takes into account, not the on-page
// filter checkboxes (which only toggle visibility among the loaded models).
export const SERVE_MODELS: string[] = [
  'haiku',
  'sonnet',
  'gpt5.4-mini',
  'gpt5.4',
  'gemini-flash',
  'gemini-pro',
];

export function calculateCost(
  config: ModelConfig,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[config.slug];
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMToken +
    (outputTokens / 1_000_000) * pricing.outputPerMToken
  );
}
