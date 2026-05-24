// Pricing per 1M tokens (USD). Update these values before running benchmarks.
export const PRICING: Record<string, { inputPerMToken: number; outputPerMToken: number }> = {
  'claude-haiku-4-5': { inputPerMToken: 1.0, outputPerMToken: 5.0 },
  'claude-sonnet-4-6': { inputPerMToken: 3.0, outputPerMToken: 15.0 },
  'gpt-4o-mini': { inputPerMToken: 0.15, outputPerMToken: 0.6 },
  'gpt-4o': { inputPerMToken: 2.5, outputPerMToken: 10.0 },
  'o4-mini': { inputPerMToken: 1.1, outputPerMToken: 4.4 },
  'gemini-2.5-flash': { inputPerMToken: 0.3, outputPerMToken: 2.5 },
  'gemini-2.5-pro': { inputPerMToken: 1.25, outputPerMToken: 10.0 },
  'gemini-2.5-pro-thinking': { inputPerMToken: 1.25, outputPerMToken: 10.0 },
};
