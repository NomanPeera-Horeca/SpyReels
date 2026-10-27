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

function topicTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * True when the suggestion copies a stretch of the creator's own bio or
 * captions. A short purpose sentence that shares a few words is allowed.
 */
export function copiesSourceText(text: string, source: string): boolean {
  const words = topicTokens(text);
  const src = topicTokens(source).join(" ");
  if (words.length < 8 || src.length < 40) return false;
  for (let i = 0; i + 6 <= words.length; i++) {
    if (src.includes(words.slice(i, i + 6).join(" "))) return true;
  }
  return false;
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

/** A confirmed goal that already states an offer may justify a commercial audience. */
export function commercialIntentAllowed(goal: string, commercialSignals: boolean): boolean {
  return commercialSignals || COMMERCIAL_CLAIM.test(goal);
}

/** Affiliate and product-recommendation language. Not a business the creator runs. */
const MONETIZATION_ASSUMPTION =
  /\b(shoppers?|affiliates?|product spotlights?|link in bio|my picks|monetiz\w*)\b/i;

export function inventsMonetization(text: string, allowed: boolean): boolean {
  return MONETIZATION_ASSUMPTION.test(text) && !allowed;
}

/** Viewer buckets that do not name the creator's subject. */
const GENERIC_AUDIENCE =
  /^(people|users|viewers|fans|followers|everyone|anybody|anyone)$|\b(scroll viewers?|social media browsers?|short-form(?: video)? (?:fans|viewers|enthusiasts)|content viewers|casual browsers)\b/i;

export function isGenericAudience(who: string): boolean {
  return GENERIC_AUDIENCE.test(who.trim());
}

const GENERIC_PILLAR_WORD = new Set([
  "daily",
  "life",
  "content",
  "moments",
  "tips",
  "ideas",
  "lifestyle",
  "vlog",
  "vlogs",
  "updates",
  "stuff",
  "things",
]);

/** A pillar title made only of generic words, with no subject. */
export function isGenericPillarTitle(title: string): boolean {
  const words = title
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every(word => GENERIC_PILLAR_WORD.has(word));
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
  // "kids" and "children" name the same family role. Explicit mention of one
  // supports the other, but never licenses invented ages or demographics.
  const childrenInEvidence = /\b(?:kids|children|child)\b/i.test(corpus);
  return (text.match(DEMOGRAPHIC) ?? []).filter(t => {
    if (/^(?:kids|children)$/i.test(t) && childrenInEvidence) return false;
    return !corpus.includes(t.toLowerCase());
  });
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
