export type CoachBenchmarkCandidateId = "X" | "Y";
export type CoachBenchmarkSpecificity = "vague" | "specific";

export type CoachBenchmarkScores = {
  intentFidelity: number;
  hookStrength: number;
  originality: number;
  clarity: number;
  overall: number;
};

export type CoachBenchmarkCandidateJudgment = {
  scores: CoachBenchmarkScores;
  intentViolations: string[];
};

export type CoachBenchmarkJudgment = {
  candidates: Record<CoachBenchmarkCandidateId, CoachBenchmarkCandidateJudgment>;
  winner: CoachBenchmarkCandidateId | "tie";
  rationale: string;
};

export type CoachBenchmarkCaseResult = {
  caseId: string;
  specificity: CoachBenchmarkSpecificity;
  strategyCandidate: CoachBenchmarkCandidateId;
  judgment: CoachBenchmarkJudgment;
  strategyConstraintCorrections?: number;
  directConstraintCorrections?: number;
  strategyMs?: number;
  directMs?: number;
};

export type CoachBenchmarkSummary = {
  cases: number;
  strategyWins: number;
  directWins: number;
  ties: number;
  strategyAverages: CoachBenchmarkScores;
  directAverages: CoachBenchmarkScores;
  specificStrategyIntentViolationCases: number;
  strategyConstraintCorrections: number;
  directConstraintCorrections: number;
  averageStrategyMs: number;
  averageDirectMs: number;
  passed: boolean;
  passCriteria: {
    strategyOverallAtLeastDirect: boolean;
    strategyWinsAtLeastDirect: boolean;
    intentFidelityPreserved: boolean;
    noSpecificIntentViolations: boolean;
  };
};

const SCORE_KEYS: Array<keyof CoachBenchmarkScores> = [
  "intentFidelity",
  "hookStrength",
  "originality",
  "clarity",
  "overall",
];

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

function parseCandidate(value: unknown): CoachBenchmarkCandidateJudgment | null {
  const record = asRecord(value);
  const rawScores = asRecord(record?.scores);
  if (!record || !rawScores) return null;

  const scores = {} as CoachBenchmarkScores;
  for (const key of SCORE_KEYS) {
    const score = readScore(rawScores[key]);
    if (score === null) return null;
    scores[key] = score;
  }

  return {
    scores,
    intentViolations: readStringArray(record.intentViolations),
  };
}

export function buildBlindCoachBenchmarkJudgePrompt(args: {
  rawIdea: string;
  niche: string;
  targetAudience: string;
  candidateX: string;
  candidateY: string;
}): string {
  return `You are a blind evaluator of two short-form Reel scripts produced for the same creator request. You do not know which system produced either candidate.

Judge only how well each script serves the creator request and audience. Do not reward a script merely for being longer, more polished, or more dramatic. Penalize any candidate that changes the creator's topic, violates an explicit exclusion, invents unsupported facts, or ignores a requested framing.

CREATOR REQUEST
<<<${args.rawIdea.trim()}>>>

CREATOR PROFILE
Niche: ${args.niche}
Target audience: ${args.targetAudience}

CANDIDATE X
<<<${args.candidateX.trim()}>>>

CANDIDATE Y
<<<${args.candidateY.trim()}>>>

Score EACH candidate from 1-10 on:
- intentFidelity: preserves the creator's actual topic, goal, constraints, and exclusions
- hookStrength: creates immediate curiosity/tension without cheap clickbait
- originality: feels specific and non-generic rather than obvious AI copy
- clarity: a cold viewer can quickly understand and follow it
- overall: holistic quality, with intent fidelity as a hard gate

If the creator request is vague, creativity is good. If it is specific, obedience matters more than novelty.

List concrete intent violations only when a candidate actually changes or contradicts an explicit creator instruction. Otherwise return an empty list.

Return JSON only:
{
  "candidates": {
    "X": {
      "scores": { "intentFidelity": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "overall": 1 },
      "intentViolations": []
    },
    "Y": {
      "scores": { "intentFidelity": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "overall": 1 },
      "intentViolations": []
    }
  },
  "winner": "X | Y | tie",
  "rationale": "brief evidence-based comparison"
}`;
}

export function parseCoachBenchmarkJudgment(value: unknown): CoachBenchmarkJudgment | null {
  const root = asRecord(value);
  const candidates = asRecord(root?.candidates);
  if (!root || !candidates) return null;

  const candidateX = parseCandidate(candidates.X);
  const candidateY = parseCandidate(candidates.Y);
  if (!candidateX || !candidateY) return null;

  const winnerRaw = typeof root.winner === "string" ? root.winner.trim().toUpperCase() : "";
  const winner = winnerRaw === "X" || winnerRaw === "Y" || winnerRaw === "TIE"
    ? (winnerRaw === "TIE" ? "tie" : winnerRaw)
    : null;
  const rationale = typeof root.rationale === "string" ? root.rationale.trim() : "";
  if (!winner || !rationale) return null;

  return {
    candidates: { X: candidateX, Y: candidateY },
    winner,
    rationale,
  };
}

function emptyScores(): CoachBenchmarkScores {
  return {
    intentFidelity: 0,
    hookStrength: 0,
    originality: 0,
    clarity: 0,
    overall: 0,
  };
}

function averageScores(list: CoachBenchmarkScores[]): CoachBenchmarkScores {
  if (list.length === 0) return emptyScores();
  const totals = emptyScores();
  for (const scores of list) {
    for (const key of SCORE_KEYS) totals[key] += scores[key];
  }
  for (const key of SCORE_KEYS) totals[key] = Math.round((totals[key] / list.length) * 100) / 100;
  return totals;
}

export function summarizeCoachBenchmark(results: CoachBenchmarkCaseResult[]): CoachBenchmarkSummary {
  const strategyScores: CoachBenchmarkScores[] = [];
  const directScores: CoachBenchmarkScores[] = [];
  let strategyWins = 0;
  let directWins = 0;
  let ties = 0;
  let specificStrategyIntentViolationCases = 0;
  let strategyConstraintCorrections = 0;
  let directConstraintCorrections = 0;
  let strategyMsTotal = 0;
  let directMsTotal = 0;

  for (const result of results) {
    const directCandidate: CoachBenchmarkCandidateId = result.strategyCandidate === "X" ? "Y" : "X";
    strategyScores.push(result.judgment.candidates[result.strategyCandidate].scores);
    directScores.push(result.judgment.candidates[directCandidate].scores);

    if (result.judgment.winner === "tie") {
      ties++;
    } else if (result.judgment.winner === result.strategyCandidate) {
      strategyWins++;
    } else {
      directWins++;
    }

    if (
      result.specificity === "specific" &&
      result.judgment.candidates[result.strategyCandidate].intentViolations.length > 0
    ) {
      specificStrategyIntentViolationCases++;
    }

    strategyConstraintCorrections += result.strategyConstraintCorrections ?? 0;
    directConstraintCorrections += result.directConstraintCorrections ?? 0;
    strategyMsTotal += result.strategyMs ?? 0;
    directMsTotal += result.directMs ?? 0;
  }

  const strategyAverages = averageScores(strategyScores);
  const directAverages = averageScores(directScores);
  const passCriteria = {
    strategyOverallAtLeastDirect: strategyAverages.overall >= directAverages.overall,
    strategyWinsAtLeastDirect: strategyWins >= directWins,
    intentFidelityPreserved: strategyAverages.intentFidelity >= directAverages.intentFidelity - 0.1,
    noSpecificIntentViolations: specificStrategyIntentViolationCases === 0,
  };

  return {
    cases: results.length,
    strategyWins,
    directWins,
    ties,
    strategyAverages,
    directAverages,
    specificStrategyIntentViolationCases,
    strategyConstraintCorrections,
    directConstraintCorrections,
    averageStrategyMs: results.length ? Math.round(strategyMsTotal / results.length) : 0,
    averageDirectMs: results.length ? Math.round(directMsTotal / results.length) : 0,
    passed: Object.values(passCriteria).every(Boolean),
    passCriteria,
  };
}
