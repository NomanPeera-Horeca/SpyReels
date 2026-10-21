import { describe, expect, it } from "vitest";
import { attemptsForStackSlot, onboardingPreviewMedia, ONBOARDING_VERIFIED_POSTERS } from "./onboardingPreviewMedia";
import {
  alignOnboardingStackSlots,
  ONBOARDING_STACK_ORDER,
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

  it("keeps a same-origin preview loop and its poster", () => {
    const media = onboardingPreviewMedia("instagram", "DbZX-NDMfpK");
    expect(media?.videoUrl).toBe("/onboarding-previews/instagram/DbZX-NDMfpK.mp4");
    expect(media?.posterUrl).toBe("/onboarding-previews/instagram/DbZX-NDMfpK.jpg");
    expect(onboardingPreviewMedia("tiktok", "not-a-preview")).toBeNull();

    const stack = selectOnboardingViralStack([
      row({
        platform: "instagram",
        id: "DbZX-NDMfpK",
        creatorKey: "garyvee",
        thumbnailUrl: media?.posterUrl,
        videoUrl: media?.videoUrl,
        views: 10,
      }),
    ]);

    expect(stack.slots[0]?.attempts[0]?.videoUrl).toBe(media?.videoUrl);
    expect(stack.slots[0]?.attempts[0]?.thumbnailUrl).toBe(media?.posterUrl);
  });

  it("keeps the YouTube position empty when that slot is missing", () => {
    const aligned = alignOnboardingStackSlots([
      { platform: "instagram", attempts: [{ id: "ig-1", thumbnailUrl: `${R2}/a.jpg`, videoUrl: `${R2}/a.mp4`, youtubeVideoId: null }] },
      { platform: "tiktok", attempts: [{ id: "tt-1", thumbnailUrl: `${R2}/b.jpg`, videoUrl: `${R2}/b.mp4`, youtubeVideoId: null }] },
      { platform: "instagram", attempts: [{ id: "ig-2", thumbnailUrl: `${R2}/c.jpg`, videoUrl: `${R2}/c.mp4`, youtubeVideoId: null }] },
      { platform: "tiktok", attempts: [{ id: "tt-2", thumbnailUrl: `${R2}/d.jpg`, videoUrl: `${R2}/d.mp4`, youtubeVideoId: null }] },
    ]);
    expect(aligned.map((slot) => slot?.platform ?? null)).toEqual([
      "instagram",
      "tiktok",
      null,
      "instagram",
      "tiktok",
    ]);
    expect(aligned[3]?.attempts[0]?.id).toBe("ig-2");
  });

  it("paints a verified thumbnail in every position before the catalog responds", () => {
    expect(ONBOARDING_VERIFIED_POSTERS).toHaveLength(5);
    const posters = ONBOARDING_STACK_ORDER.map((_, index) => attemptsForStackSlot(null, index)[0]);
    expect(posters.map((attempt) => attempt?.thumbnailUrl)).toEqual(
      ONBOARDING_VERIFIED_POSTERS.map((attempt) => attempt.thumbnailUrl)
    );
    expect(posters.every((attempt) => (attempt?.thumbnailUrl ?? "").startsWith("/onboarding-previews/"))).toBe(true);
    const youtube = attemptsForStackSlot(null, 2)[0];
    expect(youtube?.youtubeVideoId).toBe("f7y2XikE7sY");
    expect(youtube?.thumbnailUrl).toBe("/onboarding-previews/youtube/f7y2XikE7sY.jpg");
    expect(youtube?.videoUrl).toBeNull();
  });

  it("keeps the verified YouTube poster when the catalog slot has no thumbnail", () => {
    const attempts = attemptsForStackSlot(
      {
        platform: "youtube",
        attempts: [{ id: "missing", thumbnailUrl: "", videoUrl: null, youtubeVideoId: "missing1" }],
      },
      2
    );
    expect(attempts[0]?.thumbnailUrl).toBe("/onboarding-previews/youtube/f7y2XikE7sY.jpg");
    expect(attempts[0]?.youtubeVideoId).toBe("f7y2XikE7sY");
  });
});
