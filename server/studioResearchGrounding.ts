import { fetchTopicResearchFromWeb } from "./audienceResearch/fetchSignals";

export type ResearchGroundingItem = {
  title: string;
  snippet: string | null;
  sourceUrl: string;
};

const MAX_RESULTS = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  at: number;
  items: ResearchGroundingItem[];
};

const researchCache = new Map<string, CacheEntry>();

function cacheKey(idea: string, niche: string): string {
  return `${niche.trim().toLowerCase()}|${idea.trim().toLowerCase().slice(0, 300)}`;
}

/**
 * Topic research for Studio HEIT illustrate grounding.
 * Reuses Serper transport from audience-signal fetch. Empty on failure.
 */
export async function getResearchGrounding(
  idea: string,
  niche: string
): Promise<ResearchGroundingItem[]> {
  const trimmedIdea = idea.trim();
  const trimmedNiche = niche.trim() || "business";
  if (trimmedIdea.length < 8) {
    console.warn(
      `[getResearchGrounding] skipped short idea (${trimmedIdea.length} chars)`
    );
    return [];
  }

  const key = cacheKey(trimmedIdea, trimmedNiche);
  const cached = researchCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.items;
  }

  try {
    const raw = await fetchTopicResearchFromWeb({
      idea: trimmedIdea,
      nicheLabel: trimmedNiche,
    });
    const items: ResearchGroundingItem[] = raw.slice(0, MAX_RESULTS).map((row) => ({
      title: row.title,
      snippet: row.snippet,
      sourceUrl: row.sourceUrl,
    }));

    if (items.length === 0) {
      console.warn(
        `[getResearchGrounding] empty results niche="${trimmedNiche.slice(0, 60)}" idea="${trimmedIdea.slice(0, 80)}"`
      );
    }

    researchCache.set(key, { at: Date.now(), items });
    return items;
  } catch (err) {
    console.warn("[getResearchGrounding] search failed", err);
    return [];
  }
}

/** Prompt block for buildCoachPrompt; empty string when no results. */
export function formatResearchGroundingForPrompt(
  items: ResearchGroundingItem[]
): string {
  if (items.length === 0) return "";

  const lines = items.map((item, index) => {
    const snippet = item.snippet?.trim() || "(no snippet)";
    return `${index + 1}. ${item.title}\n   Fact/detail: ${snippet}\n   Source: ${item.sourceUrl}`;
  });

  return lines.join("\n");
}
