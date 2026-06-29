import { IDEA_SUBMIT_MAX_LENGTH } from "./ideaScriptLimits";
import type { ZodIssue } from "zod";

export type ZodIssueLike = {
  code?: string;
  path?: ReadonlyArray<string | number | symbol>;
  type?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  validation?: string;
  message?: string;
};

function asNumber(value: number | bigint | undefined, fallback: number): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return fallback;
}

function fieldLabel(path: ReadonlyArray<string | number | symbol>): string {
  const last = path[path.length - 1];
  if (typeof last === "string") {
    const labels: Record<string, string> = {
      idea: "idea",
      editedIdea: "idea",
      ideas: "ideas",
      caption: "caption",
      title: "title",
      name: "name",
      email: "email",
      description: "description",
      niche: "niche",
      query: "search",
      message: "message",
    };
    return labels[last] ?? last.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  }
  return "input";
}

function isIdeaField(path: ReadonlyArray<string | number | symbol> | undefined): boolean {
  if (!path?.length) return false;
  return path.includes("idea") || path[path.length - 1] === "editedIdea";
}

function formatSingleZodIssue(issue: ZodIssueLike | ZodIssue): string {
  const path = issue.path ?? [];
  const field = fieldLabel(path);
  const code = issue.code;
  const issueType = "type" in issue ? issue.type : undefined;

  if (code === "too_big") {
    if (issueType === "string" || path.includes("idea")) {
      if (isIdeaField(path)) {
        const max = asNumber(
          "maximum" in issue ? issue.maximum : undefined,
          IDEA_SUBMIT_MAX_LENGTH
        );
        return `Your idea is too long (${max} characters max). Shorten it, or tap a follow-up chip above for your next script.`;
      }
      const max = asNumber("maximum" in issue ? issue.maximum : undefined, 0) || "the allowed";
      return `That ${field} is too long (max ${max} characters).`;
    }
    if (issueType === "array") {
      const max = asNumber("maximum" in issue ? issue.maximum : undefined, 0) || "allowed";
      return `Too many items in ${field} (max ${max}).`;
    }
    return `That value is too large for ${field}.`;
  }

  if (code === "too_small") {
    if (issueType === "string") {
      const min = asNumber("minimum" in issue ? issue.minimum : undefined, 1);
      return `Please enter at least ${min} characters for your ${field}.`;
    }
    if (issueType === "array") {
      const min = asNumber("minimum" in issue ? issue.minimum : undefined, 1);
      return `Please add at least ${min} item(s) for ${field}.`;
    }
    return `That value is too small for ${field}.`;
  }

  if (code === "invalid_type") {
    return `Please check the ${field} field and try again.`;
  }

  if (code === "invalid_enum_value") {
    return `Please choose a valid option for ${field}.`;
  }

  if (code === "invalid_string") {
    const validation = "validation" in issue ? issue.validation : undefined;
    if (validation === "email") return "Please enter a valid email address.";
    if (validation === "url") return "Please enter a valid URL.";
    return `Please check the ${field} field and try again.`;
  }

  const raw = issue.message?.trim();
  if (raw && !raw.toLowerCase().includes("expected")) {
    return raw;
  }

  return `Please check the ${field} field and try again.`;
}

export function formatZodIssuesForUser(issues: readonly (ZodIssueLike | ZodIssue)[]): string {
  if (issues.length === 0) {
    return "Invalid input. Please check your entries and try again.";
  }
  return formatSingleZodIssue(issues[0]!);
}

function parseZodIssuesFromMessage(message: string): ZodIssueLike[] | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as ZodIssueLike[];
    if (parsed && typeof parsed === "object") return [parsed as ZodIssueLike];
  } catch {
    return null;
  }

  return null;
}

function looksLikeZodIssuePayload(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("too big") ||
    lower.includes("too small") ||
    lower.includes("invalid_type") ||
    message.trim().startsWith("[{") ||
    message.trim().startsWith('{"origin"') ||
    message.trim().startsWith('{"code"')
  );
}

/** Map tRPC/Zod validation messages to user-friendly copy (client fallback + server formatter). */
export function formatTrpcValidationMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Something went wrong. Please try again.";
  }

  const parsed = parseZodIssuesFromMessage(trimmed);
  if (parsed?.length) {
    return formatZodIssuesForUser(parsed);
  }

  if (looksLikeZodIssuePayload(trimmed)) {
    if (trimmed.toLowerCase().includes("too big") && trimmed.toLowerCase().includes("idea")) {
      return `Your idea is too long (${IDEA_SUBMIT_MAX_LENGTH} characters max). Shorten it, or tap a follow-up chip above for your next script.`;
    }
    return "Invalid input. Please check your entries and try again.";
  }

  return trimmed;
}
