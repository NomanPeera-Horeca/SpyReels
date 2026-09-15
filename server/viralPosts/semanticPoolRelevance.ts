import Anthropic from "@anthropic-ai/sdk";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";
import type { AdaptedCandidate } from "./candidateAdapter";
import { DEFAULT_CONTENT_PILLARS } from "./constants";

export const SEMANTIC_POOL_MODEL = "claude-haiku-4-5-20251001";
export const MIN_SEMANTIC_POOL_CONFIDENCE = 0.55;
const SEMANTIC_BATCH_SIZE = 12;

const ACTIVE_PILLARS = new Set<string>(DEFAULT_CONTENT_PILLARS);

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

export const SEMANTIC_POOL_PROMPT = `You classify already-viral short-form videos for SpyReels restaurant and hospitality business inspiration pools. Videos may be Instagram Reels, TikTok videos, or YouTube Shorts.

Your job is semantic relevance, not virality. Decide what the video is actually ABOUT and whether a restaurant or hospitality OPERATOR could use the business idea.

Return ONLY valid JSON in this exact shape:
{
  "reels": [
    {
      "sourceId": "AbC123",
      "domainRelevant": true,
      "primaryPillar": "restaurant operations",
      "secondaryPillar": null,
      "confidence": 0.88,
      "reason": "About staff training and shift systems"
    }
  ]
}

Allowed pillars, exact strings only:
- restaurant profitability
- menu engineering
- restaurant operations
- kitchen buildouts
- restaurant marketing
- hospitality leadership

RULES:
1. Judge the meaning of the video, not isolated keyword matches. Do not treat platform, format, or hashtags as a substitute for the actual lesson.
2. domainRelevant=true only when the content is useful to a restaurant/hospitality operator as BUSINESS, MANAGEMENT, GROWTH, MARKETING, MENU, KITCHEN, EQUIPMENT, PROFITABILITY, or LEADERSHIP inspiration.
2a. INSTAGRAM TRANSFERABILITY RULE: For Instagram Reels, do NOT require the creator, caption, or setting to explicitly say restaurant or hospitality. If the Reel teaches a concrete business action that a restaurant or cafe operator can directly apply, mark domainRelevant=true and map it to the best pillar. Examples include local advertising, customer acquisition, opening a location, pricing, promotions, menu demand, service standards, staff or team systems, owner management, unit economics, retention, or operational growth. Keep generic motivation, vague entrepreneurship, lifestyle, and non-actionable business commentary domainRelevant=false.
3. Recipe tutorials, cooking demonstrations, food porn, dish preparation, restaurant reviews, consumer food content, and entertainment are NOT business/operator content by themselves. Mark them domainRelevant=false unless the actual angle explicitly teaches an operator decision or lesson such as economics, menu strategy, workflow, equipment selection, equipment capacity, equipment cost, staffing, systems, marketing, throughput, or another business decision. Merely showing or using commercial equipment while making food is NOT enough.
4. QSR/franchise/restaurant market opportunities, unit economics, margins, revenue models, pricing economics, expansion economics, and business opportunities normally map to restaurant profitability.
5. Menu pricing, food cost decisions, menu design, upselling, item mix, specials strategy, and menu optimization map to menu engineering. A recipe alone does not.
6. Staff, hiring, training, scheduling, SOPs, service systems, workflows, inventory operations, manager systems, and execution map to restaurant operations.
7. Equipment, refrigeration, hoods, leases, fit-outs, construction, kitchen layout, and buildout decisions map to kitchen buildouts ONLY when the video teaches an operator-facing decision or lesson such as choosing/sizing equipment, capacity, throughput, labor savings, installation, utilities, layout, procurement, cost, or workflow design. A cooking demo that simply happens to use equipment is not kitchen buildouts.
8. Ads, content, promotions, loyalty, customer acquisition, positioning, social media, and restaurant brand growth map to restaurant marketing.
9. Owner/founder leadership, culture, management philosophy, team leadership, and hospitality leadership map to hospitality leadership.
10. Hotel/hospitality content can be domainRelevant when the underlying operator lesson transfers to hospitality businesses. Do not label generic hotel promotion or inspirational guest-service copy as restaurant operations unless the video actually teaches an operational system or practice.
11. Unrelated education, universities, general entrepreneurship, unrelated trades, lifestyle, motivation, and generic founder content are domainRelevant=false unless the specific lesson clearly applies to restaurant/hospitality operators.
12. primaryPillar must be the single best allowed pillar when domainRelevant=true. secondaryPillar is optional metadata only and should be used only for a genuinely strong second fit. The primary pillar is the video's canonical pool. Do not use secondaryPillar merely to make the video eligible for another pool.
13. confidence is 0 to 1 and measures semantic confidence in the pillar assignment, not virality or production quality.
14. If domainRelevant=false, primaryPillar and secondaryPillar must be null.
15. Preserve the exact sourceId values supplied. Return exactly one entry per input candidate.
16. Do not use em dashes.
17. Return ONLY the JSON object, no preamble or code fences.`;

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

function validPillar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return ACTIVE_PILLARS.has(clean) ? clean : null;
}

export function normalizeSemanticPoolVerdict(row: unknown): SemanticPoolVerdict | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  const sourceId = String(raw.sourceId ?? "").trim();
  if (!sourceId) return null;

  const domainRelevant = raw.domainRelevant === true;
  const confidenceRaw = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;
  const primaryPillar = domainRelevant ? validPillar(raw.primaryPillar) : null;
  const secondaryPillar = domainRelevant ? validPillar(raw.secondaryPillar) : null;
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
    system: SEMANTIC_POOL_PROMPT,
    messages: [
      {
        role: "user",
        content: `Broad niche: ${niche}\n\nAlready-viral short-form videos to classify:\n${candidateLines}\n\nReturn semantic classification JSON for every sourceId.`,
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
    .map(normalizeSemanticPoolVerdict)
    .filter((row): row is SemanticPoolVerdict => row !== null);
}

/**
 * Semantic classification runs only after strict virality has already reduced
 * provider results to a small set. It uses the same Anthropic/Haiku environment
 * as the existing discovery relevance judge and does not make ScrapeCreators calls.
 */
export async function classifySemanticPoolRelevance(args: {
  niche: string;
  candidates: AdaptedCandidate[];
}): Promise<SemanticPoolClassificationResult> {
  if (args.candidates.length === 0) return { verdicts: [], haikuCalls: 0 };
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not configured for semantic pool relevance");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const verdicts: SemanticPoolVerdict[] = [];
  let haikuCalls = 0;
  for (const batch of chunkArray(args.candidates, SEMANTIC_BATCH_SIZE)) {
    const batchVerdicts = await classifyBatch(client, args.niche, batch);
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
      relevanceLabel: "Semantic restaurant fit",
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
