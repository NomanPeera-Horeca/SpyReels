/**
 * Deterministic guards applied to every AI output BEFORE it can become a
 * suggestion. They catch the common ways a model invents facts about a
 * creator. When a guard fails, the output is rejected (one repair retry,
 * then a clear failure or a clarification), never silently stored.
 */

/** Em dash and en dash, written as escapes so source files never contain them. */
const DASHES = new RegExp("\\s*[\\u2014\\u2013]\\s*", "g");

/** Product copy rule (server/utils/aiFormattingRules.ts): no em or en dashes. */
export function sanitizeCopy(text: string): string {
  return text
    .replace(DASHES, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/** Numbers in the output must already appear in the evidence (no invented stats). */
export function unsupportedNumbers(text: string, corpus: string): string[] {
  return (text.match(/\d[\d,.]*%?/g) ?? []).filter(
    n => !corpus.includes(n.replace(/%$/, "").toLowerCase())
  );
}

const ALLOWED_CAPITALIZED = new Set([
  "i",
  "ai",
  "instagram",
  "tiktok",
  "youtube",
  "reels",
  "shorts",
  "ugc",
  "diy",
  "seo",
  "faq",
  "q&a",
]);

/**
 * Capitalized words that are not the first word of a sentence and do not
 * appear in the evidence: usually invented brand, place or person names.
 */
export function unsupportedProperNouns(text: string, corpus: string): string[] {
  const out: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    words.forEach((raw, idx) => {
      const w = raw.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, "");
      if (idx === 0 || w.length < 2) return;
      if (!/^\p{Lu}/u.test(w)) return;
      if (ALLOWED_CAPITALIZED.has(w.toLowerCase())) return;
      if (!corpus.includes(w.toLowerCase())) out.push(w);
    });
  }
  return out;
}

/** Commercial goals ("get clients", "grow my business") need commercial evidence. */
const COMMERCIAL_CLAIM =
  /\b(clients?|customers?|sales|sell|selling|leads?|business|revenue|bookings?|buyers?|orders?)\b/i;
export function inventsCommercialObjective(
  text: string,
  commercialSignals: boolean
): boolean {
  return COMMERCIAL_CLAIM.test(text) && !commercialSignals;
}

/**
 * Demographic attributes (age, gender, religion, ethnicity, orientation,
 * family role) are allowed only when the evidence or confirmed answers
 * already mention them.
 */
const DEMOGRAPHIC =
  /\b(\d{2}\s*(?:-|to|\u2013)\s*\d{2}|teens?|teenagers?|men|women|male|female|moms?|mums?|mothers?|dads?|fathers?|gen ?z|millennials?|boomers?|christians?|muslims?|jewish|hindus?|black|white|asian|latinos?|latinas?|hispanic|gay|lesbian|lgbtq\+?|seniors?|elderly|kids|children|girls|boys)\b/gi;
export function unsupportedDemographics(
  text: string,
  corpus: string
): string[] {
  return (text.match(DEMOGRAPHIC) ?? []).filter(
    t => !corpus.includes(t.toLowerCase())
  );
}

/** Recommended pillars must not claim past performance. */
const PERFORMANCE_CLAIM =
  /(%|\bviral\b|\bbest[- ]performing\b|\bmost (views|viewed|popular)\b|\bperformed\b|\boutperform|\btop[- ]performing\b|\bproven\b)/i;
export function claimsPerformance(text: string): boolean {
  return PERFORMANCE_CLAIM.test(text);
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** More than one sentence = more than one terminal punctuation mark before the end. */
export function isSingleSentence(text: string): boolean {
  return (text.replace(/[.!?]+$/, "").match(/[.!?](\s|$)/g) ?? []).length === 0;
}
