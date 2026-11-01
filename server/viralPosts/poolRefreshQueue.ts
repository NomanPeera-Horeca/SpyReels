/**
 * Picks which shared pools the background refresher works on next.
 *
 * The old queue sorted every pool by priority and took the first stale one.
 * TikTok seed pools (priority 80) always sorted first, and pools that never
 * fill up (or are already full but past 3h) stayed at the head forever, so
 * Instagram and YouTube pools were never reached and Home lost their creators.
 *
 * Rules here:
 * - Only pools that a refresh would actually work on: below their fresh
 *   target, and not attempted in the last 3h (24h after an empty or failed
 *   run, so a dead pool cannot take every turn).
 * - Platforms take turns. The platform waiting longest goes first; inside a
 *   platform, lower priority number first, then the longest-waiting pool.
 */
import type { ViralPostPool } from "../../drizzle/schema";

export const POOL_RETRY_AFTER_MS = 3 * 60 * 60 * 1000;
export const POOL_RETRY_AFTER_EMPTY_MS = 24 * 60 * 60 * 1000;

export type PoolQueueRow = Pick<
  ViralPostPool,
  | "id"
  | "platform"
  | "priority"
  | "minFreshCandidates"
  | "lastRefreshedAt"
  | "lastRefreshStatus"
  | "lastRefreshCandidateCount"
> & { freshCandidates: number };

function lastAttemptMs(row: PoolQueueRow): number {
  return row.lastRefreshedAt ? row.lastRefreshedAt.getTime() : 0;
}

export function poolIsDueForRefresh(row: PoolQueueRow, now: number): boolean {
  if (row.freshCandidates >= row.minFreshCandidates) return false;
  if (!row.lastRefreshedAt) return true;
  const lastRunEmpty =
    row.lastRefreshStatus === "error" ||
    (row.lastRefreshStatus === "refreshed" && (row.lastRefreshCandidateCount ?? 0) === 0);
  const wait = lastRunEmpty ? POOL_RETRY_AFTER_EMPTY_MS : POOL_RETRY_AFTER_MS;
  return now - lastAttemptMs(row) >= wait;
}

export function pickPoolsForRefresh<T extends PoolQueueRow>(args: {
  rows: T[];
  enabledPlatforms: ReadonlySet<string>;
  limit: number;
  now?: number;
}): T[] {
  const now = args.now ?? Date.now();
  const byPlatform = new Map<string, T[]>();
  for (const row of args.rows) {
    const platform = (row.platform || "").trim().toLowerCase();
    if (!args.enabledPlatforms.has(platform)) continue;
    if (!poolIsDueForRefresh(row, now)) continue;
    const list = byPlatform.get(platform) ?? [];
    list.push(row);
    byPlatform.set(platform, list);
  }
  const queues = Array.from(byPlatform.values()).map(list =>
    list.sort(
      (a, b) =>
        (a.priority ?? 100) - (b.priority ?? 100) || lastAttemptMs(a) - lastAttemptMs(b)
    )
  );
  // The platform whose most-neglected pool has waited longest goes first.
  queues.sort(
    (a, b) =>
      Math.min(...a.map(lastAttemptMs)) - Math.min(...b.map(lastAttemptMs))
  );
  const out: T[] = [];
  for (let round = 0; out.length < args.limit; round++) {
    let added = false;
    for (const queue of queues) {
      if (out.length >= args.limit) break;
      const next = queue[round];
      if (next) {
        out.push(next);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}
