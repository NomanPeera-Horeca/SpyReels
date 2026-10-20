import { describe, expect, it } from "vitest";
import { step4RightPanel } from "./insightPanel";

const media = {
  confidence: "eligible" as const,
  figure: "2.4x",
  videoUrl: "https://cdn.example/video.mp4",
  thumbnailUrl: "https://cdn.example/thumb.jpg",
};

describe("step4RightPanel", () => {
  it("keeps the public profile on screen while analysis is still running", () => {
    expect(step4RightPanel({ status: "running", panel: media })).toEqual({ mode: "profile" });
    expect(step4RightPanel({ status: "queued", panel: null })).toEqual({ mode: "profile" });
  });

  it("shows the insight card only for a calculated result with creator media", () => {
    expect(step4RightPanel({ status: "succeeded", panel: media })).toEqual({
      mode: "insight",
      showCard: true,
    });
  });

  it("hides the card when the comparison is not eligible, and still shows the video", () => {
    expect(
      step4RightPanel({
        status: "succeeded",
        panel: { ...media, confidence: "qualitative", figure: null },
      })
    ).toEqual({ mode: "insight", showCard: false });
  });

  it("hides the card after a failed analysis and falls back to the profile when there is no media", () => {
    expect(step4RightPanel({ status: "failed", panel: media })).toEqual({
      mode: "insight",
      showCard: false,
    });
    expect(
      step4RightPanel({
        status: "failed",
        panel: { ...media, videoUrl: null, thumbnailUrl: null },
      })
    ).toEqual({ mode: "profile" });
    expect(
      step4RightPanel({
        status: "succeeded",
        panel: { ...media, videoUrl: "  ", thumbnailUrl: null },
      })
    ).toEqual({ mode: "profile" });
  });
});
