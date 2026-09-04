import { describe, expect, it } from "vitest";
import { markCreatorIdeaGroundTruth } from "@shared/coachIdeaGroundTruth";

describe("typed AI Coach idea ground truth", () => {
  it("marks an ordinary creator-typed idea as authoritative without changing its words", () => {
    const idea = "Show why restaurant owners should measure prep flow before buying equipment.";
    const marked = markCreatorIdeaGroundTruth(idea);

    expect(marked).toContain("Creator's chosen angle");
    expect(marked).toContain("ground truth");
    expect(marked).toContain(idea);
  });

  it("does not double-wrap legacy Spark ground-truth descriptions", () => {
    const legacy = `Creator goal (ground truth — follow even if it mentions a product):\nTell the story of SpyReels.`;
    expect(markCreatorIdeaGroundTruth(legacy)).toBe(legacy);
  });

  it("does not double-wrap an already explicit chosen angle", () => {
    const explicit = `Creator's chosen angle: Explain why menu size hurts kitchen speed.`;
    expect(markCreatorIdeaGroundTruth(explicit)).toBe(explicit);
  });

  it("preserves freedom only where the creator left details unspecified", () => {
    const marked = markCreatorIdeaGroundTruth("A reel about why most restaurant menus are too big");
    expect(marked).toContain("preserve this topic and intent");
    expect(marked).toContain("creatively develop only details the creator did not specify");
  });
});
