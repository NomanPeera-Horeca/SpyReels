import { describe, expect, it } from "vitest";
import {
  planCanonicalLibrarySave,
  type CanonicalSavedRow,
} from "../canonicalLibrarySavePlan";

function row(
  partial: Partial<CanonicalSavedRow> & { id: number }
): CanonicalSavedRow {
  return {
    reelId: null,
    platform: null,
    sourceId: null,
    ...partial,
  };
}

describe("planCanonicalLibrarySave", () => {
  it("inserts when the library has no matching row", () => {
    expect(
      planCanonicalLibrarySave({
        rows: [],
        platform: "tiktok",
        sourceId: "7690",
        mirroredReelId: 44831,
      })
    ).toEqual({ type: "insert", reelId: 44831 });
  });

  it("stamps identity onto a legacy mirrored save", () => {
    expect(
      planCanonicalLibrarySave({
        rows: [row({ id: 1, reelId: 44831 })],
        platform: "tiktok",
        sourceId: "7690",
        mirroredReelId: 44831,
      })
    ).toEqual({ type: "stamp-identity", id: 1 });
  });

  it("merges a canonical row with a legacy mirrored save instead of colliding", () => {
    expect(
      planCanonicalLibrarySave({
        rows: [
          row({ id: 10, platform: "tiktok", sourceId: "7690" }),
          row({ id: 11, reelId: 44831 }),
        ],
        platform: "tiktok",
        sourceId: "7690",
        mirroredReelId: 44831,
      })
    ).toEqual({
      type: "merge",
      keepId: 11,
      deleteId: 10,
      reelId: 44831,
    });
  });

  it("is a no-op when the identity is already saved", () => {
    expect(
      planCanonicalLibrarySave({
        rows: [
          row({
            id: 4,
            reelId: 44831,
            platform: "tiktok",
            sourceId: "7690",
          }),
        ],
        platform: "tiktok",
        sourceId: "7690",
        mirroredReelId: 44831,
      })
    ).toEqual({ type: "noop" });
  });

  it("attaches a later workspace mirror onto an identity-only save", () => {
    expect(
      planCanonicalLibrarySave({
        rows: [row({ id: 8, platform: "tiktok", sourceId: "7690" })],
        platform: "tiktok",
        sourceId: "7690",
        mirroredReelId: 44831,
      })
    ).toEqual({ type: "attach-reel", id: 8, reelId: 44831 });
  });
});
