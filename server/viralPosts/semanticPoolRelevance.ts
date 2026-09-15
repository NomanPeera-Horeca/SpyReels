import Anthropic from "@anthropic-ai/sdk";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";
import type { AdaptedCandidate } from "./candidateAdapter";

export const SEMANTIC_POOL_MODEL = "claude-haiku-4-5-20251001";
export const MIN_SEMANTIC_POOL_CONFIDENCE = 0.55;
const SEMANTIC_BATCH_SIZE = 12;

export type SemanticPoolVerdict = {
  sourceId: string;
  domainRelevant: boolean;
  primaryPillar: string | null;
  secondaryPillar: string | null;
  confidence: number;
  reason: string;
};

export type SemanticPoolRejected = {
  candidate: AdaptedCandidate;
  verdict: SemanticPoolVerdict | null;
  reason: "off_domain" | "low_confidence" | "missing_verdict";
};

export type SemanticPoolReroute = {
  candidate: AdaptedCandidate;
  targetPillar: string;
  verdict: SemanticPoolVerdict;
};

export type SemanticPoolRouting = {
  currentPool: AdaptedCandidate[];
  rerouted: SemanticPoolReroute[];
  rejected: SemanticPoolRejected[];
};

export type SemanticPoolClassificationResult = {
  verdicts: SemanticPoolVerdict[];
  haikuCalls: number;
};

/**
 * Generic semantic policy. The actual user niche and active pillars are injected
 * per request by buildSemanticPoolPrompt(), so no niche is hard-coded here.
 */
export const SEMANTIC_POOL_PROMPT = `You classify already-viral short-form videos for SpyReels creator inspiration pools. Videos may be Instagram Reels, TikTok videos, or YouTube Shorts.

Your job is semantic relevance, not virality. The caller supplies the creator's current niche and active content pillars. Judge whether the video's real lesson is useful to that niche and which supplied pillar fits best.

Return ONLY valid JSON in this exact shape:
{
  "reels": [
    {
      "sourceId": "AbC123",
      "domainRelevant": true,
      "primaryPillar": "one exact supplied pillar",
      "secondaryPillar": null,
      "confidence": 0.88,
      "reason": "Short explanation of the semantic fit"
    }
  ]
}

RULES:
1. Judge the meaning of the video, not isolated keyword matches. Do not treat platform, format, hashtags, or creator category as a substitute for the actual lesson.
2. Use only the CURRENT USER NICHE and ALLOWED ACTIVE CONTENT PILLARS supplied by the caller. Never assume a default niche and never invent a pillar.
3. A video can be domainRelevant=true when it is directly about the niche OR when it teaches a concrete, transferable action that a creator or business in that niche can realistically apply. The creator, caption, and setting do not need to literally name the user's niche when the transfer is specific and practical.
4. Transferable actions can include pricing, customer acquisition, retention, content strategy, promotion, sales, monetization, hiring, training, workflow, operations, customer experience, leadership, systems, or another clear tactic, but only when the lesson genuinely maps to one of the supplied pillars.
5. Generic motivation, vague entrepreneurship, lifestyle content, entertainment, unrelated consumer content, and non-actionable commentary are domainRelevant=false unless the specific lesson clearly applies to the supplied niche and pillar.
6. Tutorials or demonstrations are not automatically relevant just because they show a product, tool, location, or activity associated with the niche. The actual lesson must support the supplied niche and pillar.
7. primaryPillar must be the single best exact value from ALLOWED ACTIVE CONTENT PILLARS when domainRelevant=true.
8. secondaryPillar is optional metadata only and may be used only for a genuinely strong second fit from the supplied pillar list. Do not use it merely to make a video eligible for another pool.
9. confidence is 0 to 1 and measures semantic confidence in the niche and pillar assignment, not virality or production quality.
10. If domainRelevant=false, primaryPillar and secondaryPillar must be null.
11. Preserve the exact sourceId values supplied. Return exactly one entry per input candidate.
12. Do not use em dashes.
13. Return ONLY the JSON object, no preamble or code fences.`;

function cleanActivePillars(activePillars: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of activePillars) {
    const clean = value.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(0, 12);
}

export function buildSemanticPoolPrompt(args: {
  niche: string;
  activePillars: string[];
}): string {
  const niche = args.niche.trim() || "General creator niche";
  const activePillars = cleanActivePillars(args.activePillars);
  if (activePillars.length === 0) {
    throw new Error("Semantic pool relevance requires at least one active pillar");
  }

  return `${SEMANTIC_POOL_PROMPT}\n\nCURRENT USER NICHE:\n${niche}\n\nALLOWED ACTIVE CONTENT PILLARS, exact strings only:\n${activePillars
    .map((pillar) => `- ${pillar}`)
    .join("\n")}`;
}

function stripCodeFences(text: string): string {
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
  }
  return trimmed.trim();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function validPillar(value: unknown, activePillars: Set<string>): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return activePillars.has(clean) ? clean : null;
}

export function normalizeSemanticPoolVerdict(
  row: unknown,
  activePillarsInput: string[]
): SemanticPoolVerdict | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  const sourceId = String(raw.sourceId ?? "").trim();
  if (!sourceId) return null;

  const activePillars = new Set(cleanActivePillars(activePillarsInput));
  const domainRelevant = raw.domainRelevant === true;
  const confidenceRaw = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;
  const primaryPillar = domainRelevant
    ? validPillar(raw.primaryPillar, activePillars)
    : null;
  const secondaryPillar = domainRelevant
    ? validPillar(raw.secondaryPillar, activePillars)
    : null;
  const reason = String(raw.reason ?? "").trim().slice(0, 300);

  return {
    sourceId,
    domainRelevant: domainRelevant && primaryPillar !== null,
    primaryPillar,
    secondaryPillar:
      secondaryPillar && secondaryPillar !== primaryPillar ? secondaryPillar : null,
    confidence,
    reason,
  };
}

async function classifyBatch(
  client: Anthropic,
  niche: string,
  activePillars: string[],
  candidates: AdaptedCandidate[]
): Promise<SemanticPoolVerdict[]> {
  const candidateLines = candidates
    .map((candidate) => {
      const caption = (candidate.caption || "").replace(/\s+/g, " ").trim().slice(0, 520);
      const hook = (candidate.hook || "").replace(/\s+/g, " ").trim().slice(0, 180);
      const platform = candidate.platform || "unknown";
      return `- sourceId: ${candidate.sourceId}\n  platform: ${platform}\n  creator: ${candidate.creatorHandle || candidate.creatorName}\n  hook: ${hook || "(none)"}\n  caption: ${caption || "(none)"}`;
    })
    .join("\n\n");

  const response = await client.messages.create({
    model: SEMANTIC_POOL_MODEL,
    max_tokens: 1800,
    temperature: 0.05,
    system: buildSemanticPoolPrompt({ niche, activePillars }),
    messages: [
      {
        role: "user",
        content: `Already-viral short-form videos to classify:\n${candidateLines}\n\nReturn semantic classification JSON for every sourceId.`,
      },
    ],
  });

  reportDirectAnthropicUsage(response, "semantic_pool_relevance");

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from semantic pool relevance model");
  }
  const parsed = JSON.parse(stripCodeFences(textBlock.text)) as { reels?: unknown[] };
  if (!Array.isArray(parsed.reels)) {
    throw new Error("Semantic pool relevance response missing reels array");
  }
  return parsed.reels
    .map((row) => normalizeSemanticPoolVerdict(row, activePillars))
    .filter((row): row is SemanticPoolVerdict => row !== null);
}

/**
 * Semantic classification runs only after strict virality has already reduced
 * provider results to a small set. It uses the same Anthropic/Haiku environment
 * as the existing discovery relevance judge and does not make ScrapeCreators calls.
 */
export async function classifySemanticPoolRelevance(args: {
  niche: string;
  activePillars: string[];
  candidates: AdaptedCandidate[];
}): Promise<SemanticPoolClassificationResult> {
  if (args.candidates.length === 0) return { verdicts: [], haikuCalls: 0 };
  const activePillars = cleanActivePillars(args.activePillars);
  if (activePillars.length === 0) {
    throw new Error("Semantic pool relevance requires at least one active pillar");
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not configured for semantic pool relevance");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const verdicts: SemanticPoolVerdict[] = [];
  let haikuCalls = 0;
  for (const batch of chunkArray(args.candidates, SEMANTIC_BATCH_SIZE)) {
    const batchVerdicts = await classifyBatch(
      client,
      args.niche,
      activePillars,
      batch
    );
    haikuCalls++;
    verdicts.push(...batchVerdicts);
  }
  return { verdicts, haikuCalls };
}

/**
 * Pure routing step so production and benchmarks use the same semantic result.
 * A Reel has one canonical recommendation pool based on its semantic primary
 * pillar. Secondary pillar is descriptive metadata only and must not make the
 * Reel count as fresh inventory in a second pool.
 */
export function routeSemanticPoolCandidates(args: {
  sourcePillar: string;
  candidates: AdaptedCandidate[];
  verdicts: SemanticPoolVerdict[];
}): SemanticPoolRouting {
  const verdictBySource = new Map(args.verdicts.map((v) => [v.sourceId, v]));
  const currentPool: AdaptedCandidate[] = [];
  const rerouted: SemanticPoolReroute[] = [];
  const rejected: SemanticPoolRejected[] = [];

  for (const candidate of args.candidates) {
    const verdict = verdictBySource.get(candidate.sourceId) ?? null;
    if (!verdict) {
      rejected.push({ candidate, verdict: null, reason: "missing_verdict" });
      continue;
    }
    if (!verdict.domainRelevant || !verdict.primaryPillar) {
      rejected.push({ candidate, verdict, reason: "off_domain" });
      continue;
    }
    if (verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE) {
      rejected.push({ candidate, verdict, reason: "low_confidence" });
      continue;
    }

    const annotated: AdaptedCandidate = {
      ...candidate,
      contentPillar: verdict.primaryPillar,
      pillarConfidence: verdict.confidence,
      relevanceLabel: "Semantic niche fit",
      relevanceReason: verdict.reason || `Semantic fit for ${verdict.primaryPillar}`,
      rawProviderPayload: {
        ...candidate.rawProviderPayload,
        semanticDomainRelevant: true,
        semanticPrimaryPillar: verdict.primaryPillar,
        semanticSecondaryPillar: verdict.secondaryPillar,
        semanticPillarConfidence: verdict.confidence,
        semanticPillarReason: verdict.reason,
        semanticPoolModel: SEMANTIC_POOL_MODEL,
      },
    };

    if (verdict.primaryPillar === args.sourcePillar) {
      currentPool.push(annotated);
      continue;
    }

    rerouted.push({
      candidate: annotated,
      targetPillar: verdict.primaryPillar,
      verdict,
    });
  }

  return { currentPool, rerouted, rejected };
}
