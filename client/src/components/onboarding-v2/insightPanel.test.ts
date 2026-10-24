import { describe, expect, it } from "vitest";
import { insightCardLines, step4RightPanel } from "./insightPanel";

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

describe("insightCardLines", () => {
  const comparison = {
    metric: "views" as const,
    groupLabel: "starting with a question",
    groupCount: 4,
    groupValue: 100,
    baselineLabel: "other videos",
    baselineCount: 8,
    baselineValue: 40,
    definition: "Mean views of the group divided by mean views of the other videos.",
  };

  it("returns no lines when there is no figure", () => {
    expect(
      insightCardLines({
        figure: null,
        headline: "One of your public videos",
        comparison: null,
      })
    ).toBeNull();
    expect(insightCardLines({ figure: "  ", headline: "Unused", comparison: null })).toBeNull();
  });

  it("builds the three lines from the stored views comparison", () => {
    expect(
      insightCardLines({
        figure: "2.4x",
        headline: "Videos starting with a question average 2.4x more views.",
        comparison,
      })
    ).toEqual({
      eyebrow: "Compared with 8 other videos",
      figureLine: "2.4x more views",
      detail: "starting with a question",
    });
  });

  it("uses the engagement wording when that is the stored metric", () => {
    expect(
      insightCardLines({
        figure: "60%",
        headline: "Videos filmed as talking head average 60% higher engagement.",
        comparison: { ...comparison, metric: "engagement_rate", groupLabel: "filmed as talking head" },
      })
    ).toEqual({
      eyebrow: "Compared with 8 other videos",
      figureLine: "60% higher engagement",
      detail: "filmed as talking head",
    });
  });

  it("keeps a stored figure without inventing a comparison sentence", () => {
    expect(
      insightCardLines({
        figure: "2.4x",
        headline: "Videos starting with a question average 2.4x more views.",
        comparison: null,
      })
    ).toEqual({
      eyebrow: null,
      figureLine: "2.4x",
      detail: "Videos starting with a question average 2.4x more views.",
    });
  });
});
