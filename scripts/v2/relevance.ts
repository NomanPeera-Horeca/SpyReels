export type RelevanceLabel = "relevant" | "plausible" | "disputed" | "irrelevant";

const STOP = new Set(
  "a an and are as at be by for from how i in is it my of on or that the this to what why with you your vs".split(" ")
);

/** Lowercase tokens: hashtags and camelCase split, punctuation dropped, plurals folded. Pure; exported for tests. */
export function normalizeTokens(text: string): string[] {
  return text
    .replace(/#/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(w => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** A term as tokens plus its joined form ("brain rot" -> "brainrot"). Pure; exported for tests. */
export function termForms(term: string): { tokens: string[]; joined: string } {
  const tokens = normalizeTokens(term);
  return { tokens, joined: tokens.join("") };
}

/**
 * True when the phrase contains the term: all of the term's tokens appear in
 * the phrase, or the term's joined form appears inside the phrase's joined
 * form or one of its tokens (hashtags like "brainrotmemes"). Pure; exported for tests.
 */
export function phraseHasTerm(phrase: string, term: string): boolean {
  const t = termForms(term);
  if (t.tokens.length === 0) return false;
  const p = normalizeTokens(phrase);
  const pset = new Set(p);
  if (t.tokens.every(w => pset.has(w))) return true;
  if (t.joined.length < 4) return false;
  return p.join("").includes(t.joined) || p.some(w => w.includes(t.joined));
}

/** Label one phrase from topic terms, an optional AI label and its provenance. Pure; exported for tests. */
export function classifyRelevance(args: {
  phrase: string;
  terms: string[];
  aiLabel?: RelevanceLabel | null;
  /** The phrase is a hashtag of this topic's own viral videos. */
  fromTopicVideos?: boolean;
}): RelevanceLabel {
  if (args.terms.some(term => phraseHasTerm(args.phrase, term))) return "relevant";
  if (args.aiLabel === "irrelevant") return args.fromTopicVideos ? "disputed" : "irrelevant";
  if (args.aiLabel === "relevant") return "relevant";
  return "plausible";
}

/**
 * Terms for a topic: its label, adjacent word pairs of the label ("home
 * buying tips" -> "home buying", "buying tip"), single words only for short
 * labels (1-2 content words, not generic), and stored aliases/concepts. Lone
 * words of long labels ("buying") are left to the aliases, so "buying a car"
 * does not match home buying. Pure; exported for tests.
 */
export function topicTerms(label: string, stored: string[]): string[] {
  const words = normalizeTokens(label);
  const pairs = words
    .slice(1)
    .map((w, i) => [words[i], w])
    .filter(pair => pair.every(w => !GENERIC.has(w)))
    .map(pair => pair.join(" "));
  const singles = words.length <= 2 ? words.filter(w => !GENERIC.has(w)) : [];
  return [...new Set([label, ...pairs, ...singles, ...stored].map(t => t.trim().toLowerCase()).filter(Boolean))];
}

/** Words too generic to count as a topic on their own. */
const GENERIC = new Set(["tip", "idea", "content", "trend", "video", "guide", "hack", "basic", "strategy", "strategie", "best", "how", "life"]);


type AiResult = { aliases: string[]; labels: Map<number, RelevanceLabel> };

/** Parse the AI answer {"aliases":[...], "labels":{"1":"R"|"P"|"I"}}. Pure; exported for tests. */
export function parseRelevanceAnswer(text: string): AiResult {
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { aliases?: unknown; labels?: unknown };
    const aliases = Array.isArray(parsed.aliases)
      ? parsed.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 1 && a.length <= 60).slice(0, 25)
      : [];
    const labels = new Map<number, RelevanceLabel>();
    if (parsed.labels && typeof parsed.labels === "object") {
      for (const [k, v] of Object.entries(parsed.labels as Record<string, unknown>)) {
        const n = Number(k);
        const label = v === "R" ? "relevant" : v === "I" ? "irrelevant" : v === "P" ? "plausible" : null;
        if (Number.isInteger(n) && label) labels.set(n, label);
      }
    }
    return { aliases, labels };
  } catch {
    return { aliases: [], labels: new Map() };
  }
}

