/** User-visible errors from profile preview / scrape that indicate IG throttling. */
export function isLikelyInstagramRateLimitMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("instagram rate limit reached") ||
    m.includes("temporarily rate limiting access")
  );
}
