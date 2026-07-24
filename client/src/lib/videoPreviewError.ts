/** Map low-level fetch / tRPC errors to copy safe for reel preview toasts. */
export function formatVideoPreviewError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Preview unavailable right now.";

  const lower = raw.toLowerCase();

  if (
    lower.includes("unexpected end of json input") ||
    lower.includes("failed to execute 'json'") ||
    lower.includes("json parse")
  ) {
    return "The preview request timed out. Try again in a moment.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("load failed") ||
    lower.includes("networkrequestfailed")
  ) {
    return "Network error. Check your connection and try again.";
  }

  if (lower.includes("could not retrieve a fresh video url")) {
    return "Could not get a fresh video link for this preview.";
  }

  const trimmed = raw.trim();
  return trimmed || "Preview unavailable right now.";
}
