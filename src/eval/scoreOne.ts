import { readFile } from 'fs/promises';
import type { Output, RunResult } from '../types';
import {
  scoreCompany,
  scoreRemotePolicy,
  scoreSeniority,
  scoreTitle,
  scoreYearsExperience,
} from './deterministic';
import { f1Score, runJudge } from './judge';
import type { FieldVerdict, ListFieldVerdict, PairScore } from './types';

// Overall score weighting (total = 13):
//   Deterministic fields (5 fields × weight 1) = 5
//   Judge string fields  (2 fields × weight 1) = 2
//   Judge list fields    (3 fields × weight 2) = 6 (using F1)
// overall.score = weighted_sum / 13

export type ScoreOneArgs = {
  inputFile: string;
  slug: string;
  inputPath: string;
  groundTruthPath: string;
  modelOutputPath: string;
};

export async function scoreOnePair(args: ScoreOneArgs): Promise<PairScore> {
  const [posting, gtRaw, runRaw] = await Promise.all([
    readFile(args.inputPath, 'utf8'),
    readFile(args.groundTruthPath, 'utf8'),
    readFile(args.modelOutputPath, 'utf8'),
  ]);

  const reference = JSON.parse(gtRaw) as Output;
  const run = JSON.parse(runRaw) as RunResult;
  const modelOutput = run.output;

  const deterministic = {
    seniority: scoreSeniority(reference.seniority ?? '', modelOutput.seniority ?? ''),
    remote_policy: scoreRemotePolicy(reference.remote_policy ?? '', modelOutput.remote_policy ?? ''),
    years_experience: scoreYearsExperience(
      reference.years_experience ?? '',
      modelOutput.years_experience ?? ''
    ),
    company: scoreCompany(reference.company ?? '', modelOutput.company ?? ''),
    title: scoreTitle(reference.title ?? '', modelOutput.title ?? ''),
  };

  const judgeResult = await runJudge(
    posting,
    reference as unknown as Record<string, unknown>,
    modelOutput as unknown as Record<string, unknown>
  );

  const v = judgeResult.verdict;

  const locationVerdict: FieldVerdict = {
    match: v.location.match,
    expected: reference.location ?? '',
    actual: modelOutput.location ?? '',
    notes: v.location.notes,
  };
  const salaryVerdict: FieldVerdict = {
    match: v.salary_range.match,
    expected: reference.salary_range ?? '',
    actual: modelOutput.salary_range ?? '',
    notes: v.salary_range.notes,
  };

  const benefits: ListFieldVerdict = {
    precision: v.benefits.precision,
    recall: v.benefits.recall,
    f1: f1Score(v.benefits.precision, v.benefits.recall),
    hallucinated: v.benefits.hallucinated,
    missed: v.benefits.missed,
    merges: v.benefits.merges,
    notes: v.benefits.notes,
  };
  const requiredSkills: ListFieldVerdict = {
    precision: v.required_skills.precision,
    recall: v.required_skills.recall,
    f1: f1Score(v.required_skills.precision, v.required_skills.recall),
    hallucinated: v.required_skills.hallucinated,
    missed: v.required_skills.missed,
    merges: v.required_skills.merges,
    notes: v.required_skills.notes,
  };
  const niceToHaveSkills: ListFieldVerdict = {
    precision: v.nice_to_have_skills.precision,
    recall: v.nice_to_have_skills.recall,
    f1: f1Score(v.nice_to_have_skills.precision, v.nice_to_have_skills.recall),
    hallucinated: v.nice_to_have_skills.hallucinated,
    missed: v.nice_to_have_skills.missed,
    merges: v.nice_to_have_skills.merges,
    notes: v.nice_to_have_skills.notes,
  };

  const detValues: number[] = [
    deterministic.seniority.match,
    deterministic.remote_policy.match,
    deterministic.years_experience.match,
    deterministic.company.match,
    deterministic.title.match,
  ].map((b) => (b ? 1 : 0));
  const deterministicSum = detValues.reduce((a, b) => a + b, 0);
  const deterministicMean = deterministicSum / detValues.length;

  const judgeStringValues: number[] = [locationVerdict.match, salaryVerdict.match].map((b) =>
    b ? 1 : 0
  );
  const judgeStringSum = judgeStringValues.reduce((a, b) => a + b, 0);
  const judgeListF1s = [benefits.f1, requiredSkills.f1, niceToHaveSkills.f1];
  const judgeListSum = judgeListF1s.reduce((a, b) => a + b, 0);
  const judgeMean = (judgeStringSum + judgeListSum) / (judgeStringValues.length + judgeListF1s.length);

  // Weighted total: det fields × 1, judge string × 1, judge list × 2 (using F1)
  const weightedSum = deterministicSum + judgeStringSum + 2 * judgeListSum;
  const totalWeight = 5 + 2 + 6;
  const overallScore = weightedSum / totalWeight;

  return {
    inputFile: args.inputFile,
    slug: args.slug,
    model: run.model,
    provider: run.provider,
    scoredAt: new Date().toISOString(),
    deterministic,
    judge: {
      location: locationVerdict,
      salary_range: salaryVerdict,
      benefits,
      required_skills: requiredSkills,
      nice_to_have_skills: niceToHaveSkills,
    },
    overall: {
      score: overallScore,
      deterministicMean,
      judgeMean,
    },
    judgeCostUsd: judgeResult.costUsd,
    judgeLatencyMs: judgeResult.latencyMs,
  };
}
