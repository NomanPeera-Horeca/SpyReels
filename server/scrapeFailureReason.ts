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
 */
export function classifyScrapeFailureMessage(message: string): ScrapeFailureReason {
  const m = message.toLowerCase();
  if (m.includes("not found") || m.includes("not accessible")) {
    return "handle_not_found";
  }
  if (m.includes("private")) {
    return "account_private";
  }
  if (m.includes("rate limit") || m.includes("rate limited") || m.includes("429")) {
    return "instagram_rate_limited";
  }
  if (m.includes("too large") || m.includes("too many pages")) {
    return "account_too_large";
  }
  return "unknown";
}
