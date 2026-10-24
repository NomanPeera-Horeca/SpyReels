import { beforeEach, describe, expect, it } from "vitest";
import { InstagramPrivateAccountError, InstagramProviderError } from "../../instagram";
import { classifyLookupError } from "./profileLookupDeps";
import {
  PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS,
  PROFILE_LOOKUP_DEADLINE_MS,
  PROFILE_LOOKUP_MAX_ATTEMPTS,
  PROFILE_LOOKUP_SLOW_AFTER_MS,
} from "@shared/personalization/profileLookup";
import {
  PROFILE_LOOKUPS_PER_HOUR,
  lookupPublicProfile,
  profileLookupProviderBudget,
  recallCachedPublicProfile,
  resetLookupLimiterForTests,
  resetProfileLookupCacheForTests,
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
  beforeEach(() => {
    resetLookupLimiterForTests();
    resetProfileLookupCacheForTests();
  });

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
      avatarUrl: "https://cdn.example/pic.jpg",
    });
    expect(r.profile.recentPosts).toEqual([
      { id: "a1", thumbnailUrl: "https://cdn.example/a1.jpg", viewCount: 900, isPinned: true },
      { id: "a2", thumbnailUrl: "https://cdn.example/a2.jpg", viewCount: null, isPinned: false },
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
      await lookupPublicProfile({ userId: 7, platform: "instagram", handle: `creator-${i}`, deps: deps(), now: 1_000 + i });
    }
    expect(await lookupPublicProfile({ userId: 7, platform: "instagram", handle: "another", deps: deps(), now: 2_000 })).toMatchObject({ ok: false, reason: "rate_limited" });
    // Another user is unaffected; the same user can look up again an hour later.
    expect((await lookupPublicProfile({ userId: 8, platform: "instagram", handle: "fresh", deps: deps(), now: 2_000 })).ok).toBe(true);
    expect((await lookupPublicProfile({ userId: 7, platform: "instagram", handle: "later", deps: deps(), now: 2_000 + 3_600_001 })).ok).toBe(true);
  });

  it("does not block identification on media mirroring", async () => {
    let mirrored = false;
    const started = Date.now();
    const r = await lookupPublicProfile({
      userId: 1,
      platform: "instagram",
      handle: "test.kitchen",
      deps: deps({
        mirrorAvatar: async () => {
          mirrored = true;
          await new Promise(resolve => setTimeout(resolve, 5_000));
          return "https://cdn.example/slow.jpg";
        },
      }),
    });
    expect(Date.now() - started).toBeLessThan(500);
    expect(mirrored).toBe(false);
    expect(r.ok && r.profile.avatarUrl).toBe("https://cdn.example/pic.jpg");
  });

  it("reuses a successful public profile instead of paying the provider again", async () => {
    let calls = 0;
    const d = deps({
      instagram: async () => {
        calls += 1;
        return igProfile;
      },
    });
    const first = await lookupPublicProfile({ userId: 1, platform: "instagram", handle: "Test.Kitchen", deps: d, now: 5_000 });
    const second = await lookupPublicProfile({ userId: 2, platform: "instagram", handle: "test.kitchen", deps: d, now: 6_000 });
    expect(calls).toBe(1);
    expect(first.ok && second.ok).toBe(true);
    expect(recallCachedPublicProfile("instagram", "test.kitchen", 6_000)?.handle).toBe("test.kitchen");
  });

  it("shares one in-flight provider call across duplicate lookups", async () => {
    let calls = 0;
    const d = deps({
      instagram: () =>
        new Promise(resolve => {
          calls += 1;
          setTimeout(() => resolve(igProfile), 30);
        }),
    });
    const [a, b] = await Promise.all([
      lookupPublicProfile({ userId: 1, platform: "instagram", handle: "test.kitchen", deps: d }),
      lookupPublicProfile({ userId: 1, platform: "instagram", handle: "test.kitchen", deps: d }),
    ]);
    expect(calls).toBe(1);
    expect(a.ok && b.ok).toBe(true);
  });

  it("gives Instagram the full deadline and keeps the shorter cap for other platforms", async () => {
    expect(PROFILE_LOOKUP_SLOW_AFTER_MS).toBe(8_000);
    expect(PROFILE_LOOKUP_DEADLINE_MS).toBe(12_000);
    expect(PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS).toBe(8_000);
    expect(PROFILE_LOOKUP_MAX_ATTEMPTS).toBe(2);
    expect(profileLookupProviderBudget("instagram", 12_000)).toEqual({
      timeoutMs: 12_000,
      maxAttempts: 2,
      deadlineMs: 12_000,
    });
    expect(profileLookupProviderBudget("tiktok", 12_000).timeoutMs).toBe(8_000);
    expect(profileLookupProviderBudget("youtube", 12_000).timeoutMs).toBe(8_000);

    const seen: Array<{ platform: string; timeoutMs?: number; deadlineMs?: number; maxAttempts?: number }> = [];
    const d = deps({
      instagram: async (_handle, call) => {
        seen.push({
          platform: "instagram",
          timeoutMs: call?.timeoutMs,
          deadlineMs: call?.deadlineMs,
          maxAttempts: call?.maxAttempts,
        });
        return igProfile;
      },
      tiktok: async (_handle, call) => {
        seen.push({
          platform: "tiktok",
          timeoutMs: call?.timeoutMs,
          deadlineMs: call?.deadlineMs,
          maxAttempts: call?.maxAttempts,
        });
        return {
          userId: "1",
          uniqueId: "tik",
          nickname: "Tik",
          isPrivate: false,
          followerCount: 1,
          followingCount: 1,
          videoCount: 1,
          heartCount: 1,
          avatarUrl: "",
        };
      },
      youtube: async (_handle, call) => {
        seen.push({
          platform: "youtube",
          timeoutMs: call?.timeoutMs,
          deadlineMs: call?.deadlineMs,
          maxAttempts: call?.maxAttempts,
        });
        return {
          channelId: "c",
          handle: "chan",
          name: "Chan",
          isVerified: false,
          subscriberCount: 8,
          description: "",
          avatarUrl: "",
        };
      },
    });
    expect((await lookupPublicProfile({ userId: 1, platform: "instagram", handle: "a", deps: d, deadlineMs: 12_000 })).ok).toBe(true);
    expect((await lookupPublicProfile({ userId: 2, platform: "tiktok", handle: "b", deps: d, deadlineMs: 12_000 })).ok).toBe(true);
    expect((await lookupPublicProfile({ userId: 3, platform: "youtube", handle: "c", deps: d, deadlineMs: 12_000 })).ok).toBe(true);
    expect(seen).toEqual([
      { platform: "instagram", timeoutMs: 12_000, deadlineMs: 12_000, maxAttempts: 2 },
      { platform: "tiktok", timeoutMs: 8_000, deadlineMs: 12_000, maxAttempts: 2 },
      { platform: "youtube", timeoutMs: 8_000, deadlineMs: 12_000, maxAttempts: 2 },
    ]);
  });

  it("returns timeout when the provider is still pending at the deadline", async () => {
    const started = Date.now();
    const r = await lookupPublicProfile({
      userId: 1,
      platform: "instagram",
      handle: "slow.creator",
      deadlineMs: 40,
      deps: deps({
        instagram: (_handle, call) =>
          new Promise((_resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("hung")), 10_000);
            const stop = () => {
              clearTimeout(timer);
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            };
            if (call?.signal.aborted) stop();
            else call?.signal.addEventListener("abort", stop, { once: true });
          }),
      }),
    });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("hides counts that did not come from a profile payload", async () => {
    const r = await lookupPublicProfile({
      userId: 1,
      platform: "instagram",
      handle: "snippet",
      deps: deps({
        instagram: async () => ({ ...igProfile, countsKnown: false, followerCount: 0, postCount: 0, followingCount: 0 }),
      }),
    });
    expect(r.ok && r.profile).toMatchObject({
      followerCount: null,
      postCount: null,
      followingCount: null,
      displayName: "Test Kitchen",
    });
  });

  it("returns mirrored thumbnails in the lookup response", async () => {
    const r = await lookupPublicProfile({
      userId: 1,
      platform: "instagram",
      handle: "test.kitchen",
      warmMedia: true,
      deps: deps({
        mirrorAvatar: async () => "https://cdn.example/pic.jpg?r2",
        mirrorThumbnails: async () => new Map([["a1", "https://cdn.example/a1.jpg?r2"]]),
      }),
    });
    expect(r.ok && r.profile.avatarUrl).toBe("https://cdn.example/pic.jpg?r2");
    if (!r.ok) return;
    expect(r.profile.recentPosts[0]?.thumbnailUrl).toBe("https://cdn.example/a1.jpg?r2");
    expect(recallCachedPublicProfile("instagram", "test.kitchen")?.recentPosts[0]?.thumbnailUrl).toBe(
      "https://cdn.example/a1.jpg?r2"
    );
  });

  it("copies the avatar and covers under one budget", async () => {
    const started = Date.now();
    const r = await lookupPublicProfile({
      userId: 1,
      platform: "instagram",
      handle: "test.kitchen",
      warmMedia: true,
      warmMediaMs: 1_000,
      deps: deps({
        mirrorAvatar: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return "https://cdn.example/pic.jpg?r2";
        },
        mirrorThumbnails: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return new Map([["a1", "https://cdn.example/a1.jpg?r2"]]);
        },
      }),
    });
    expect(Date.now() - started).toBeLessThan(350);
    expect(r.ok && r.profile.avatarUrl).toBe("https://cdn.example/pic.jpg?r2");
    if (!r.ok) return;
    expect(r.profile.recentPosts[0]?.thumbnailUrl).toBe("https://cdn.example/a1.jpg?r2");
  });

  it("returns the provider image when mirroring stalls", async () => {
    const started = Date.now();
    const r = await lookupPublicProfile({
      userId: 1,
      platform: "instagram",
      handle: "stall",
      warmMedia: true,
      warmMediaMs: 80,
      deps: deps({
        instagram: async () => ({ ...igProfile, username: "stall" }),
        mirrorAvatar: () => new Promise(() => {}),
        mirrorThumbnails: () => new Promise(() => {}),
      }),
    });
    expect(Date.now() - started).toBeLessThan(180);
    expect(r.ok && r.profile.avatarUrl).toBe("https://cdn.example/pic.jpg");
    if (!r.ok) return;
    expect(r.profile.recentPosts[0]?.thumbnailUrl).toBe("https://cdn.example/a1.jpg");
  });
});

describe("classifyLookupError", () => {
  it("separates timeout, rate limit, private and missing accounts", () => {
    expect(classifyLookupError(new InstagramProviderError("a", { httpStatus: 408, detail: "timeout" }))).toBe("timeout");
    expect(classifyLookupError(new InstagramProviderError("a", { httpStatus: 429, detail: "rate_limit" }))).toBe("rate_limited");
    expect(classifyLookupError(new Error("scrapecreators_request_timeout"))).toBe("timeout");
    expect(classifyLookupError(new Error("YouTube rate limit reached. Please wait."))).toBe("rate_limited");
    expect(classifyLookupError(new InstagramPrivateAccountError("a"))).toBe("private");
    expect(classifyLookupError(new Error('Channel "@x" not found'))).toBe("not_found");
    expect(classifyLookupError(new Error("HTTP 500"))).toBe("error");
  });
});
