import type { ResolveContentAgentIntentInput } from "./contentAgentTools";

export const MAX_CONTENT_AGENT_STEPS = 5;

export type ContentAgentRequestSegment = {
  index: number;
  text: string;
};

const ACTION_START =
  /^(?:please\s+)?(?:save\b|download\b|export\b|schedule\b|remind\b|film\b|turn\b|create\s+(?:a\s+)?carousel\b|make\b|shorten\b|simplify\b|give\s+me\b|generate\b|change\b|adapt\b|rewrite\b|refine\b|improve\b|fix\b)/i;

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(/^[,;:\s]+/, "")
    .replace(/[,;:\s]+$/, "")
    .trim();
}

/**
 * Split an explicit creator request into a small ordered plan without trying to
 * reason about the content itself. The Agent still resolves each segment into
 * a real creator-level tool before execution.
 *
 * We intentionally split only on strong sequencing language. Ordinary prose
 * such as "make it shorter and funnier" remains one refine instruction.
 */
export function splitContentAgentRequest(
  message: string,
  maxSteps = MAX_CONTENT_AGENT_STEPS
): ContentAgentRequestSegment[] {
  const value = message.trim();
  if (!value) return [];

  const primary = value
    .split(/\s*(?:;|\bthen\b|\band then\b)\s*/i)
    .map(normalizeSegment)
    .filter(Boolean);

  const expanded: string[] = [];
  for (const segment of primary) {
    const parts = segment.split(/\s*,\s*(?=(?:and\s+)?(?:save|download|export|schedule|remind|film|turn|create\s+(?:a\s+)?carousel|make|shorten|simplify|give\s+me|generate|change|adapt|rewrite|refine|improve|fix)\b)/i);
    for (const part of parts) {
      const andParts = part.split(/\s+and\s+(?=(?:save|download|export|schedule|remind|turn|create\s+(?:a\s+)?carousel|give\s+me|generate\s+\d*\s*hooks?)\b)/i);
      expanded.push(...andParts);
    }
  }

  const cleaned = expanded
    .map((segment) => segment.replace(/^and\s+/i, ""))
    .map(normalizeSegment)
    .filter(Boolean);

  // Avoid treating a long piece of natural prose as a multi-step plan just
  // because punctuation happened to match. Every segment after the first must
  // begin like an actionable creator command.
  const safe = cleaned.length > 1 && cleaned.slice(1).every((segment) => ACTION_START.test(segment))
    ? cleaned
    : [value];

  return safe.slice(0, Math.max(1, maxSteps)).map((text, index) => ({ index, text }));
}

export function isMultiStepContentAgentRequest(message: string): boolean {
  return splitContentAgentRequest(message).length > 1;
}

export type ContentAgentPlanContext = Pick<
  ResolveContentAgentIntentInput,
  "activeScriptId" | "attachedPlanCardId" | "recentScriptId" | "capabilityId"
>;

/**
 * Human-readable summary used by the conversation UI before work begins.
 * It never claims that a tool ran or completed.
 */
export function contentAgentPlanSummary(segments: ContentAgentRequestSegment[]): string | null {
  if (segments.length <= 1) return null;
  return `${segments.length} steps`;
}
