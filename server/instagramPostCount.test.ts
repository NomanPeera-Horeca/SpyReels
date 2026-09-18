import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstagramVisiblePostCount } from "./instagramPostCount";

describe("Instagram visible post count", () => {
  beforeEach(() => {
    process.env.SCRAPECREATORS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SCRAPECREATORS_API_KEY;
  });

  it("uses the dedicated exact profile post-count endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          handle: "exact_creator",
          media_count: 487,
          is_estimated: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getInstagramVisiblePostCount("exact_creator");

    expect(result).toEqual({
      count: 487,
      estimated: false,
      source: "instagram_profile_post_count",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/instagram/profile/post-count");
    expect(url.searchParams.get("handle")).toBe("exact_creator");
    expect(url.searchParams.get("allow_estimated")).toBe("false");
  });

  it("falls back to the provider's explicit estimated mode only when exact count is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "estimate_required" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            handle: "huge_creator",
            media_count: 12400,
            is_estimated: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getInstagramVisiblePostCount("huge_creator");

    expect(result).toEqual({
      count: 12400,
      estimated: true,
      source: "instagram_profile_post_count",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(retryUrl.searchParams.get("allow_estimated")).toBe("true");
  });

  it("returns unavailable instead of reusing an ambiguous general-profile count", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "temporarily_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInstagramVisiblePostCount("unavailable_creator")).resolves.toBeNull();
  });
});
