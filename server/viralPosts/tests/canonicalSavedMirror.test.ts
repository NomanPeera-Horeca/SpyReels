import { beforeEach, describe, expect, it, vi } from "vitest";

// Plain function (not vi.fn) so a rejected mirror is only seen by the code under test.
let mirrorImpl: (candidate: unknown, workspaceId: string) => Promise<number | null>;
const mirrorCalls: unknown[][] = [];
vi.mock("../ensureMirrorReel", () => ({
  ensureViralMirrorReel: (candidate: unknown, workspaceId: string, opts: unknown) => {
    mirrorCalls.push([candidate, workspaceId, opts]);
    return mirrorImpl(candidate, workspaceId);
  },
}));
vi.mock("../../db", () => ({ getDb: async () => null }));
vi.mock("../../personalWorkspace", () => ({ getPersonalWorkspaceId: async () => "ws-1" }));

const candidate = { id: 7, platform: "instagram", sourceId: "ABC", mirroredReelId: null } as never;

describe("a Viral Posts star creates the reel Saved Reels needs", () => {
  beforeEach(() => {
    mirrorCalls.length = 0;
    mirrorImpl = async () => null;
  });

  it("Instagram/TikTok: creates (or reuses) the workspace reel and points the save at it", async () => {
    const { ensureMirrorForSave } = await import("../canonicalSaved");
    mirrorImpl = async () => 501;
    expect(await ensureMirrorForSave({ candidate, workspaceId: "ws-1", platform: "instagram", sourceId: "ABC" })).toBe(501);
    expect(mirrorCalls).toEqual([[candidate, "ws-1", { allowYouTube: true }]]);
  });

  it("YouTube: also mirrored for saves (like Collected Reels), so a starred Short shows in Saved Reels", async () => {
    const { ensureMirrorForSave } = await import("../canonicalSaved");
    const yt = { id: 8, platform: "youtube", sourceId: "dQw4w9WgXcQ", mirroredReelId: null } as never;
    mirrorImpl = async () => 777;
    expect(await ensureMirrorForSave({ candidate: yt, workspaceId: "ws-1", platform: "youtube", sourceId: "dQw4w9WgXcQ" })).toBe(777);
    expect(mirrorCalls).toEqual([[yt, "ws-1", { allowYouTube: true }]]);
  });

  it("a failed mirror never fails the save (falls back to an existing mirror, here none)", async () => {
    const { ensureMirrorForSave } = await import("../canonicalSaved");
    mirrorImpl = async () => {
      throw new Error("db down");
    };
    expect(await ensureMirrorForSave({ candidate, workspaceId: "ws-1", platform: "tiktok", sourceId: "ABC" })).toBeNull();
  });
});
