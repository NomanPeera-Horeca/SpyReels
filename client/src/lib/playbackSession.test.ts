import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLAYBACK_REFRESH_TIMEOUT_MS,
  PlaybackSession,
  playbackResultIsCurrent,
} from "./playbackSession";
import { resolveGridPlayableUrl } from "./resolveGridPlayableUrl";
import { cycleModalTab, lightboxMediaPhase, lockBodyScroll } from "./lightboxA11y";

const FLOWER = "https://cdn.example/flower.mp4";
const LATE = "https://scontent.cdninstagram.com/v/late.mp4";

afterEach(() => {
  vi.useRealTimers();
});

describe("PlaybackSession", () => {
  it("returns a ready URL that arrives before the timeout", async () => {
    const session = new PlaybackSession();
    const result = await session.run(async () => FLOWER, 50);
    expect(result).toEqual({ status: "ready", value: FLOWER, generation: session.generation });
    expect(playbackResultIsCurrent(session.generation, result)).toBe(true);
  });

  it("fails at the timeout, aborts the request, and ignores a later URL", async () => {
    vi.useFakeTimers();
    const session = new PlaybackSession();
    let release: (url: string) => void = () => undefined;
    let aborted = false;
    const pending = session.run(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          release = (url) => resolve(url);
        }),
      PLAYBACK_REFRESH_TIMEOUT_MS
    );

    await vi.advanceTimersByTimeAsync(PLAYBACK_REFRESH_TIMEOUT_MS);
    const result = await pending;

    expect(result).toEqual({
      status: "failed",
      reason: "timeout",
      generation: session.generation,
    });
    expect(aborted).toBe(true);
    expect(playbackResultIsCurrent(session.generation, result)).toBe(true);

    release(LATE);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(playbackResultIsCurrent(session.generation, result)).toBe(true);
    expect(result.status).toBe("failed");
  });

  it("drops a timed-out generation once the player is cancelled", async () => {
    vi.useFakeTimers();
    const session = new PlaybackSession();
    const pending = session.run(() => new Promise<string | null>(() => undefined));
    const generation = session.generation;
    await vi.advanceTimersByTimeAsync(PLAYBACK_REFRESH_TIMEOUT_MS);
    const failed = await pending;
    expect(failed.status).toBe("failed");

    const lateReady = {
      status: "ready" as const,
      value: LATE,
      generation,
    };
    expect(playbackResultIsCurrent(session.generation, lateReady)).toBe(true);
    session.cancel();
    expect(playbackResultIsCurrent(session.generation, lateReady)).toBe(false);
    expect(playbackResultIsCurrent(session.generation, failed)).toBe(false);
  });

  it("marks an earlier attempt stale when a newer one starts", async () => {
    const session = new PlaybackSession();
    let releaseOld: ((url: string | null) => void) | null = null;
    const first = session.run(
      (signal) =>
        new Promise((resolve) => {
          releaseOld = (url) => resolve(signal.aborted ? null : url);
        })
    );
    const second = session.run(async () => FLOWER);
    releaseOld?.("https://cdn.example/old.mp4");

    expect(await first).toMatchObject({ status: "stale" });
    expect(await second).toEqual({
      status: "ready",
      value: FLOWER,
      generation: session.generation,
    });
    expect(playbackResultIsCurrent(session.generation, await first)).toBe(false);
  });

  it("returns stale and aborts when the attempt is cancelled", async () => {
    const session = new PlaybackSession();
    let aborted = false;
    const pending = session.run(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve(null);
          });
        })
    );
    const generation = session.generation;
    session.cancel();
    const result = await pending;
    expect(result.status).toBe("stale");
    expect(aborted).toBe(true);
    expect(playbackResultIsCurrent(session.generation, { ...result, generation })).toBe(false);
  });

  it("fails when the loader has no URL, without treating that as a timeout", async () => {
    const session = new PlaybackSession();
    const result = await session.run(async () => null, 50);
    expect(result).toEqual({
      status: "failed",
      reason: "unavailable",
      generation: session.generation,
    });
  });
});

describe("resolveGridPlayableUrl", () => {
  const signal = new AbortController().signal;
  const refreshInstagram = vi.fn(async () => ({ videoUrl: FLOWER }));
  const refreshTikTok = vi.fn(async () => ({ videoUrl: FLOWER }));

  function resolve(
    overrides: Partial<Parameters<typeof resolveGridPlayableUrl>[0]> = {}
  ) {
    return resolveGridPlayableUrl({
      platform: "instagram",
      videoUrl: null,
      shortcode: "ABCDE12345",
      signal,
      refreshInstagram,
      refreshTikTok,
      ...overrides,
    });
  }

  it("plays a stable file without calling a provider", async () => {
    refreshInstagram.mockClear();
    const result = await resolve({
      videoUrl: "https://media.example.r2.dev/reel.mp4",
    });
    expect(result).toEqual({
      url: "https://media.example.r2.dev/reel.mp4",
      refreshed: false,
    });
    expect(refreshInstagram).not.toHaveBeenCalled();
  });

  it("refreshes an expired Instagram CDN URL with the reel id", async () => {
    refreshInstagram.mockClear();
    const result = await resolve({
      videoUrl: "https://scontent.cdninstagram.com/v/expired.mp4",
      reelId: 9,
    });
    expect(refreshInstagram).toHaveBeenCalledWith(
      { shortcode: "ABCDE12345", reelId: 9 },
      signal
    );
    expect(result).toEqual({ url: FLOWER, refreshed: true });
  });

  it("returns null when Instagram refresh is restricted or empty", async () => {
    refreshInstagram.mockResolvedValueOnce({ videoUrl: "  " });
    expect(await resolve({ videoUrl: "" })).toBeNull();
    refreshInstagram.mockRejectedValueOnce(new Error("Could not retrieve a fresh video URL"));
    expect(await resolve({ videoUrl: "https://video.fbcdn.net/v/old.mp4" })).toBeNull();
  });

  it("refreshes TikTok from the page URL and does not send a reel id", async () => {
    refreshTikTok.mockClear();
    const page = "https://www.tiktok.com/@scout/video/123";
    const result = await resolve({
      platform: "tiktok",
      shortcode: null,
      videoUrl: "https://v16.tiktokcdn.com/expired.mp4",
      videoPageUrl: page,
    });
    expect(refreshTikTok).toHaveBeenCalledWith({ videoPageUrl: page }, signal);
    expect(result).toEqual({ url: FLOWER, refreshed: true });
  });

  it("drops a URL that arrives after the attempt was aborted", async () => {
    const controller = new AbortController();
    refreshInstagram.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            controller.abort();
            resolve({ videoUrl: LATE });
          }, 0);
        })
    );
    const result = await resolve({
      videoUrl: "https://scontent.cdninstagram.com/v/expired.mp4",
      signal: controller.signal,
    });
    expect(result).toBeNull();
  });
});

describe("lightbox recovery and focus", () => {
  it("shows the failure state while a refresh is still marked preparing", () => {
    expect(
      lightboxMediaPhase({
        videoFailed: true,
        isPreparing: true,
        playbackSettled: true,
        hasPlayableSrc: false,
      })
    ).toBe("failed");
  });

  it("keeps the spinner only before the attempt settles", () => {
    expect(
      lightboxMediaPhase({
        videoFailed: false,
        isPreparing: true,
        playbackSettled: false,
        hasPlayableSrc: false,
      })
    ).toBe("loading");
  });

  it("shows the video once a URL is ready", () => {
    expect(
      lightboxMediaPhase({
        videoFailed: false,
        isPreparing: false,
        playbackSettled: true,
        hasPlayableSrc: true,
      })
    ).toBe("video");
  });

  it("cycles Tab inside the dialog and pulls outside focus back in", () => {
    const items = ["close", "retry", "watch"];
    expect(cycleModalTab(items, "watch", false)).toBe("close");
    expect(cycleModalTab(items, "close", true)).toBe("watch");
    expect(cycleModalTab(items, "retry", false)).toBeNull();
    expect(cycleModalTab(items, null, false)).toBe("close");
    expect(cycleModalTab(items, null, true)).toBe("watch");
  });

  it("restores the previous overflow when the lock is released", () => {
    const body = { style: { overflow: "auto" } };
    const unlock = lockBodyScroll(body);
    expect(body.style.overflow).toBe("hidden");
    unlock();
    unlock();
    expect(body.style.overflow).toBe("auto");
  });
});
