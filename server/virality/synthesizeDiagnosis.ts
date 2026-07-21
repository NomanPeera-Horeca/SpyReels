import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";
import type { analyzeReelFrames } from "../services/analyzeReelFrames";

type StructuralAnalysis = Awaited<ReturnType<typeof analyzeReelFrames>>;

export type ScoredReel = {
  shortcode: string;
  viralScore: number | null;
  structuralAnalysis: StructuralAnalysis;
};

export type ViralityDiagnosis = {
  winnerPattern: string;
  loserPattern: string;
  keyGap: string;
  actionPlan: string[];
};

const MIN_SCORED_REELS = 4;

const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    winnerPattern: {
      type: "string",
      description:
        "Two to three sentences describing the structural pattern shared by the above-average reels: hook style, timing, pacing, tone.",
    },
    loserPattern: {
      type: "string",
      description:
        "Two to three sentences describing the structural pattern shared by the below-average reels.",
    },
    keyGap: {
      type: "string",
      description:
        "One to two sentences naming the single most important structural difference between the two groups, stated as something the creator can act on.",
    },
    actionPlan: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
      description:
        "Three to five specific, prioritized changes the creator should make in their next reels, ordered by expected impact.",
    },
  },
  required: ["winnerPattern", "loserPattern", "keyGap", "actionPlan"],
  additionalProperties: false,
};

function summarizeReel(reel: ScoredReel): string {
  const sa = reel.structuralAnalysis;
  if (!sa) return `${reel.shortcode}: score ${reel.viralScore}, no structural data`;
  return [
    `${reel.shortcode}`,
    `score=${reel.viralScore}`,
    `hook=${sa.hookType}@${sa.hookTimingSec}s`,
    `cuts/sec=${sa.cutsPerSecond}`,
    `tone=${sa.tone}`,
    `textOverlay=${sa.textOverlayPresent}`,
    `cta=${sa.ctaPresent}`,
  ].join(", ");
}

/**
 * Compares a user's above-average reels against their below-average reels
 * and asks Claude to explain the structural difference. Returns null if
 * there is not enough scored data to make a meaningful comparison, or if
 * every reel falls in the same bucket.
 */
export async function synthesizeViralityDiagnosis(
  reels: ScoredReel[]
): Promise<ViralityDiagnosis | null> {
  const scored = reels.filter(
    (r): r is ScoredReel & { viralScore: number } => r.viralScore !== null
  );

  if (scored.length < MIN_SCORED_REELS) return null;

  const average =
    scored.reduce((sum, r) => sum + r.viralScore, 0) / scored.length;

  const winners = scored.filter((r) => r.viralScore > average);
  const losers = scored.filter((r) => r.viralScore <= average);

  if (winners.length === 0 || losers.length === 0) return null;

  const winnerSummaries = winners.map(summarizeReel).join("\n");
  const loserSummaries = losers.map(summarizeReel).join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are comparing an Instagram creator's own reels to identify what structurally separates their better performing content from their weaker performing content. Base your answer only on the data provided, do not invent details not present in the summaries.",
        },
        {
          role: "user",
          content: `This creator's reels scored above their own average (${average.toFixed(1)}):\n${winnerSummaries}\n\nReels that scored at or below their own average:\n${loserSummaries}\n\nCompare the two groups and explain the structural pattern difference.`,
        },
      ],
      maxTokens: 1024,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "virality_diagnosis",
          strict: false,
          schema: DIAGNOSIS_SCHEMA,
        },
      },
    });

    const raw = String(response.choices[0]?.message?.content ?? "");
    return parseLlmJson<ViralityDiagnosis | null>(raw, null);
  } catch (err) {
    console.warn(
      "[synthesizeViralityDiagnosis] failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
