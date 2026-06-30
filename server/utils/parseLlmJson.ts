import { sanitizeAiOutputDeep } from "./sanitizeAiOutput";

export function stripLlmJsonFences(raw: string): string {
  let trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "");
  }
  return trimmed.trim();
}

function extractJsonSlice(text: string): string {
  const trimmed = stripLlmJsonFences(text);
  if (!trimmed) return trimmed;

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  if (start === -1) return trimmed;

  const open = trimmed[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed.slice(start);
}

export function parseLlmJson<T>(raw: string, fallback: T): T {
  const candidates = [raw, stripLlmJsonFences(raw), extractJsonSlice(raw)];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      return sanitizeAiOutputDeep(JSON.parse(trimmed)) as T;
    } catch {
      // try next candidate
    }
  }
  return fallback;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stringifySection(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>)
      .filter((part) => typeof part === "string" && part.trim())
      .map((part) => String(part).trim())
      .join("\n\n");
  }
  return "";
}

export function normalizeCoachScriptPayload(
  parsed: Record<string, unknown>
): Record<string, unknown> {
  const hook = pickString(parsed, "hook", "H", "h");
  let body = pickString(parsed, "body", "explainAndIllustrate", "explain_and_illustrate");
  if (!body) {
    const explain = stringifySection(parsed.explain);
    const illustrate = stringifySection(parsed.illustrate);
    body = [explain, illustrate].filter(Boolean).join("\n\n");
  }
  const callToAction = pickString(
    parsed,
    "callToAction",
    "call_to_action",
    "cta",
    "teach",
    "T"
  );

  return {
    ...parsed,
    hook,
    body,
    callToAction,
  };
}
