type RefreshTask = () => Promise<void>;

const MAX_QUEUED_REFRESHES = 25;
let queuedRefreshes = 0;
let refreshTail: Promise<void> = Promise.resolve();

export function getQueuedCreatorRadarRefreshes(): number {
  return queuedRefreshes;
}

/**
 * Provider-facing Creator Radar refreshes run serially. A user may request
 * several refreshes quickly, but we never fan them out into a provider burst.
 * Returns false when the bounded queue is full.
 */
export function enqueueCreatorRadarRefresh(task: RefreshTask): boolean {
  if (queuedRefreshes >= MAX_QUEUED_REFRESHES) return false;
  queuedRefreshes += 1;

  const run = refreshTail.then(task, task);
  refreshTail = run
    .catch((error) => {
      console.error(
        "[creator-radar-refresh] queued task failed:",
        error instanceof Error ? error.message : error
      );
    })
    .finally(() => {
      queuedRefreshes = Math.max(0, queuedRefreshes - 1);
    });

  return true;
}
