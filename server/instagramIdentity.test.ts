import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTAGRAM_RESTRICTED_MEDIA_MESSAGE,
  InstagramHandleNotFoundError,
  InstagramProviderError,
  InstagramRestrictedMediaError,
  buildInstagramUserReelsQuery,
  fetchProfile,
  hasInstagramMediaRestriction,
  resolveInstagramIdentity,
  scrapeReels,
} from "./instagram";

type FetchHandler = (
  path: string,
  url: URL
) => { status: number; body: unknown };

function installFetchMock(handler: FetchHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const { status, body } = handler(url.pathname, url);
    return {
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function graphProfile(
  username: string,
  userId: string,
  extras?: { gating?: { title: string; description: string } }
) {
  return {
    data: {
      user: {
        id: userId,
        username,
        is_private: false,
        full_name: "Sista Media",
        biography: "Media studio",
        profile_pic_url: "https://example.com/pic.jpg",
        edge_followed_by: { count: 3400 },
        edge_follow: { count: 200 },
        edge_owner_to_timeline_media: { count: 40 },
        is_verified: false,
        category_name: "Digital creator",
        external_url: "",
        ...(extras?.gating ? { gating: extras.gating } : {}),
      },
    },
  };
}

function emptyReelsPage() {
  return {
    success: true,
    items: [],
    paging_info: { more_available: false },
  };
}

function basicProfile(username: string, userId: string) {
  return {
    id: userId,
    pk: userId,
    username,
    is_private: false,
    follower_count: 3400,
    full_name: "Sista Media",
    biography: "Media studio",
    profile_pic_url: "https://example.com/pic.jpg",
    media_count: 40,
    following_count: 200,
    is_verified: false,
    category: "Digital creator",
    external_url: "",
  };
}

function reelsPage(shortcode = "REEL1") {
  return {
    items: [
      {
        media: {
          code: shortcode,
          caption: { text: "Hello" },
          play_count: 1200,
          like_count: 80,
          comment_count: 4,
          taken_at: Math.floor(Date.now() / 1000),
          image_versions2: { candidates: [{ url: "https://example.com/t.jpg" }] },
          video_versions: [{ url: "https://example.com/v.mp4" }],
          video_duration: 12,
        },
      },
    ],
    paging_info: { more_available: false, max_id: null },
  };
}

describe("Instagram identity resolution", () => {
  beforeEach(() => {
    process.env.SCRAPECREATORS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves from direct profile lookup and captures canonical username + user id", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 200, body: graphProfile("Sista.Media_", "998877") };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const identity = await resolveInstagramIdentity("sista.media_");
    expect(identity.resolutionMethod).toBe("profile_handle");
    expect(identity.fallbackUsed).toBe(false);
    expect(identity.username).toBe("Sista.Media_");
    expect(identity.userId).toBe("998877");
    expect(identity.followerCount).toBe(3400);
    expect(identity.mediaRestricted).toBe(false);
  });

  it("recovers from profile not_found via native search exact match", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return {
          status: 200,
          body: { error: "not_found", errorStatus: 404, message: "Profile is restricted" },
        };
      }
      if (path === "/v1/instagram/search") {
        return {
          status: 200,
          body: {
            success: true,
            data: {
              users: [
                { id: "111", username: "sista.media", full_name: "Other" },
                { id: "998877", username: "sista.media_", full_name: "Sista Media" },
              ],
            },
          },
        };
      }
      if (path === "/v1/instagram/basic-profile") {
        return { status: 200, body: basicProfile("sista.media_", "998877") };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const identity = await resolveInstagramIdentity("@Sista.Media_");
    expect(identity.resolutionMethod).toBe("native_search");
    expect(identity.fallbackUsed).toBe(true);
    expect(identity.username).toBe("sista.media_");
    expect(identity.userId).toBe("998877");
    expect(identity.followerCount).toBe(3400);
  });

  it("does not guess when search only returns similar usernames", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 404, body: { error: "not_found" } };
      }
      if (path === "/v1/instagram/search") {
        return {
          status: 200,
          body: {
            data: {
              users: [
                { id: "1", username: "sista.media" },
                { id: "2", username: "sistamedia_" },
              ],
            },
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    await expect(resolveInstagramIdentity("sista.media_")).rejects.toBeInstanceOf(
      InstagramHandleNotFoundError
    );
  });

  it("classifies confirmed missing accounts as handle_not_found", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 404, body: { error: "not_found" } };
      }
      if (path === "/v1/instagram/search") {
        return { status: 200, body: { data: { users: [] } } };
      }
      throw new Error(`unexpected path ${path}`);
    });

    await expect(resolveInstagramIdentity("definitely.missing.zz")).rejects.toBeInstanceOf(
      InstagramHandleNotFoundError
    );
  });

  it("does not classify a temporary provider failure as handle_not_found", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 503, body: { error: "upstream_unavailable" } };
      }
      throw new Error(`unexpected path ${path}`);
    });

    vi.useFakeTimers();
    const pending = resolveInstagramIdentity("sista.media_");
    const expectation = expect(pending).rejects.toBeInstanceOf(InstagramProviderError);
    await vi.runAllTimersAsync();
    await expectation;
    await expect(pending).rejects.not.toBeInstanceOf(InstagramHandleNotFoundError);
  });

  it("resolves a recently renamed handle to the canonical username and stable id", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 404, body: { error: "not_found" } };
      }
      if (path === "/v1/instagram/search") {
        return {
          status: 200,
          body: {
            data: {
              users: [{ id: "554433", username: "Sista.Media_", full_name: "Sista Media" }],
            },
          },
        };
      }
      if (path === "/v1/instagram/basic-profile") {
        return { status: 200, body: basicProfile("sista.media_", "554433") };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const identity = await resolveInstagramIdentity("sista.media_");
    expect(identity.userId).toBe("554433");
    expect(identity.username).toBe("sista.media_");
    expect(identity.resolutionMethod).toBe("native_search");
  });

  it("keeps fetchProfile on the direct lookup path for existing callers", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 200, body: graphProfile("owner", "12345") };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const profile = await fetchProfile("owner");
    expect(profile.username).toBe("owner");
    expect(profile.userId).toBe("12345");
    expect(profile.followerCount).toBe(3400);
  });

  it("fetches reels by numeric user_id after a successful identity resolve", async () => {
    const fetchMock = installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 200, body: graphProfile("sista.media_", "998877") };
      }
      if (path === "/v1/instagram/user/reels") {
        return { status: 200, body: reelsPage("IDREEL") };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await scrapeReels("sista.media_", 90);
    expect(result.canonicalUsername).toBe("sista.media_");
    expect(result.instagramUserId).toBe("998877");
    expect(result.reels).toHaveLength(1);
    expect(result.reels[0].shortcode).toBe("IDREEL");

    const reelsUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("/v1/instagram/user/reels"));
    expect(reelsUrl).toContain("user_id=998877");
    expect(reelsUrl).not.toContain("handle=");
  });

  it("classifies empty reels plus gating evidence as restricted media", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return {
          status: 200,
          body: graphProfile("sista.media_", "35299539948", {
            gating: {
              title: "Restricted profile",
              description: "You must be 18 years old and log in to see their posts.",
            },
          }),
        };
      }
      if (path === "/v1/instagram/user/reels") {
        return { status: 200, body: emptyReelsPage() };
      }
      throw new Error(`unexpected path ${path}`);
    });

    try {
      await scrapeReels("sista.media_", 90);
      throw new Error("expected restricted media error");
    } catch (error) {
      expect(error).toBeInstanceOf(InstagramRestrictedMediaError);
      expect(error).not.toBeInstanceOf(InstagramHandleNotFoundError);
      expect(error).not.toBeInstanceOf(InstagramProviderError);
      expect(error).toMatchObject({
        failureClass: "media_restricted",
        message: INSTAGRAM_RESTRICTED_MEDIA_MESSAGE,
      });
    }
  });

  it("keeps the provider-flake path when empty reels have no gating evidence", async () => {
    const fetchMock = installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 200, body: graphProfile("garyvee", "2700692569") };
      }
      if (path === "/v1/instagram/user/reels") {
        return { status: 200, body: emptyReelsPage() };
      }
      if (path === "/v1/instagram/basic-profile") {
        return { status: 200, body: basicProfile("garyvee", "2700692569") };
      }
      throw new Error(`unexpected path ${path}`);
    });

    vi.useFakeTimers();
    const pending = scrapeReels("garyvee", 90);
    const expectation = pending.then((result) => {
      expect(result.reels).toHaveLength(0);
      expect(result.totalParsedItems).toBe(0);
      expect(result.followerCount).toBe(3400);
      expect(result.instagramUserId).toBe("2700692569");
    });
    await vi.runAllTimersAsync();
    await expectation;

    const reelsCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/v1/instagram/user/reels")
    );
    expect(reelsCalls.length).toBeGreaterThan(1);
  });

  it("detects gating only on the follow-up basic-profile check", async () => {
    installFetchMock((path) => {
      if (path === "/v1/instagram/profile") {
        return { status: 200, body: graphProfile("sista.media_", "35299539948") };
      }
      if (path === "/v1/instagram/user/reels") {
        return { status: 200, body: emptyReelsPage() };
      }
      if (path === "/v1/instagram/basic-profile") {
        return {
          status: 200,
          body: {
            ...basicProfile("sista.media_", "35299539948"),
            gating: {
              title: "Restricted profile",
              description: "This profile is age-gated. Log in to continue.",
            },
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    vi.useFakeTimers();
    const pending = scrapeReels("sista.media_", 90);
    const expectation = expect(pending).rejects.toBeInstanceOf(
      InstagramRestrictedMediaError
    );
    await vi.runAllTimersAsync();
    await expectation;
  });
});

describe("hasInstagramMediaRestriction", () => {
  it("requires positive gating or restricted_by_viewer evidence", () => {
    expect(hasInstagramMediaRestriction({ items: [], success: true })).toBe(false);
    expect(
      hasInstagramMediaRestriction({
        data: { user: { media_count: 0, has_clips: true } },
      })
    ).toBe(false);
    expect(
      hasInstagramMediaRestriction({
        data: { user: { restricted_by_viewer: true } },
      })
    ).toBe(true);
    expect(
      hasInstagramMediaRestriction({
        gating: {
          title: "Restricted profile",
          description: "You must be 18 years old and log in.",
        },
      })
    ).toBe(true);
  });
});

describe("buildInstagramUserReelsQuery", () => {
  it("prefers user_id when present", () => {
    expect(
      buildInstagramUserReelsQuery({ handle: "jane", userId: "2700692569" }, null)
    ).toEqual({ user_id: "2700692569" });
  });

  it("falls back to handle when no user id is available", () => {
    expect(buildInstagramUserReelsQuery({ handle: "jane" }, "cursor")).toEqual({
      handle: "jane",
      max_id: "cursor",
    });
  });
});
