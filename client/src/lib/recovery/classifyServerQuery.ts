import { UNAUTHED_ERR_MSG } from "@shared/const";

/** What a screen should show while it waits on the server. */
export type RecoveryView =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "error" }
  | { kind: "ready" };

/** A state read that has not settled by this time becomes Retry, not an endless wait. */
export const RECOVERY_BOUND_MS = 8000;

/** Session is gone. A retry will not bring the saved data back. */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const data = (error as { data?: { code?: string; httpStatus?: number } }).data;
  if (data?.code === "UNAUTHORIZED" || data?.httpStatus === 401) return true;
  const message = (error as { message?: unknown }).message;
  return message === UNAUTHED_ERR_MSG;
}

/**
 * Saved data wins over a later refetch error, so a background failure does not
 * wipe a screen that already restored. No data yet: loading, then sign-in or retry.
 */
export function classifyServerQuery(input: {
  pending: boolean;
  error: unknown;
  hasData: boolean;
  /** The wait exceeded RECOVERY_BOUND_MS and nothing saved is on screen yet. */
  timedOut?: boolean;
}): RecoveryView {
  if (input.hasData) return { kind: "ready" };
  if (input.timedOut) return { kind: "error" };
  if (input.pending) return { kind: "loading" };
  if (isUnauthorizedError(input.error)) return { kind: "unauthorized" };
  if (input.error) return { kind: "error" };
  return { kind: "ready" };
}
