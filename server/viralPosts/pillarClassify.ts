import { DEFAULT_CONTENT_PILLARS } from "./constants";

export type PillarClassification = {
  primaryPillar: string;
  secondaryPillar: string | null;
  confidence: number;
  reason: string;
};

const PILLAR_KEYWORDS: Record<string, string[]> = {
  "restaurant profitability": [
    "profit",
    "margin",
    "food cost",
    "cogs",
    "revenue",
    "cash flow",
    "break even",
    "unit economics",
  ],
  "menu engineering": [
    "menu",
    "pricing",
    "dish",
    "recipe",
    "plate",
    "specials",
    "upsell",
    "engineering",
  ],
  "restaurant operations": [
    "operations",
    "ops",
    "staff",
    "hiring",
    "training",
    "shift",
    "sop",
    "systems",
    "service",
  ],
  "kitchen buildouts": [
    "kitchen",
    "buildout",
    "equipment",
    "lease",
    "construction",
    "build out",
    "fit out",
  ],
  "restaurant marketing": [
    "marketing",
    "instagram",
    "tiktok",
    "ads",
    "content",
    "brand",
    "followers",
    "reach",
    "viral",
  ],
  "hospitality leadership": [
    "leadership",
    "owner",
    "founder",
    "manager",
    "culture",
    "mindset",
    "team",
    "ceo",
  ],
};

function scorePillar(text: string, pillar: string): number {
  const keys = PILLAR_KEYWORDS[pillar] || [pillar.toLowerCase()];
  let hits = 0;
  for (const k of keys) {
    if (text.includes(k)) hits += 1;
  }
  return hits;
}

/**
 * Classify a candidate caption/hook against active user pillars.
 * Deterministic heuristic (no provider calls).
 */
export function classifyCandidatePillars(args: {
  caption?: string | null;
  hook?: string | null;
  hashtags?: string[];
  activePillars?: string[];
  fallbackNiche?: string | null;
}): PillarClassification {
  const active =
    args.activePillars && args.activePillars.length > 0
      ? args.activePillars
      : [...DEFAULT_CONTENT_PILLARS];
  const text = [
    args.caption || "",
    args.hook || "",
    ...(args.hashtags || []),
  ]
    .join(" ")
    .toLowerCase();

  const scored = active
    .map((pillar) => ({
      pillar,
      score: scorePillar(text, pillar),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.pillar.localeCompare(b.pillar);
    });

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score === 0) {
    const fallback =
      active[0] ||
      args.fallbackNiche?.trim() ||
      DEFAULT_CONTENT_PILLARS[0];
    return {
      primaryPillar: fallback,
      secondaryPillar: null,
      confidence: 0.35,
      reason: "No strong pillar keywords; assigned default active pillar",
    };
  }

  const confidence = Math.min(0.95, 0.45 + top.score * 0.12);
  return {
    primaryPillar: top.pillar,
    secondaryPillar:
      second && second.score > 0 && second.score >= top.score - 1
        ? second.pillar
        : null,
    confidence,
    reason: `Matched ${top.score} keyword signal(s) for ${top.pillar}`,
  };
}

/**
 * Prefer multi-pillar coverage without sacrificing top score too much.
 */
export function diversifyByPillar<T extends { contentPillar: string | null; finalScore: number }>(
  ranked: T[],
  opts?: { max?: number; minPillars?: number }
): T[] {
  const max = opts?.max ?? 7;
  const minPillars = opts?.minPillars ?? 2;
  if (ranked.length <= 1) return ranked.slice(0, max);

  const selected: T[] = [];
  const pillars = new Set<string>();

  for (const item of ranked) {
    if (selected.length >= max) break;
    selected.push(item);
    if (item.contentPillar) pillars.add(item.contentPillar);
  }

  if (pillars.size >= minPillars || ranked.length < 3) {
    return selected;
  }

  // Try to swap the lowest-ranked selected for a different-pillar alternative
  // when score drop is small.
  const last = selected[selected.length - 1]!;
  const alt = ranked.find(
    (c) =>
      c.contentPillar &&
      !pillars.has(c.contentPillar) &&
      !selected.includes(c) &&
      c.finalScore >= last.finalScore * 0.85
  );
  if (alt) {
    selected[selected.length - 1] = alt;
  }
  return selected;
}
