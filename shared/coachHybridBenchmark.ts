import type { CoachIdeaSpecificity, CoachIdeaSpecificityResult } from "@shared/coachIdeaSpecificity";

export type CoachHybridPathId = "old_direct" | "current_new" | "hybrid";
export type CoachHybridBlindId = "X" | "Y" | "Z";

export type CoachHybridScores = {
  intentFidelity: number;
  hookStrength: number;
  originality: number;
  clarity: number;
  naturalness: number;
  overall: number;
};

export type CoachHybridCandidateJudgment = {
  scores: CoachHybridScores;
  intentViolations: string[];
};

export type CoachHybridJudgment = {
  candidates: Record<CoachHybridBlindId, CoachHybridCandidateJudgment>;
  winner: CoachHybridBlindId | "tie";
  rationale: string;
};

export type CoachHybridCaseResult = {
  caseId: string;
  goldSpecificity: CoachIdeaSpecificity;
  classifier: CoachIdeaSpecificityResult;
  hybridSkippedStrategy: boolean;
  assignment: Record<CoachHybridBlindId, CoachHybridPathId>;
  judgment: CoachHybridJudgment;
  constraintViolations: Record<CoachHybridPathId, string[]>;
  latencyMs: Record<CoachHybridPathId, number>;
};

export type CoachHybridCategoryStats = {
  cases: number;
  newWins: number;
  hybridWins: number;
  oldWins: number;
  ties: number;
  newVsHybrid: { newWins: number; hybridWins: number; ties: number };
  averages: Record<CoachHybridPathId, CoachHybridScores>;
  violationCases: Record<CoachHybridPathId, number>;
  averageLatencyMs: Record<CoachHybridPathId, number>;
};

export type CoachHybridSummary = {
  cases: number;
  goldCounts: Record<CoachIdeaSpecificity, number>;
  classifierCounts: Record<CoachIdeaSpecificity, number>;
  falsePositives: Array<{ caseId: string; gold: CoachIdeaSpecificity; predicted: CoachIdeaSpecificity }>;
  falseNegatives: Array<{ caseId: string; gold: CoachIdeaSpecificity; predicted: CoachIdeaSpecificity }>;
  byGold: Record<CoachIdeaSpecificity, CoachHybridCategoryStats>;
  latency: {
    vague: { currentNewMs: number; hybridMs: number };
    moderately_specific: { currentNewMs: number; hybridMs: number };
    highly_specific: {
      currentNewMs: number;
      hybridDirectMs: number;
      secondsSaved: number;
      percentSaved: number;
    };
  };
};

const SCORE_KEYS: Array<keyof CoachHybridScores> = [
  "intentFidelity",
  "hookStrength",
  "originality",
  "clarity",
  "naturalness",
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

function parseCandidate(value: unknown): CoachHybridCandidateJudgment | null {
  const record = asRecord(value);
  const rawScores = asRecord(record?.scores);
  if (!record || !rawScores) return null;

  const scores = {} as CoachHybridScores;
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

export function buildBlindCoachHybridJudgePrompt(args: {
  rawIdea: string;
  niche: string;
  targetAudience: string;
  goldSpecificity: CoachIdeaSpecificity;
  candidateX: string;
  candidateY: string;
  candidateZ: string;
}): string {
  const weighting =
    args.goldSpecificity === "highly_specific"
      ? "This request already supplies creative direction. Weight intent fidelity and exact obedience above creative novelty. Do not reward a cleverer angle if it drifts from the brief."
      : args.goldSpecificity === "vague"
        ? "This request is vague. Originality and strategic development matter more than literal restatement."
        : "This request has a clear topic or stance but is not a complete brief. Reward useful development that still obeys the stated claim.";

  return `You are a blind evaluator of three short-form Reel scripts produced for the same creator request. You do not know which system produced any candidate.

Judge only how well each script serves the creator request and audience. Do not reward a script merely for being longer, more polished, or more dramatic. Penalize any candidate that changes the creator's topic, violates an explicit exclusion, invents unsupported facts, or ignores a requested framing.

${weighting}

CREATOR REQUEST
<<<${args.rawIdea.trim()}>>>

CREATOR PROFILE
Niche: ${args.niche}
Target audience: ${args.targetAudience}

CANDIDATE X
<<<${args.candidateX.trim()}>>>

CANDIDATE Y
<<<${args.candidateY.trim()}>>>

CANDIDATE Z
<<<${args.candidateZ.trim()}>>>

Score EACH candidate from 1-10 on:
- intentFidelity: preserves the creator's actual topic, goal, constraints, and exclusions
- hookStrength: creates immediate curiosity/tension without cheap clickbait
- originality: feels specific and non-generic rather than obvious AI copy
- clarity: a cold viewer can quickly understand and follow it
- naturalness: sounds human and speakable rather than stiff or templated
- overall: holistic quality, with intent fidelity as a hard gate

List concrete intent violations only when a candidate actually changes or contradicts an explicit creator instruction. Otherwise return an empty list.

Return JSON only:
{
  "candidates": {
    "X": {
      "scores": { "intentFidelity": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "overall": 1 },
      "intentViolations": []
    },
    "Y": {
      "scores": { "intentFidelity": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "overall": 1 },
      "intentViolations": []
    },
    "Z": {
      "scores": { "intentFidelity": 1, "hookStrength": 1, "originality": 1, "clarity": 1, "naturalness": 1, "overall": 1 },
      "intentViolations": []
    }
  },
  "winner": "X | Y | Z | tie",
  "rationale": "brief evidence-based comparison"
}`;
}

export function parseCoachHybridJudgment(value: unknown): CoachHybridJudgment | null {
  const root = asRecord(value);
  const candidates = asRecord(root?.candidates);
  if (!root || !candidates) return null;

  const candidateX = parseCandidate(candidates.X);
  const candidateY = parseCandidate(candidates.Y);
  const candidateZ = parseCandidate(candidates.Z);
  if (!candidateX || !candidateY || !candidateZ) return null;

  const winnerRaw = typeof root.winner === "string" ? root.winner.trim().toUpperCase() : "";
  const winner =
    winnerRaw === "X" || winnerRaw === "Y" || winnerRaw === "Z" || winnerRaw === "TIE"
      ? winnerRaw === "TIE"
        ? "tie"
        : winnerRaw
      : null;
  const rationale = typeof root.rationale === "string" ? root.rationale.trim() : "";
  if (!winner || !rationale) return null;

  return {
    candidates: { X: candidateX, Y: candidateY, Z: candidateZ },
    winner,
    rationale,
  };
}

function emptyScores(): CoachHybridScores {
  return {
    intentFidelity: 0,
    hookStrength: 0,
    originality: 0,
    clarity: 0,
    naturalness: 0,
    overall: 0,
  };
}

function averageScores(list: CoachHybridScores[]): CoachHybridScores {
  if (list.length === 0) return emptyScores();
  const totals = emptyScores();
  for (const scores of list) {
    for (const key of SCORE_KEYS) totals[key] += scores[key];
  }
  for (const key of SCORE_KEYS) totals[key] = Math.round((totals[key] / list.length) * 100) / 100;
  return totals;
}

function emptyCategoryStats(): CoachHybridCategoryStats {
  return {
    cases: 0,
    newWins: 0,
    hybridWins: 0,
    oldWins: 0,
    ties: 0,
    newVsHybrid: { newWins: 0, hybridWins: 0, ties: 0 },
    averages: {
      old_direct: emptyScores(),
      current_new: emptyScores(),
      hybrid: emptyScores(),
    },
    violationCases: { old_direct: 0, current_new: 0, hybrid: 0 },
    averageLatencyMs: { old_direct: 0, current_new: 0, hybrid: 0 },
  };
}

function invertAssignment(
  assignment: Record<CoachHybridBlindId, CoachHybridPathId>
): Record<CoachHybridPathId, CoachHybridBlindId> {
  return {
    old_direct: assignment.X === "old_direct" ? "X" : assignment.Y === "old_direct" ? "Y" : "Z",
    current_new: assignment.X === "current_new" ? "X" : assignment.Y === "current_new" ? "Y" : "Z",
    hybrid: assignment.X === "hybrid" ? "X" : assignment.Y === "hybrid" ? "Y" : "Z",
  };
}

function pairwiseFromOverall(
  newOverall: number,
  hybridOverall: number
): "current_new" | "hybrid" | "tie" {
  const delta = newOverall - hybridOverall;
  if (Math.abs(delta) < 0.3) return "tie";
  return delta > 0 ? "current_new" : "hybrid";
}

function averageLatency(results: CoachHybridCaseResult[], path: CoachHybridPathId): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, result) => sum + (result.latencyMs[path] ?? 0), 0);
  return Math.round(total / results.length);
}

function statsFor(results: CoachHybridCaseResult[]): CoachHybridCategoryStats {
  const stats = emptyCategoryStats();
  stats.cases = results.length;
  const scoreBags: Record<CoachHybridPathId, CoachHybridScores[]> = {
    old_direct: [],
    current_new: [],
    hybrid: [],
  };
  const latencyBags: Record<CoachHybridPathId, number[]> = {
    old_direct: [],
    current_new: [],
    hybrid: [],
  };

  for (const result of results) {
    const byPath = invertAssignment(result.assignment);
    const newJudgment = result.judgment.candidates[byPath.current_new];
    const hybridJudgment = result.judgment.candidates[byPath.hybrid];
    const oldJudgment = result.judgment.candidates[byPath.old_direct];

    scoreBags.current_new.push(newJudgment.scores);
    scoreBags.hybrid.push(hybridJudgment.scores);
    scoreBags.old_direct.push(oldJudgment.scores);

    latencyBags.current_new.push(result.latencyMs.current_new);
    latencyBags.hybrid.push(result.latencyMs.hybrid);
    latencyBags.old_direct.push(result.latencyMs.old_direct);

    if (result.judgment.winner === "tie") {
      stats.ties += 1;
    } else if (result.assignment[result.judgment.winner] === "current_new") {
      stats.newWins += 1;
    } else if (result.assignment[result.judgment.winner] === "hybrid") {
      stats.hybridWins += 1;
    } else {
      stats.oldWins += 1;
    }

    const pair = pairwiseFromOverall(newJudgment.scores.overall, hybridJudgment.scores.overall);
    if (pair === "current_new") stats.newVsHybrid.newWins += 1;
    else if (pair === "hybrid") stats.newVsHybrid.hybridWins += 1;
    else stats.newVsHybrid.ties += 1;

    if (result.constraintViolations.current_new.length > 0 || newJudgment.intentViolations.length > 0) {
      stats.violationCases.current_new += 1;
    }
    if (result.constraintViolations.hybrid.length > 0 || hybridJudgment.intentViolations.length > 0) {
      stats.violationCases.hybrid += 1;
    }
    if (result.constraintViolations.old_direct.length > 0 || oldJudgment.intentViolations.length > 0) {
      stats.violationCases.old_direct += 1;
    }
  }

  stats.averages.current_new = averageScores(scoreBags.current_new);
  stats.averages.hybrid = averageScores(scoreBags.hybrid);
  stats.averages.old_direct = averageScores(scoreBags.old_direct);
  stats.averageLatencyMs.current_new = averageLatency(results, "current_new");
  stats.averageLatencyMs.hybrid = averageLatency(results, "hybrid");
  stats.averageLatencyMs.old_direct = averageLatency(results, "old_direct");
  return stats;
}

export function summarizeCoachHybridBenchmark(results: CoachHybridCaseResult[]): CoachHybridSummary {
  const goldCounts: Record<CoachIdeaSpecificity, number> = {
    vague: 0,
    moderately_specific: 0,
    highly_specific: 0,
  };
  const classifierCounts: Record<CoachIdeaSpecificity, number> = {
    vague: 0,
    moderately_specific: 0,
    highly_specific: 0,
  };
  const falsePositives: CoachHybridSummary["falsePositives"] = [];
  const falseNegatives: CoachHybridSummary["falseNegatives"] = [];

  for (const result of results) {
    goldCounts[result.goldSpecificity] += 1;
    classifierCounts[result.classifier.classification] += 1;
    if (
      result.classifier.classification === "highly_specific" &&
      result.goldSpecificity !== "highly_specific"
    ) {
      falsePositives.push({
        caseId: result.caseId,
        gold: result.goldSpecificity,
        predicted: result.classifier.classification,
      });
    }
    if (
      result.goldSpecificity === "highly_specific" &&
      result.classifier.classification !== "highly_specific"
    ) {
      falseNegatives.push({
        caseId: result.caseId,
        gold: result.goldSpecificity,
        predicted: result.classifier.classification,
      });
    }
  }

  const vague = results.filter((result) => result.goldSpecificity === "vague");
  const moderate = results.filter((result) => result.goldSpecificity === "moderately_specific");
  const specific = results.filter((result) => result.goldSpecificity === "highly_specific");
  const specificStats = statsFor(specific);
  const secondsSaved =
    Math.round(((specificStats.averageLatencyMs.current_new - specificStats.averageLatencyMs.hybrid) / 1000) * 10) /
    10;
  const percentSaved = specificStats.averageLatencyMs.current_new
    ? Math.round((secondsSaved / (specificStats.averageLatencyMs.current_new / 1000)) * 1000) / 10
    : 0;

  return {
    cases: results.length,
    goldCounts,
    classifierCounts,
    falsePositives,
    falseNegatives,
    byGold: {
      vague: statsFor(vague),
      moderately_specific: statsFor(moderate),
      highly_specific: specificStats,
    },
    latency: {
      vague: {
        currentNewMs: statsFor(vague).averageLatencyMs.current_new,
        hybridMs: statsFor(vague).averageLatencyMs.hybrid,
      },
      moderately_specific: {
        currentNewMs: statsFor(moderate).averageLatencyMs.current_new,
        hybridMs: statsFor(moderate).averageLatencyMs.hybrid,
      },
      highly_specific: {
        currentNewMs: specificStats.averageLatencyMs.current_new,
        hybridDirectMs: specificStats.averageLatencyMs.hybrid,
        secondsSaved,
        percentSaved,
      },
    },
  };
}

export function rotateHybridAssignment(index: number): Record<CoachHybridBlindId, CoachHybridPathId> {
  const rotations: Array<Record<CoachHybridBlindId, CoachHybridPathId>> = [
    { X: "old_direct", Y: "current_new", Z: "hybrid" },
    { X: "current_new", Y: "hybrid", Z: "old_direct" },
    { X: "hybrid", Y: "old_direct", Z: "current_new" },
    { X: "old_direct", Y: "hybrid", Z: "current_new" },
    { X: "hybrid", Y: "current_new", Z: "old_direct" },
    { X: "current_new", Y: "old_direct", Z: "hybrid" },
  ];
  return rotations[index % rotations.length];
}
