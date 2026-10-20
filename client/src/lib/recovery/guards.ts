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
