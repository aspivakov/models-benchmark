export type Output = {
    title: string;
    company: string;
    location: string;
    remote_policy: string;
    salary_range: string;
    benefits: string[];
    required_skills: string[];
    nice_to_have_skills: string[];
    years_experience: string;
    seniority: string;
};

export type RunResult = {
  provider: 'anthropic' | 'openai' | 'gemini';
  model: string;              // e.g. 'claude-haiku-4-5', 'gpt-4o-mini'
  thinkingEnabled: boolean;   // new
  thinkingTokens?: number;    // new — when applicable
  inputFile: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  output: Output;
  rawResponse: string;
  timestamp: string;
};