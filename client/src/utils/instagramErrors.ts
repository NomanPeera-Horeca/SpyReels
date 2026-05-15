/** User-visible errors from profile preview / scrape that indicate IG throttling. */
export function isLikelyInstagramRateLimitMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("429") ||
    m.includes("temporarily restricting") ||
    m.includes("temporarily rate limiting")
  );
}
