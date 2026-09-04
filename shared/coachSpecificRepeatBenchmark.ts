import type { CoachSpecificRepeatTag } from "@shared/coachSpecificRepeatFixtures";

export type CoachSpecificRepeatPath = "strategy" | "direct";
export type CoachSpecificRepeatSampleId = "strategy_a" | "strategy_b" | "direct_a" | "direct_b";
export type CoachSpecificRepeatBlindId = "W" | "X" | "Y" | "Z";

export type CoachSpecificRepeatScores = {
  intentFidelity: number;
  instructionObedience: number;
  hookStrength: number;
  originality: number;
  clarity: number;
  naturalness: number;
  narrativeQuality: number;
  overall: number;
};

export type CoachSpecificRepeatCandidateJudgment = {
  scores: CoachSpecificRepeatScores;
  intentViolations: string[];
  instructionViolations: string[];
};

export type CoachSpecificRepeatJudgment = {
  candidates: Record<CoachSpecificRepeatBlindId, CoachSpecificRepeatCandidateJudgment>;
  winner: CoachSpecificRepeatBlindId | "tie";
  rationale: string;
};

export type CoachSpecificRepeatConstraintTrace = {
  initialViolations: string[];
  correctionCount: number;
  unresolvedViolations: string[];
};

export type CoachSpecificRepeatSample = {
  sampleId: CoachSpecificRepeatSampleId;
  path: CoachSpecificRepeatPath;
  scores: CoachSpecificRepeatScores;
  latencyMs: number;
  constraints: CoachSpecificRepeatConstraintTrace;
  judgeIntentViolations: string[];
  judgeInstructionViolations: string[];
};

export type CoachSpecificRepeatCaseResult = {
  caseId: string;
  tags: CoachSpecificRepeatTag[];
  assignment: Record<CoachSpecificRepeatBlindId, CoachSpecificRepeatSampleId>;
  judgment: CoachSpecificRepeatJudgment;
  samples: Record<CoachSpecificRepeatSampleId, CoachSpecificRepeatSample>;
};

export type CoachSpecificRepeatPathStats = {
  intentFidelity: number;
  instructionObedience: number;
  hookStrength: number;
  originality: number;
  clarity: number;
  naturalness: number;
  narrativeQuality: number;
  overall: number;
  overallVariance: number;
  meanAbsOverallSpread: number;
  initialViolationRate: number;
  correctionRate: number;
  unresolvedViolationRate: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
};

export type CoachSpecificRepeatCategoryStats = {
  cases: number;
  strategyWins: number;
  directWins: number;
  ties: number;
  strategy: CoachSpecificRepeatPathStats;
  direct: CoachSpecificRepeatPathStats;
};

export type CoachSpecificRepeatSummary = {
  cases: number;
  samplesPerArchitecture: 2;
  pairwise: { strategyWins: number; directWins: number; ties: number };
  strategy: CoachSpecificRepeatPathStats;
  direct: CoachSpecificRepeatPathStats;
  latency: {
    strategyAvgMs: number;
    strategyP50Ms: number;
    directAvgMs: number;
    directP50Ms: number;
    secondsSaved: number;
    qualityDeltaPer30sSaved: number;
  };
  byTag: Partial<Record<CoachSpecificRepeatTag | "exact_instruction_set", CoachSpecificRepeatCategoryStats>>;
};

const SCORE_KEYS: Array<keyof CoachSpecificRepeatScores> = [
  "intentFidelity",
  "instructionObedience",
  "hookStrength",
  "originality",
  "clarity",
  "naturalness",
  "narrativeQuality",
  "overall",
];

const SAMPLE_IDS: CoachSpecificRepeatSampleId[] = ["strategy_a", "strategy_b", "direct_a", "direct_b"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readScore(value: unknown): number | null {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;
  return Math.round(score * 10) / 10;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseCandidate(value: unknown): CoachSpecificRepeatCandidateJudgment | null {
  const record = asRecord(value);
  const rawScores = asRecord(record?.scores);
  if (!record || !rawScores) return null;
  const scores = {} as CoachSpecificRepeatScores;
  for (const key of SCORE_KEYS) {
    const score = readScore(rawScores[key]);
    if (score === null) return null;
    scores[key] = score;
  }
  return {
    scores,
    intentViolations: readStringArray(record.intentViolations),
    instructionViolations: readStringArray(record.instructionViolations),
  };
}

export function buildBlindCoachSpecificRepeatJudgePrompt(args: {
  rawIdea: string;
  niche: string;
  targetAudience: string;
  candidateW: string;
  candidateX: string;
  candidateY: string;
  candidateZ: string;
}): string {
  return `You are a blind evaluator of four short-form Reel scripts produced for the same highly specific creator request. You do not know which system produced any candidate, and you do not know which draft is a first or second attempt.

This request already supplies creative direction. Intent fidelity and explicit instruction obedience are hard gates. A script with a material creator-instruction violation cannot win overall, even if it is more original or has a stronger hook.

Judge only how well each script serves the creator request. Do not reward a script merely for being longer, more polished, or more dramatic.

CREATOR REQUEST
<<<${args.rawIdea.trim()}>>>

CREATOR PROFILE
Niche: ${args.niche}
Target audience: ${args.targetAudience}

CANDIDATE W
<<<${args.candidateW.trim()}>>>

CANDIDATE X
<<<${args.candidateX.trim()}>>>

CANDIDATE Y
<<<${args.candidateY.trim()}>>>

CANDIDATE Z
<<<${args.candidateZ.trim()}>>>

Score EACH candidate from 1-10 on:
- intentFidelity: preserves the creator's topic, claim, and exclusions
- instructionObedience: follows explicit opening, ending, format, product-placement, and forbidden-topic instructions
- hookStrength: creates immediate curiosity or tension without cheap clickbait
- originality: feels specific rather than generic AI copy
- clarity: a cold viewer can follow it
- naturalness: sounds human and speakable
- narrativeQuality: the story or argument progresses cleanly
- overall: holistic quality, with intent and obedience as hard gates

List concrete violations only when a candidate actually changes or contradicts an explicit creator instruction. Otherwise return empty lists.

Return JSON only:
{
  "candidates": {
    "W": {
      "scores": { "intentFidelity": 1, "instructionObedience": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "narrativeQuality": 1, "overall": 1 },
      "intentViolations": [],
      "instructionViolations": []
    },
    "X": {
      "scores": { "intentFidelity": 1, "instructionObedience": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "narrativeQuality": 1, "overall": 1 },
      "intentViolations": [],
      "instructionViolations": []
    },
    "Y": {
      "scores": { "intentFidelity": 1, "instructionObedience": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "narrativeQuality": 1, "overall": 1 },
      "intentViolations": [],
      "instructionViolations": []
    },
    "Z": {
      "scores": { "intentFidelity": 1, "instructionObedience": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "narrativeQuality": 1, "overall": 1 },
      "intentViolations": [],
      "instructionViolations": []
    }
  },
  "winner": "W | X | Y | Z | tie",
  "rationale": "brief evidence-based comparison"
}`;
}

export function parseCoachSpecificRepeatJudgment(value: unknown): CoachSpecificRepeatJudgment | null {
  const root = asRecord(value);
  const candidates = asRecord(root?.candidates);
  if (!root || !candidates) return null;
  const W = parseCandidate(candidates.W);
  const X = parseCandidate(candidates.X);
  const Y = parseCandidate(candidates.Y);
  const Z = parseCandidate(candidates.Z);
  if (!W || !X || !Y || !Z) return null;
  const winnerRaw = typeof root.winner === "string" ? root.winner.trim().toUpperCase() : "";
  const winner =
    winnerRaw === "W" || winnerRaw === "X" || winnerRaw === "Y" || winnerRaw === "Z" || winnerRaw === "TIE"
      ? winnerRaw === "TIE"
        ? "tie"
        : winnerRaw
      : null;
  const rationale = typeof root.rationale === "string" ? root.rationale.trim() : "";
  if (!winner || !rationale) return null;
  return { candidates: { W, X, Y, Z }, winner, rationale };
}

export function rotateSpecificRepeatAssignment(
  index: number
): Record<CoachSpecificRepeatBlindId, CoachSpecificRepeatSampleId> {
  const rotations: Array<Record<CoachSpecificRepeatBlindId, CoachSpecificRepeatSampleId>> = [
    { W: "strategy_a", X: "strategy_b", Y: "direct_a", Z: "direct_b" },
    { W: "direct_a", X: "strategy_a", Y: "direct_b", Z: "strategy_b" },
    { W: "direct_b", X: "direct_a", Y: "strategy_b", Z: "strategy_a" },
    { W: "strategy_b", X: "direct_b", Y: "strategy_a", Z: "direct_a" },
  ];
  return rotations[index % rotations.length];
}

function emptyScores(): CoachSpecificRepeatScores {
  return {
    intentFidelity: 0,
    instructionObedience: 0,
    hookStrength: 0,
    originality: 0,
    clarity: 0,
    naturalness: 0,
    narrativeQuality: 0,
    overall: 0,
  };
}

function averageNumbers(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function averageScores(list: CoachSpecificRepeatScores[]): CoachSpecificRepeatScores {
  if (list.length === 0) return emptyScores();
  const totals = emptyScores();
  for (const scores of list) {
    for (const key of SCORE_KEYS) totals[key] += scores[key];
  }
  for (const key of SCORE_KEYS) totals[key] = Math.round((totals[key] / list.length) * 100) / 100;
  return totals;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 1) / 1;
  return sorted[mid];
}

export function sampleHasMaterialViolation(sample: CoachSpecificRepeatSample): boolean {
  return (
    sample.constraints.unresolvedViolations.length > 0 ||
    sample.judgeIntentViolations.length > 0 ||
    sample.judgeInstructionViolations.length > 0
  );
}

function pathSamples(
  result: CoachSpecificRepeatCaseResult,
  path: CoachSpecificRepeatPath
): CoachSpecificRepeatSample[] {
  return SAMPLE_IDS.filter((id) => id.startsWith(path)).map((id) => result.samples[id]);
}

function pairwiseWinner(result: CoachSpecificRepeatCaseResult): "strategy" | "direct" | "tie" {
  const strategy = pathSamples(result, "strategy");
  const direct = pathSamples(result, "direct");
  const strategyViol = strategy.some(sampleHasMaterialViolation);
  const directViol = direct.some(sampleHasMaterialViolation);
  if (strategyViol && !directViol) return "direct";
  if (directViol && !strategyViol) return "strategy";
  const strategyOverall = averageNumbers(strategy.map((sample) => sample.scores.overall));
  const directOverall = averageNumbers(direct.map((sample) => sample.scores.overall));
  if (Math.abs(strategyOverall - directOverall) <= 0.2) return "tie";
  return strategyOverall > directOverall ? "strategy" : "direct";
}

function statsForPath(results: CoachSpecificRepeatCaseResult[], path: CoachSpecificRepeatPath): CoachSpecificRepeatPathStats {
  const samples = results.flatMap((result) => pathSamples(result, path));
  const scoreAvg = averageScores(samples.map((sample) => sample.scores));
  const spreads = results.map((result) => {
    const pair = pathSamples(result, path);
    return Math.abs(pair[0].scores.overall - pair[1].scores.overall);
  });
  const overallPairs = results.map((result) => pathSamples(result, path).map((sample) => sample.scores.overall));
  const latencies = samples.map((sample) => sample.latencyMs);
  return {
    ...scoreAvg,
    overallVariance: averageNumbers(overallPairs.map((pair) => stdev(pair))),
    meanAbsOverallSpread: averageNumbers(spreads),
    initialViolationRate: averageNumbers(samples.map((sample) => (sample.constraints.initialViolations.length > 0 ? 1 : 0))),
    correctionRate: averageNumbers(samples.map((sample) => (sample.constraints.correctionCount > 0 ? 1 : 0))),
    unresolvedViolationRate: averageNumbers(samples.map((sample) => (sample.constraints.unresolvedViolations.length > 0 ? 1 : 0))),
    averageLatencyMs: Math.round(averageNumbers(latencies)),
    p50LatencyMs: median(latencies),
  };
}

function categoryStats(results: CoachSpecificRepeatCaseResult[]): CoachSpecificRepeatCategoryStats {
  const pairwise = { strategyWins: 0, directWins: 0, ties: 0 };
  for (const result of results) {
    const winner = pairwiseWinner(result);
    if (winner === "strategy") pairwise.strategyWins += 1;
    else if (winner === "direct") pairwise.directWins += 1;
    else pairwise.ties += 1;
  }
  return {
    cases: results.length,
    ...pairwise,
    strategy: statsForPath(results, "strategy"),
    direct: statsForPath(results, "direct"),
  };
}

export function summarizeCoachSpecificRepeatBenchmark(
  results: CoachSpecificRepeatCaseResult[]
): CoachSpecificRepeatSummary {
  const overall = categoryStats(results);
  const strategy = overall.strategy;
  const direct = overall.direct;
  const secondsSaved = Math.round(((strategy.averageLatencyMs - direct.averageLatencyMs) / 1000) * 10) / 10;
  const qualityDelta = Math.round((strategy.overall - direct.overall) * 100) / 100;
  const qualityDeltaPer30sSaved = secondsSaved === 0 ? 0 : Math.round((qualityDelta / (secondsSaved / 30)) * 100) / 100;

  const tags: Array<CoachSpecificRepeatTag | "exact_instruction_set"> = [
    "delayed_name",
    "product_cta_only",
    "product_comparison",
    "product_demo",
    "contrarian",
    "exact_hook",
    "exact_cta",
    "story",
    "educational",
    "sales",
    "spyreels",
    "operator",
    "exact_instruction_set",
  ];
  const byTag: CoachSpecificRepeatSummary["byTag"] = {};
  for (const tag of tags) {
    const subset =
      tag === "exact_instruction_set"
        ? results.filter(
            (result) =>
              result.tags.includes("exact_hook") &&
              result.tags.includes("exact_cta") &&
              (result.tags.includes("contrarian") || result.tags.includes("educational") || result.tags.includes("sales"))
          )
        : results.filter((result) => result.tags.includes(tag));
    if (subset.length > 0) byTag[tag] = categoryStats(subset);
  }

  return {
    cases: results.length,
    samplesPerArchitecture: 2,
    pairwise: {
      strategyWins: overall.strategyWins,
      directWins: overall.directWins,
      ties: overall.ties,
    },
    strategy,
    direct,
    latency: {
      strategyAvgMs: strategy.averageLatencyMs,
      strategyP50Ms: strategy.p50LatencyMs,
      directAvgMs: direct.averageLatencyMs,
      directP50Ms: direct.p50LatencyMs,
      secondsSaved,
      qualityDeltaPer30sSaved,
    },
    byTag,
  };
}
