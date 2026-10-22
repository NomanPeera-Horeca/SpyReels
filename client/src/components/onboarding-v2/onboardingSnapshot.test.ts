import { describe, expect, it } from "vitest";
import { step4RightPanel } from "./insightPanel";
import { preferOnboardingSnapshot } from "./onboardingSnapshot";

const panel = {
  confidence: "eligible" as const,
  figure: "1.4x",
  videoUrl: "https://cdn.example/video.mp4",
  thumbnailUrl: "https://cdn.example/thumb.jpg",
};

function snap(input: {
  version?: number;
  items?: { kind: string }[];
  status?: string | null;
  panels?: unknown;
}) {
  return {
    version: input.version ?? 1,
    items: input.items ?? [],
    analysis:
      input.status == null
        ? null
        : { status: input.status, panels: input.panels ?? null },
  };
}

describe("preferOnboardingSnapshot", () => {
  it("keeps saved suggestions when a later empty read arrives for the same version", () => {
    const current = snap({
      items: [{ kind: "goal" }, { kind: "niche" }, { kind: "language" }],
      status: "running",
    });
    const incoming = snap({ status: "running" });
    expect(preferOnboardingSnapshot(current, incoming)).toBe(current);
  });

  it("keeps a finished analysis when an older running read arrives late", () => {
    const current = snap({
      items: [{ kind: "audience" }],
      status: "succeeded",
      panels: { goal: panel, audience: panel, pillars: null },
    });
    const incoming = snap({ status: "running" });
    expect(preferOnboardingSnapshot(current, incoming)).toBe(current);
    expect(
      step4RightPanel({
        status: "succeeded",
        panel,
      })
    ).toEqual({ mode: "insight", showCard: true });
  });

  it("accepts posts and suggestions once the later read has them", () => {
    const current = snap({ status: "running" });
    const incoming = snap({
      items: [{ kind: "niche" }, { kind: "language" }],
      status: "succeeded",
      panels: { goal: panel },
    });
    expect(preferOnboardingSnapshot(current, incoming)).toBe(incoming);
  });

  it("lets a newer version replace saved rows after a user edit", () => {
    const current = snap({ version: 1, items: [{ kind: "niche" }], status: "succeeded" });
    const incoming = snap({ version: 2, status: "succeeded" });
    expect(preferOnboardingSnapshot(current, incoming)).toBe(incoming);
  });
});
