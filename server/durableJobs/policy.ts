export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_LEASE_SECONDS = 5 * 60;
export const MAX_RETRY_DELAY_SECONDS = 15 * 60;

export function retryDelaySeconds(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(MAX_RETRY_DELAY_SECONDS, 15 * 2 ** (safeAttempt - 1));
}

export function shouldDeadLetter(attempt: number, maxAttempts: number): boolean {
  return attempt >= maxAttempts;
}

export function safeJobError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 2_000) || "Unknown job error";
}
