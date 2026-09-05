import type { AdaptedCandidate } from "./candidateAdapter";

const REMAKE_FRIENDLY_FORMATS = new Set([
  "list",
  "myth-vs-fact",
  "tutorial",
  "talking-head",
  "story",
]);

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizedText(candidate: Pick<AdaptedCandidate, "caption" | "hook" | "hashtags">): string {
  return [candidate.hook || "", candidate.caption || "", ...(candidate.hashtags || [])]
    .join(" ")
    .toLowerCase();
}

const RESTAURANT_DOMAIN =
  /\b(restaurant|restaurants|cafe|cafes|food|kitchen|hospitality|menu|chef|diner|bistro|catering|cogs)\b/;

const GENERIC_LEADERSHIP_WORDS = new Set([
  "founder",
  "owner",
  "team",
  "ceo",
  "mindset",
  "culture",
  "manager",
  "leadership",
]);

function hasRestaurantDomainSignal(text: string): boolean {
  return RESTAURANT_DOMAIN.test(text) || text.includes("food cost");
}

function isRestaurantFamilyPillar(pillar: string): boolean {
  return /\b(restaurant|menu|kitchen|hospitality)\b/.test(pillar);
}

/**
 * Topic/pillar relevance only. Remakeability, caption length, and format
 * belong in remakeabilityScoreForCandidate so transferable posts can still
 * rank without pretending they are an exact restaurant-topic match.
 */
export function relevanceScoreForCandidate(args: {
  candidate: Pick<AdaptedCandidate, "caption" | "hook" | "hashtags" | "contentPillar">;
  pillarConfidence?: number | null;
  activePillar?: string | null;
}): number {
  const { candidate } = args;
  const text = normalizedText(candidate);
  const pillar = (args.activePillar || candidate.contentPillar || "").toLowerCase().trim();
  const confidence = Math.max(0, Math.min(1, args.pillarConfidence ?? 0.5));
  const domainHit = hasRestaurantDomainSignal(text);

  if (isRestaurantFamilyPillar(pillar) && !domainHit) {
    return clamp100(Math.min(32, confidence * 50));
  }

  let score = 40 + confidence * 40;
  if (pillar) {
    const words = pillar.split(/\s+/).filter((word) => word.length >= 4);
    const matches = words.filter((word) => {
      if (!text.includes(word)) return false;
      if (GENERIC_LEADERSHIP_WORDS.has(word) && !domainHit) return false;
      return true;
    }).length;
    score += Math.min(20, matches * 8);
  }

  return clamp100(score);
}

/**
 * Estimate whether the underlying creative pattern is practical for a creator
 * to remake without copying production-heavy specifics.
 */
export function remakeabilityScoreForCandidate(
  candidate: Pick<AdaptedCandidate, "format" | "hook" | "caption" | "transcript">
): number {
  let score = REMAKE_FRIENDLY_FORMATS.has(candidate.format || "") ? 76 : 58;

  const hook = (candidate.hook || "").trim();
  const caption = (candidate.caption || "").trim();
  const transcript = (candidate.transcript || "").trim();

  if (hook.length >= 12 && hook.length <= 140) score += 9;
  if (caption.length >= 40) score += 5;
  if (transcript.length >= 80) score += 5;

  const text = `${hook} ${caption}`.toLowerCase();
  if (/\b(\d+\s+(tips|ways|mistakes|reasons|steps)|how to|stop doing|instead|before|after|myth|versus|vs\.?|i learned|i realized)\b/.test(text)) {
    score += 8;
  }

  return clamp100(score);
}
