/**
 * Optional wall-clock budget for an interactive provider lookup.
 * Callers that omit it keep the integration's existing timeout and retries.
 */
export type LookupBudgetOptions = {
  /** Per request. Omitted uses the integration default (30s). */
  timeoutMs?: number;
  /** Attempts for the primary call. Omitted uses the integration default. */
  maxAttempts?: number;
  /** Whole lookup. Omitted means no extra deadline. */
  deadlineMs?: number;
  signal?: AbortSignal;
};

export type LookupBudget = {
  maxAttempts: number | null;
  signal: AbortSignal;
  /** Time left for the next request, capped by the per-attempt timeout. */
  remainingMs(now?: number): number | null;
  /** Time left on the whole lookup, ignoring the per-attempt cap. */
  deadlineLeft(now?: number): number | null;
  expired(now?: number): boolean;
  sleep(ms: number): Promise<void>;
  /** Clears the deadline timer. Call when the lookup settles. */
  stop(): void;
};

export function createLookupBudget(
  options?: LookupBudgetOptions,
  now = Date.now()
): LookupBudget {
  const deadlineAt =
    options?.deadlineMs != null ? now + Math.max(0, options.deadlineMs) : null;
  const local = new AbortController();
  const parent = options?.signal;
  const onParentAbort = () => local.abort();
  if (parent) {
    if (parent.aborted) local.abort();
    else parent.addEventListener("abort", onParentAbort);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (deadlineAt != null) {
    const wait = Math.max(0, deadlineAt - now);
    timer = setTimeout(() => local.abort(), wait);
  }
  return {
    stop() {
      if (timer) clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
    maxAttempts: options?.maxAttempts ?? null,
    signal: local.signal,
    deadlineLeft(at = Date.now()) {
      if (deadlineAt == null) return null;
      return deadlineAt - at;
    },
    remainingMs(at = Date.now()) {
      const cap = options?.timeoutMs;
      const left = deadlineAt == null ? null : deadlineAt - at;
      if (left == null) return cap ?? null;
      if (cap == null) return left;
      return Math.min(cap, left);
    },
    expired(at = Date.now()) {
      return local.signal.aborted || (deadlineAt != null && at >= deadlineAt);
    },
    sleep(ms: number) {
      const left = this.remainingMs();
      const wait = left == null ? ms : Math.min(ms, Math.max(0, left));
      if (wait <= 0 || local.signal.aborted) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait);
        local.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
    },
  };
}

/** Request timeout for one attempt. Falls back to the integration default. */
export function attemptTimeoutMs(
  budget: LookupBudget | undefined,
  fallback: number
): number {
  if (!budget) return fallback;
  const remaining = budget.remainingMs();
  if (remaining == null) return fallback;
  return Math.max(1, Math.min(fallback, remaining));
}

export function budgetExpiredOrTight(budget: LookupBudget | undefined): boolean {
  if (!budget) return false;
  const left = budget.deadlineLeft();
  return budget.expired() || (left != null && left < 250);
}

export function linkAbortSignal(
  controller: AbortController,
  signal?: AbortSignal
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  return () => signal.removeEventListener("abort", onAbort);
}
