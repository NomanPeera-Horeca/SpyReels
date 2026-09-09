export const SCRAPE_FAILURE_REASON_VALUES = [
  "handle_not_found",
  "account_private",
  "instagram_rate_limited",
  "account_too_large",
  "unknown",
] as const;

export type ScrapeFailureReason = (typeof SCRAPE_FAILURE_REASON_VALUES)[number];

/**
 * Map scraper and worker error strings to a stable code for UI labels.
 * Unknown or legacy messages become "unknown".
 *
 * Provider-side resolution flakes must not be classified as handle_not_found.
 * `instagram_rate_limited` is the existing retryable / refundable vendor bucket.
 */
export function classifyScrapeFailureMessage(message: string): ScrapeFailureReason {
  const m = message.toLowerCase();
  if (m.includes("private")) {
    return "account_private";
  }
  if (m.includes("too large") || m.includes("too many pages")) {
    return "account_too_large";
  }
  if (
    m.includes("could not resolve") ||
    m.includes("couldn't load") ||
    m.includes("rate limit") ||
    m.includes("rate limited") ||
    m.includes("429") ||
    m.includes("usually temporary")
  ) {
    return "instagram_rate_limited";
  }
  if (
    m.includes("restricting access") &&
    m.includes("can't retrieve their reels")
  ) {
    return "unknown";
  }
  if (m.includes("not found") && m.includes("check the username")) {
    return "handle_not_found";
  }
  if (/user "@[^"]+" not found\.?\s*$/.test(m.trim())) {
    return "handle_not_found";
  }
  return "unknown";
}

function instagramErrorName(error: unknown): string | null {
  return error instanceof Error ? error.name : null;
}

/**
 * Classify typed Instagram errors by name so routers does not need to
 * import constructors from instagram.ts (avoids test-mock coupling).
 */
export function classifyThrownInstagramError(
  error: unknown
): ScrapeFailureReason | null {
  switch (instagramErrorName(error)) {
    case "InstagramHandleNotFoundError":
      return "handle_not_found";
    case "InstagramPrivateAccountError":
      return "account_private";
    case "InstagramProviderError":
      return "instagram_rate_limited";
    case "InstagramRestrictedMediaError":
      return "unknown";
    default:
      return null;
  }
}

export function instagramFailureLogReason(
  error: unknown,
  storedReason: ScrapeFailureReason
): string {
  return instagramErrorName(error) === "InstagramRestrictedMediaError"
    ? "media_restricted"
    : storedReason;
}

export function shouldRefundInstagramFailure(
  error: unknown,
  storedReason: ScrapeFailureReason
): boolean {
  const name = instagramErrorName(error);
  return (
    storedReason === "instagram_rate_limited" ||
    name === "InstagramProviderError" ||
    name === "InstagramRestrictedMediaError"
  );
}
