import { describe, expect, it } from "vitest";
import type { CarouselPlanningIR } from "./carouselPlanningIR";
import {
  canUseStoryNarrativeFamily,
  isStoryNarrativeSlide,
  resolveStoryNarrativeRenderTreatment,
  resolveStoryNarrativeTreatment,
} from "./carouselStoryFamily";
import { canUseBreakdownListicleFamily } from "./carouselBreakdownFamily";

function storyPlanningIR(
  overrides?: Partial<CarouselPlanningIR>
): CarouselPlanningIR {
  return {
    version: 1,
    topic: "I almost killed my business by chasing growth too early",
    audience: "founders",
    goal: "shares",
    contract: {
      source: "none",
      kind: "open",
      count: null,
      itemType: null,
      locked: false,
    },
    strategy: {
      angleType: "story",
      hook: "Growth nearly broke the business",
      corePromise: "The moment I realized growth was the wrong goal",
      centralInsight: "Growth without operational readiness compounds fragility",
      preferredFamily: "story",
      ctaDirection: "Share the lesson",
    },
    beats: [
      { id: "beat_01", position: 1, role: "cover", objective: "Open the loop", visualIntent: "photo", sequence: null },
      { id: "beat_02", position: 2, role: "context", objective: "Set up the chase", visualIntent: "photo", sequence: null },
      { id: "beat_03", position: 3, role: "problem", objective: "Show the cost", visualIntent: "text", sequence: null },
      { id: "beat_04", position: 4, role: "insight", objective: "Reveal the turning point", visualIntent: "photo", sequence: null },
      { id: "beat_05", position: 5, role: "summary", objective: "Land the lesson", visualIntent: "text", sequence: null },
      { id: "beat_06", position: 6, role: "closing", objective: "Resolve and close", visualIntent: "text", sequence: null },
    ],
    research: {
      mode: "none",
      claimRisk: "low",
      evidenceRequirements: [],
      prohibitedClaims: [],
    },
    ...overrides,
  };
}

describe("Story narrative family", () => {
  it("routes open Story strategy into Story family", () => {
    expect(canUseStoryNarrativeFamily(storyPlanningIR())).toBe(true);
  });

  it("does not steal enumerated/listicle contracts", () => {
    const base = storyPlanningIR();
    const enumerated = storyPlanningIR({
      contract: {
        source: "user",
        kind: "enumerated",
        count: 5,
        itemType: "mistakes",
        locked: true,
      },
    });
    expect(base.contract.kind).toBe("open");
    expect(canUseStoryNarrativeFamily(enumerated)).toBe(false);
  });

  it("does not accidentally route the Story fixture into Breakdown", () => {
    expect(canUseBreakdownListicleFamily(storyPlanningIR())).toBe(false);
  });

  it("recognizes Story render metadata without depending on legacy layout ids", () => {
    expect(
      isStoryNarrativeSlide({ composition: { family: "story_narrative" } })
    ).toBe(true);
    expect(
      isStoryNarrativeSlide({ composition: { family: "breakdown_listicle" } })
    ).toBe(false);
  });

  it("maps semantic tension, turning point, insight and closing treatments", () => {
    expect(
      resolveStoryNarrativeTreatment({
        archetype: "text_focus",
        semanticRole: "problem",
        position: 3,
        totalSlides: 7,
      })
    ).toBe("tension_statement");
    expect(
      resolveStoryNarrativeTreatment({
        archetype: "text_focus",
        semanticRole: "insight",
        position: 4,
        totalSlides: 7,
      })
    ).toBe("turning_point");
    expect(
      resolveStoryNarrativeTreatment({
        archetype: "text_focus",
        semanticRole: "summary",
        position: 6,
        totalSlides: 7,
      })
    ).toBe("insight_reveal");
    expect(
      resolveStoryNarrativeTreatment({
        archetype: "closing_focus",
        semanticRole: "closing",
        position: 7,
        totalSlides: 7,
      })
    ).toBe("story_closing");
  });

  it("degrades image-dependent scenes to semantic text treatments", () => {
    expect(
      resolveStoryNarrativeRenderTreatment({
        treatment: "story_scene",
        semanticRole: "problem",
      })
    ).toBe("tension_statement");
    expect(
      resolveStoryNarrativeRenderTreatment({
        treatment: "image_text_split",
        semanticRole: "insight",
      })
    ).toBe("insight_reveal");
    expect(
      resolveStoryNarrativeRenderTreatment({
        treatment: "story_scene",
        semanticRole: "context",
        imageUrl: "https://images.example.com/scene.jpg",
      })
    ).toBe("story_scene");
    expect(
      resolveStoryNarrativeRenderTreatment({
        treatment: "story_scene",
        semanticRole: "context",
      })
    ).toBe("story_scene");
  });
});
