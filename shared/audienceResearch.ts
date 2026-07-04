import type { ReelNiche } from "./reelNiches";

export type AudienceSignalSource = "reddit" | "quora" | "web";

export type AudienceSignalRecord = {
  id?: number;
  source: AudienceSignalSource;
  title: string;
  snippet: string | null;
  sourceUrl: string;
  score: number;
  fetchedAt?: Date | string;
};

/** Subreddits to scan per onboarding niche slug. */
export const NICHE_SUBREDDITS: Record<ReelNiche, string[]> = {
  real_estate: ["realestateinvesting", "RealEstate", "FirstTimeHomeBuyer", "realtors"],
  fitness: ["fitness", "xxfitness", "bodyweightfitness", "loseit"],
  food: ["Cooking", "MealPrepSunday", "recipes", "AskCulinary"],
  beauty: ["BeautyGuruChatter", "SkincareAddiction", "MakeupAddiction", "HaircareScience"],
  business: ["Entrepreneur", "smallbusiness", "startups", "marketing"],
  finance: ["personalfinance", "FinancialPlanning", "investing", "Fire"],
  marketing: ["marketing", "socialmedia", "digital_marketing", "content_marketing"],
  parenting: ["Parenting", "Mommit", "daddit", "NewParents"],
  travel: ["travel", "solotravel", "backpacking", "TravelHacks"],
  fashion: ["femalefashionadvice", "malefashionadvice", "streetwearstartup", "fashion"],
  tech: ["technology", "programming", "SaaS", "EntrepreneurRideAlong"],
  education: ["Teachers", "GetStudying", "OnlineEducation", "college"],
  lifestyle: ["selfimprovement", "productivity", "getdisciplined", "DecidingToBeBetter"],
  spirituality: ["spirituality", "Meditation", "Mindfulness", "awakened"],
  hospitality: ["KitchenConfidential", "restaurateur", "barowners", "hotels"],
};

export const AUDIENCE_SIGNAL_CACHE_DAYS = 7;

export function looksLikeAudienceQuestion(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;
  if (t.includes("?")) return true;
  return /^(how|why|what|when|where|should|can|is|are|does|do|anyone|help)\b/.test(t);
}

export function buildRedditSearchQuery(nicheLabel: string, targetAudience: string): string {
  const audienceHint = targetAudience.trim().slice(0, 80);
  return `${nicheLabel} ${audienceHint}`.trim();
}

export function formatAudienceSignalsForPrompt(signals: AudienceSignalRecord[]): string {
  if (!signals.length) return "";

  const lines = signals.slice(0, 12).map((signal, index) => {
    const sourceLabel =
      signal.source === "reddit" ? "Reddit" : signal.source === "quora" ? "Quora" : "Web";
    const snippet = signal.snippet?.trim()
      ? ` — ${signal.snippet.trim().slice(0, 220)}`
      : "";
    return `${index + 1}. [${sourceLabel}] "${signal.title}"${snippet}\n   Source: ${signal.sourceUrl}`;
  });

  return `\nReal audience questions and discussions from Reddit and the web (ground researchSignal in these when relevant — mention the platform and thread, not generic trends):\n${lines.join("\n")}\n`;
}

export function rankAudienceSignals(signals: AudienceSignalRecord[]): AudienceSignalRecord[] {
  const byUrl = new Map<string, AudienceSignalRecord>();
  for (const signal of signals) {
    const key = signal.sourceUrl.toLowerCase();
    const existing = byUrl.get(key);
    if (!existing || signal.score > existing.score) {
      byUrl.set(key, signal);
    }
  }

  return Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

export function audienceSourceLabel(source: AudienceSignalSource): string {
  if (source === "reddit") return "Reddit";
  if (source === "quora") return "Quora";
  return "Web";
}
