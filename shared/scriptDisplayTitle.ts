const GENERIC_SCRIPT_TITLES = [
  /^remake script$/i,
  /^ai script$/i,
  /^generated script$/i,
  /^untitled script$/i,
  /^remake:\s*/i,
];

const SKIP_OPENERS = new Set([
  "picture this",
  "imagine this",
  "here's the thing",
  "heres the thing",
  "let me tell you something",
]);

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function isGenericScriptTitle(title: string | null | undefined): boolean {
  const value = String(title ?? "").trim();
  if (!value) return true;
  return GENERIC_SCRIPT_TITLES.some((pattern) => pattern.test(value));
}

function cleanCandidate(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/^[“”"']+|[“”"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word, index) => {
      const bare = word.replace(/[^A-Za-z0-9'-]/g, "");
      if (!bare) return word;
      const lower = bare.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return word.replace(bare, lower);
      const cased = lower.charAt(0).toUpperCase() + lower.slice(1);
      return word.replace(bare, cased);
    })
    .join(" ")
    .replace(/[.!?]+$/g, "");
}

export function deriveScriptTitleFromContent(content: string): string {
  const normalized = String(content ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "Untitled script";

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map(cleanCandidate)
    .filter(Boolean);

  let candidate = sentences.find((sentence) => {
    const normalizedSentence = sentence.toLowerCase().replace(/[.!?]+$/g, "").trim();
    const words = normalizedSentence.split(/\s+/).filter(Boolean);
    return words.length >= 4 && !SKIP_OPENERS.has(normalizedSentence);
  });

  if (!candidate) candidate = cleanCandidate(normalized);

  const words = candidate.split(/\s+/).filter(Boolean);
  const limited = words.slice(0, 10).join(" ");
  return titleCase(limited) || "Untitled script";
}

export function scriptDisplayTitle(
  title: string | null | undefined,
  content: string
): string {
  const current = String(title ?? "").trim();
  if (!isGenericScriptTitle(current)) return current;
  return deriveScriptTitleFromContent(content);
}
