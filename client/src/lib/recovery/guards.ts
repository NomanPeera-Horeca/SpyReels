/** Ignores a second submit until the first one finishes. */
export function createSubmitLock() {
  let held = false;
  return {
    tryAcquire(): boolean {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
  };
}

/**
 * A newer request wins. The function returned from `begin` stays true only
 * while no later request has started.
 */
export function createGenerationGuard() {
  let current = 0;
  return {
    begin(): () => boolean {
      current += 1;
      const token = current;
      return () => token === current;
    },
  };
}

/**
 * Poll a job that is already saved. This only decides the wait.
 * It must not enqueue another job.
 */
export function pollWhileActive<T>(
  isActive: (data: T | undefined) => boolean,
  intervalMs: number
): (query: { state: { data?: T } }) => number | false {
  return query => (isActive(query.state.data) ? intervalMs : false);
}

/**
 * A late or older snapshot must not replace a newer one.
 * Retry stays a read: callers cancel the previous request, then refetch.
 */
export function shouldApplyServerSnapshot(input: {
  requestId: number;
  currentId: number;
  snapshotVersion: number | null;
  appliedVersion: number | null;
}): boolean {
  if (input.requestId !== input.currentId) return false;
  if (
    input.snapshotVersion != null &&
    input.appliedVersion != null &&
    input.snapshotVersion < input.appliedVersion
  ) {
    return false;
  }
  return true;
}

/** Cancel the in-flight read, then refetch. Drops the result if a newer attempt started. */
export async function retryRead<T>(input: {
  cancel: () => Promise<void> | void;
  refetch: () => Promise<T>;
  isCurrent: () => boolean;
}): Promise<T | null> {
  await input.cancel();
  if (!input.isCurrent()) return null;
  const result = await input.refetch();
  if (!input.isCurrent()) return null;
  return result;
}
