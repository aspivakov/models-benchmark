export type FieldVerdict<T = string> = {
  match: boolean;
  expected: T;
  actual: T;
  notes?: string;
};

export type ListFieldVerdict = {
  precision: number;
  recall: number;
  f1: number;
  hallucinated: string[];
  missed: string[];
  merges: string[];
  notes?: string;
};

export type PairScore = {
  inputFile: string;
  slug: string;
  model: string;
  provider: string;
  scoredAt: string;

  deterministic: {
    seniority: FieldVerdict;
    remote_policy: FieldVerdict;
    years_experience: FieldVerdict;
    company: FieldVerdict;
    title: FieldVerdict;
  };

  judge: {
    location: FieldVerdict;
    salary_range: FieldVerdict;
    benefits: ListFieldVerdict;
    required_skills: ListFieldVerdict;
    nice_to_have_skills: ListFieldVerdict;
  };

  overall: {
    score: number;
    deterministicMean: number;
    judgeMean: number;
  };

  judgeCostUsd: number;
  judgeLatencyMs: number;
};

export type ModelSummary = {
  slug: string;
  model: string;
  provider: string;
  filesScored: number;

  deterministic: {
    seniority: number;
    remote_policy: number;
    years_experience: number;
    company: number;
    title: number;
    mean: number;
  };

  judge: {
    location: number;
    salary_range: number;
    benefits_f1: number;
    benefits_precision: number;
    benefits_recall: number;
    required_skills_f1: number;
    required_skills_precision: number;
    required_skills_recall: number;
    nice_to_have_skills_f1: number;
    nice_to_have_skills_precision: number;
    nice_to_have_skills_recall: number;
    mean: number;
  };

  overall: number;

  extractionCostUsdTotal: number;
  extractionLatencyMsMean: number;
  extractionLatencyMsP95: number;
};
