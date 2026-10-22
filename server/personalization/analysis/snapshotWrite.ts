/**
 * Snapshot writes from profile evidence and from the post scrape.
 * Both must keep the other side's data. Evidence never sets the scrape clock.
 */
import type {
  AnalysisSourceSnapshot,
  ProfileEvidence,
  SocialPlatform,
} from "@shared/personalization/model";

export type SnapshotClock = {
  snapshot: AnalysisSourceSnapshot | null;
  sourceFetchedAt: Date | null;
  postsInWindow: number | null;
};

export type ProfileEvidenceIdentity = {
  platform: SocialPlatform;
  handle: string;
  followerCount: number | null;
};

/** One-at-a-time lock. The SQL store uses SELECT ... FOR UPDATE instead. */
export function createSnapshotLock() {
  let tail: Promise<void> = Promise.resolve();
  return function runLocked<T>(task: () => Promise<T> | T): Promise<T> {
    const previous = tail;
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    tail = current;
    return previous.then(task).finally(release);
  };
}

/**
 * Stores lookup facts. Leaves sourceFetchedAt and postsInWindow untouched,
 * including when the scrape has already stored posts and panels.
 */
export function writeProfileEvidence(
  row: SnapshotClock,
  evidence: ProfileEvidence,
  identity: ProfileEvidenceIdentity
): void {
  const current = row.snapshot;
  if (!current) {
    row.snapshot = {
      version: 1,
      platform: identity.platform,
      handle: identity.handle,
      followerCount: identity.followerCount,
      windowStart: new Date(0).toISOString(),
      windowEnd: new Date(0).toISOString(),
      posts: [],
      profileEvidence: evidence,
    };
    return;
  }
  row.snapshot = { ...current, profileEvidence: evidence };
}

/**
 * Stores a scrape checkpoint. Posts on this write are the scrape result.
 * Profile evidence and panels already on the row are kept when this
 * checkpoint does not include them.
 */
export function writeScrapeSnapshot(
  row: SnapshotClock,
  incoming: AnalysisSourceSnapshot,
  fetchedAt: Date
): void {
  const current = row.snapshot;
  const profileEvidence = current?.profileEvidence ?? incoming.profileEvidence ?? null;
  const performancePanels = incoming.performancePanels ?? current?.performancePanels;
  row.snapshot = {
    version: 1,
    platform: incoming.platform,
    handle: incoming.handle,
    followerCount: incoming.followerCount,
    windowStart: incoming.windowStart,
    windowEnd: incoming.windowEnd,
    posts: incoming.posts,
    ...(performancePanels ? { performancePanels } : {}),
    ...(profileEvidence ? { profileEvidence } : {}),
  };
  row.sourceFetchedAt = fetchedAt;
  row.postsInWindow = incoming.posts.length;
}
