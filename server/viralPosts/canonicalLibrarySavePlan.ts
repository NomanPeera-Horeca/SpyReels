export type CanonicalSavedRow = {
  id: number;
  reelId: number | null;
  platform: string | null;
  sourceId: string | null;
};

export type CanonicalLibrarySavePlan =
  | { type: "noop" }
  | { type: "stamp-identity"; id: number }
  | { type: "attach-reel"; id: number; reelId: number }
  | { type: "merge"; keepId: number; deleteId: number; reelId: number }
  | { type: "insert"; reelId: number | null };

function sameIdentity(
  row: CanonicalSavedRow,
  platform: string,
  sourceId: string
): boolean {
  return (
    (row.platform || "").trim().toLowerCase() === platform &&
    (row.sourceId || "").trim() === sourceId
  );
}

/**
 * Decide how to land one Viral Posts save onto saved_reels without colliding
 * with a legacy reelId row. The previous UPDATE-then-INSERT path stamped
 * identity onto the mirrored reel even when another row already owned that
 * identity, which MySQL rejects when a unique key is present and is racy
 * even when it is not.
 */
export function planCanonicalLibrarySave(args: {
  rows: CanonicalSavedRow[];
  platform: string;
  sourceId: string;
  mirroredReelId: number | null;
}): CanonicalLibrarySavePlan {
  const platform = args.platform.trim().toLowerCase();
  const sourceId = args.sourceId.trim();
  const mirroredReelId =
    args.mirroredReelId != null && args.mirroredReelId > 0
      ? args.mirroredReelId
      : null;

  const identityRow = args.rows.find((row) =>
    sameIdentity(row, platform, sourceId)
  );
  const reelRow =
    mirroredReelId == null
      ? undefined
      : args.rows.find((row) => row.reelId === mirroredReelId);

  if (identityRow && reelRow && identityRow.id !== reelRow.id) {
    return {
      type: "merge",
      keepId: reelRow.id,
      deleteId: identityRow.id,
      reelId: mirroredReelId!,
    };
  }

  if (identityRow) {
    if (mirroredReelId != null && identityRow.reelId == null) {
      return {
        type: "attach-reel",
        id: identityRow.id,
        reelId: mirroredReelId,
      };
    }
    return { type: "noop" };
  }

  if (reelRow) {
    const needsIdentity =
      !reelRow.platform ||
      !reelRow.sourceId ||
      !sameIdentity(reelRow, platform, sourceId);
    if (needsIdentity) {
      return { type: "stamp-identity", id: reelRow.id };
    }
    return { type: "noop" };
  }

  return { type: "insert", reelId: mirroredReelId };
}
