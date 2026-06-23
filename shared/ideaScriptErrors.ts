export type IdeaScriptErrorContext = "validation" | "script";

function contextVerb(context: IdeaScriptErrorContext): string {
  return context === "validation" ? "validating your idea" : "writing your script";
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function looksLikeApiPayload(message: string): boolean {
  return message.includes('{"type"') || message.includes("request_id") || message.includes("overloaded_error");
}

/** User-safe copy for Idea to Script failures (no raw API JSON). */
export function formatIdeaScriptErrorForUser(
  error: unknown,
  context: IdeaScriptErrorContext = "validation"
): string {
  let raw = rawErrorMessage(error).trim();
  if (!raw) {
    return `Something went wrong while ${contextVerb(context)}. Tap Retry to try again.`;
  }

  if (raw.startsWith("Validation failed: ")) {
    raw = raw.slice("Validation failed: ".length).trim();
  }

  const lower = raw.toLowerCase();

  if (lower.includes("overloaded") || raw.includes("529")) {
    return "Our AI is busy right now. Wait a moment and tap Retry.";
  }

  if (
    raw.includes("401") ||
    lower.includes("authentication") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("invalid api key")
  ) {
    return "AI connection failed on our side. Our team has been notified. Try again in a few minutes.";
  }

  if (lower.includes("rate_limit") || raw.includes("429")) {
    return "Too many requests right now. Wait a minute and tap Retry.";
  }

  if (lower.includes("anthropic_api_key") || lower.includes("api key is not configured")) {
    return "AI is temporarily unavailable. Please try again shortly.";
  }

  if (looksLikeApiPayload(raw) || raw.length > 140) {
    return `Something went wrong while ${contextVerb(context)}. Tap Retry to try again.`;
  }

  return raw;
}

export function isRetryableLlmError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 529 || status === 429) return true;

  const raw = rawErrorMessage(error);
  const lower = raw.toLowerCase();
  return (
    lower.includes("overloaded") ||
    lower.includes("rate_limit") ||
    raw.includes("529") ||
    raw.includes("429")
  );
}
