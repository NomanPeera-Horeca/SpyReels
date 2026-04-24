/**
 * Instagram handle rules (public profile input): 1-30 chars after normalize,
 * [a-z0-9] only for first/last, middle may use . and _, no leading/trailing
 * . or _, no consecutive dots. Strip leading @ before checking.
 */
export const INSTAGRAM_HANDLE_INVALID_MESSAGE =
  "That's not a valid Instagram handle. Check for typos.";

const HANDLE_PATTERN = /^(?!.*\.\.)([a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?)$/;

export function normalizeInstagramHandle(raw: string): string {
  return raw.replace(/^@/, "").trim().toLowerCase();
}

export function isValidInstagramHandleNormalized(s: string): boolean {
  if (s.length < 1 || s.length > 30) return false;
  return HANDLE_PATTERN.test(s);
}
