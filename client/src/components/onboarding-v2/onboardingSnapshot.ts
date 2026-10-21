/**
 * A late read must not wipe suggestions or a finished analysis that this
 * screen already accepted. A newer personalization version still wins, so a
 * user edit is applied.
 */
export type OnboardingSnapshotLike = {
  version: number;
  items: readonly { kind: string }[];
  analysis: {
    status: string;
    panels: unknown;
  } | null;
};

const SETTLED = new Set(["succeeded", "partial", "failed"]);
const OPEN = new Set(["queued", "running"]);

function hasPanels(panels: unknown): boolean {
  return panels != null && typeof panels === "object";
}

export function preferOnboardingSnapshot<T extends OnboardingSnapshotLike>(
  current: T | null,
  incoming: T
): T {
  if (!current) return incoming;
  if (incoming.version > current.version) return incoming;
  if (incoming.version < current.version) return current;
  const currentStatus = current.analysis?.status ?? null;
  const incomingStatus = incoming.analysis?.status ?? null;
  if (
    currentStatus != null &&
    SETTLED.has(currentStatus) &&
    incomingStatus != null &&
    OPEN.has(incomingStatus)
  ) {
    return current;
  }
  if (current.items.length > 0 && incoming.items.length === 0) return current;
  if (
    currentStatus === "succeeded" &&
    hasPanels(current.analysis?.panels) &&
    !hasPanels(incoming.analysis?.panels)
  ) {
    return current;
  }
  return incoming;
}
