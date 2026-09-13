const GENERIC_TITLE_PATTERNS = [
  /^remake\s*script$/i,
  /^ai\s*script$/i,
  /^script$/i,
  /^untitled/i,
];

const INSTRUCTION_LIKE_PREFIXES = [
  "remake:",
  "make it ",
  "make this ",
  "use this ",
  "use my ",
  "tell to ",
  "write me ",
  "create me ",
];

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
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function cleanText(value: string): string {
  return value
    .replace(/[*_#>`~]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isInstructionLike(value: string): boolean {
  const lower = cleanText(value).toLowerCase();
  if (!lower) return true;
  if (GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(lower))) return true;
  if (lower === "same_topic" || lower === "personalized") return true;
  if (INSTRUCTION_LIKE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (/\b(i want|i need|please|can you|tell him|tell her|tell leo)\b/i.test(lower)) return true;
  return false;
}

function titleCase(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+'-]+$/g, "");
      if (!bare) return "";
      if (/^[A-Z0-9&+-]{2,}$/.test(bare)) return bare;
      const lower = bare.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .filter(Boolean)
    .join(" ");
}

function candidateFromContent(content: string): string {
  const cleaned = cleanText(content);
  if (!cleaned) return "New Script";

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^["']+|["']+$/g, "").trim())
    .filter(Boolean);

  const candidate =
    sentences.find((sentence) => sentence.split(/\s+/).filter(Boolean).length >= 4) ??
    sentences[0] ??
    cleaned;

  return candidate
    .replace(/^picture this[,:.!?]?\s*/i, "")
    .replace(/^here'?s the thing[,:.!?]?\s*/i, "")
    .replace(/^hey(?:\s+there)?[,:.!?]?\s*/i, "")
    .replace(/\bactually\b/gi, "")
    .replace(/\breally\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWeakScriptTitle(title: string | null | undefined): boolean {
  const cleaned = cleanText(String(title ?? ""));
  if (!cleaned) return true;
  return isInstructionLike(cleaned);
}

export function deriveScriptTitle(input: {
  content: string;
  topic?: string | null;
  maxWords?: number;
}): string {
  const maxWords = Math.min(9, Math.max(4, input.maxWords ?? 9));
  const topic = cleanText(String(input.topic ?? ""));
  const source = topic && !isInstructionLike(topic) ? topic : candidateFromContent(input.content);

  let normalized = cleanText(source)
    .replace(/^(remake|script)\s*:\s*/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) normalized = words.slice(0, maxWords).join(" ");

  const titled = titleCase(normalized);
  if (titled.split(/\s+/).filter(Boolean).length >= 2) return titled;

  return "New Script";
}
