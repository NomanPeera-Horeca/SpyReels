import { beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_LOOKUPS_PER_HOUR,
  lookupPublicProfile,
  resetLookupLimiterForTests,
  type ProfileLookupDeps,
} from "./profileLookup";

const igProfile = {
  username: "Test.Kitchen",
  fullName: "Test Kitchen",
  biography: "Easy dinners",
  profilePicUrl: "https://cdn.example/pic.jpg",
  followerCount: 1200,
  followingCount: 0,
  postCount: 40,
  isVerified: false,
  isPrivate: false,
  category: "",
  externalUrl: "",
  userId: "1",
  recentMedia: [
    { shortcode: "a1", thumbnailUrl: "https://cdn.example/a1.jpg", viewCount: 900, isPinned: true },
    { shortcode: "a2", thumbnailUrl: "https://cdn.example/a2.jpg", viewCount: null, isPinned: false },
  ],
};

function deps(over: Partial<ProfileLookupDeps> = {}): ProfileLookupDeps {
  return {
    instagram: async () => igProfile,
    tiktok: async () => {
      throw new Error('User "@x" not found');
    },
    youtube: async () => ({
      channelId: "c",
      handle: "chan",
      name: "Chan",
      isVerified: false,
      subscriberCount: 8,
      description: "",
      avatarUrl: "",
    }),
    mirrorAvatar: async (_h, url) => `${url}?mirrored`,
    mirrorThumbnails: async items => new Map(items.map(i => [i.shortcode, `${i.thumbnailUrl}?r2`])),
    classify: err => (/not found/.test(String(err)) ? "not_found" : "error"),
    ...over,
  };
}

describe("lookupPublicProfile", () => {
  beforeEach(() => resetLookupLimiterForTests());

  it("returns only provider values; missing values stay null, real zeros stay zero", async () => {
    const r = await lookupPublicProfile({ userId: 1, platform: "instagram", handle: "test.kitchen", deps: deps() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile).toMatchObject({
      handle: "test.kitchen",
      displayName: "Test Kitchen",
      category: null,
      externalUrl: null,
      followingCount: 0,
      avatarUrl: "https://cdn.example/pic.jpg?mirrored",
    });
    expect(r.profile.recentPosts).toEqual([
      { id: "a1", thumbnailUrl: "https://cdn.example/a1.jpg?r2", viewCount: 900, isPinned: true },
      { id: "a2", thumbnailUrl: "https://cdn.example/a2.jpg?r2", viewCount: null, isPinned: false },
    ]);
    expect(r.meter.budget).toBeGreaterThan(0);
  });

  it("YouTube without a subscriber-visible video count shows no invented counts", async () => {
    const r = await lookupPublicProfile({ userId: 1, platform: "youtube", handle: "chan", deps: deps() });
    expect(r.ok && r.profile).toMatchObject({ followerCount: 8, postCount: null, videoCount: null, avatarUrl: null });
  });

  it("maps not found, private and provider errors to friendly reasons", async () => {
    expect(await lookupPublicProfile({ userId: 1, platform: "tiktok", handle: "x", deps: deps() })).toMatchObject({ ok: false, reason: "not_found" });
    const priv = deps({ instagram: async () => ({ ...igProfile, isPrivate: true }) });
    expect(await lookupPublicProfile({ userId: 1, platform: "instagram", handle: "p", deps: priv })).toMatchObject({ ok: false, reason: "private" });
    const down = deps({ instagram: async () => { throw new Error("HTTP 500"); } });
    expect(await lookupPublicProfile({ userId: 1, platform: "instagram", handle: "p", deps: down })).toMatchObject({ ok: false, reason: "error" });
  });

  it("caps lookups per user per hour (cost protection)", async () => {
    for (let i = 0; i < PROFILE_LOOKUPS_PER_HOUR; i++) {
      await lookupPublicProfile({ userId: 7, platform: "instagram", handle: "a", deps: deps(), now: 1_000 + i });
    }
    expect(await lookupPublicProfile({ userId: 7, platform: "instagram", handle: "a", deps: deps(), now: 2_000 })).toMatchObject({ ok: false, reason: "rate_limited" });
    // Another user is unaffected; the same user can look up again an hour later.
    expect((await lookupPublicProfile({ userId: 8, platform: "instagram", handle: "a", deps: deps(), now: 2_000 })).ok).toBe(true);
    expect((await lookupPublicProfile({ userId: 7, platform: "instagram", handle: "a", deps: deps(), now: 2_000 + 3_600_001 })).ok).toBe(true);
  });
});
