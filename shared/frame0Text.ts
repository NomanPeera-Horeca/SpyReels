const LEADING_FILLER_PATTERNS = [
  /^hey\s+[^,]{1,30},\s*/i,
  /^hey[,!\s]+/i,
  /^okay[,!\s]+/i,
  /^so[,!\s]+/i,
  /^look[,!\s]+/i,
  /^listen[,!\s]+/i,
  /^picture this[:,]?\s*/i,
  /^imagine this[:,]?\s*/i,
  /^here'?s the thing[:,]?\s*/i,
  /^i think\s+/i,
  /^i just\s+/i,
  /^just\s+/i,
  /^i found (?:you\s+)?/i,
  /^found (?:you\s+)?/i,
  /^let me (?:show|tell) you\s+/i,
];

const LOW_VALUE_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "just",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

function cleanScriptOpening(script: string): string {
  const first = String(script ?? "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";

  let value = first
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip chained spoken-language setup such as
  // “Hey Leo, I think I just found you ...” without touching the actual claim.
  let changed = true;
  while (changed) {
    const before = value;
    for (const pattern of LEADING_FILLER_PATTERNS) {
      value = value.replace(pattern, "").trim();
    }
    changed = value !== before;
  }

  return value;
}

function normalizeMoneyLanguage(value: string): string {
  return value
    .replace(/\bzero\s+(?:dollars?\s+)?(?:money\s+)?down\b/gi, "$0 down")
    .replace(/\bno\s+money\s+down\b/gi, "$0 down")
    .replace(/\bzero\s+dollars?\b/gi, "$0")
    .replace(/\b([0-9]+)\s+percent\b/gi, "$1%")
    .replace(/\$\s+/g, "$");
}

function compactWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");

  const firstPass = words.filter((word, index) => {
    if (index === 0) return true;
    const bare = word.toLowerCase().replace(/[^a-z0-9$%'-]/g, "");
    return !LOW_VALUE_WORDS.has(bare);
  });

  const source = firstPass.length >= 3 ? firstPass : words;
  return source.slice(0, maxWords).join(" ");
}

function sentenceLikeOpening(value: string): string {
  const match = value.match(/^(.{1,180}?)(?:[.!?](?:\s|$)|$)/);
  return (match?.[1] ?? value).trim();
}

/**
 * Frame 0 Text Blueprint V1.
 *
 * Purpose: produce one fast-to-read on-screen overlay from the opening of a
 * short-form script. This is intentionally conservative until SpyReels has its
 * own performance dataset. It favors one idea, specificity, numbers, and
 * concise wording rather than trying to predict virality.
 */
export function deriveFrame0Text(script: string): string {
  let opening = normalizeMoneyLanguage(cleanScriptOpening(script));
  if (!opening) return "YOUR HOOK GOES HERE";

  opening = sentenceLikeOpening(opening)
    .replace(/\b(?:i think|i just|i found you|i found|let me show you|let me tell you)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const lower = opening.toLowerCase();

  // Common high-value financing pattern: keep the concrete benefit and object.
  if (/\$0\s+down/.test(lower)) {
    const objectMatch = opening.match(/\b([a-z][a-z -]{2,45}?)(?:\s+(?:with|for)\s+\$0\s+down|\s+\$0\s+down)/i);
    if (objectMatch?.[1]) {
      const object = objectMatch[1]
        .replace(/^(?:the|your|you need|some)\s+/i, "")
        .trim();
      if (object) return `${compactWords(object, 4)} WITH $0 DOWN?`.toUpperCase();
    }
  }

  const hasQuestionEnergy = /\?\s*$/.test(opening) || /^(?:why|how|what|when|where|who|can|should|does|do|is|are)\b/i.test(opening);
  let overlay = compactWords(opening, 7)
    .replace(/^[,.:;!?\s]+|[,.:;!\s]+$/g, "")
    .trim();

  if (!overlay) return "YOUR HOOK GOES HERE";

  const wordCount = overlay.split(/\s+/).filter(Boolean).length;
  if (hasQuestionEnergy && wordCount <= 7 && !overlay.endsWith("?")) overlay += "?";

  return overlay.toUpperCase();
}

export function frame0WordCount(value: string): number {
  return String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
}
