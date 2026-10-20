import { describe, expect, it } from "vitest";
import {
  selectOnboardingViralStack,
  type OnboardingStackCandidate,
} from "./onboardingViralStack";

const R2 = "https://pub-example.r2.dev";

function row(
  partial: Partial<OnboardingStackCandidate> &
    Pick<OnboardingStackCandidate, "platform" | "id">
): OnboardingStackCandidate {
  return {
    creatorKey: partial.creatorKey ?? partial.id,
    thumbnailUrl: partial.thumbnailUrl ?? `${R2}/thumbs/${partial.id}.jpg`,
    videoUrl: partial.videoUrl === undefined ? `${R2}/reel-videos/${partial.id}.mp4` : partial.videoUrl,
    youtubeVideoId: partial.youtubeVideoId ?? null,
    durationSec: partial.durationSec ?? 20,
    views: partial.views ?? 1000,
    ...partial,
  };
}

describe("selectOnboardingViralStack", () => {
  it("returns two Instagram, two TikTok and one YouTube in stack order", () => {
    const stack = selectOnboardingViralStack([
      row({ platform: "instagram", id: "ig-a", creatorKey: "a", views: 50 }),
      row({ platform: "instagram", id: "ig-b", creatorKey: "b", views: 40 }),
      row({ platform: "instagram", id: "ig-c", creatorKey: "c", views: 10 }),
      row({ platform: "tiktok", id: "tt-a", creatorKey: "ta", videoUrl: `${R2}/tiktok-videos/tt-a.mp4`, views: 30 }),
      row({ platform: "tiktok", id: "tt-b", creatorKey: "tb", videoUrl: `${R2}/tiktok-videos/tt-b.mp4`, views: 20 }),
      row({ platform: "tiktok", id: "tt-c", creatorKey: "tc", videoUrl: `${R2}/tiktok-videos/tt-c.mp4`, views: 5 }),
      row({
        platform: "youtube",
        id: "yt-a",
        creatorKey: "ya",
        videoUrl: null,
        youtubeVideoId: "abcdefghijk",
        views: 9,
      }),
      row({
        platform: "youtube",
        id: "yt-b",
        creatorKey: "yb",
        videoUrl: null,
        youtubeVideoId: "zzzzzzzzzzz",
        views: 1,
      }),
    ]);

    expect(stack.slots.map((slot) => slot.platform)).toEqual([
      "instagram",
      "tiktok",
      "youtube",
      "instagram",
      "tiktok",
    ]);
    expect(stack.slots[0]?.attempts[0]?.id).toBe("ig-a");
    expect(stack.slots[2]?.attempts[0]?.youtubeVideoId).toBe("abcdefghijk");
    expect(stack.slots[2]?.attempts[0]?.videoUrl).toBeNull();
  });

  it("drops expired CDN urls and keeps a same-platform spare", () => {
    const stack = selectOnboardingViralStack([
      row({
        platform: "instagram",
        id: "cdn",
        creatorKey: "a",
        videoUrl: "https://scontent.cdninstagram.com/v/expired.mp4",
        views: 999,
      }),
      row({ platform: "instagram", id: "ig-1", creatorKey: "a", views: 10 }),
      row({ platform: "instagram", id: "ig-2", creatorKey: "b", views: 9 }),
      row({ platform: "instagram", id: "ig-3", creatorKey: "c", views: 8 }),
    ]);

    const ig = stack.slots.filter((slot) => slot.platform === "instagram");
    expect(ig).toHaveLength(2);
    expect(ig[0]?.attempts.map((attempt) => attempt.id)).toEqual(["ig-1", "ig-3"]);
    expect(ig[1]?.attempts.map((attempt) => attempt.id)).toEqual(["ig-2"]);
    expect(JSON.stringify(stack)).not.toContain("cdninstagram");
  });

  it("fills a second video from the same creator when nobody else is playable", () => {
    const stack = selectOnboardingViralStack([
      row({ platform: "tiktok", id: "t1", creatorKey: "only", videoUrl: `${R2}/tiktok-videos/t1.mp4`, views: 5 }),
      row({ platform: "tiktok", id: "t2", creatorKey: "only", videoUrl: `${R2}/tiktok-videos/t2.mp4`, views: 4 }),
    ]);
    expect(stack.slots.map((slot) => slot.attempts[0]?.id)).toEqual(["t1", "t2"]);
  });
});
