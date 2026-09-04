import { describe, expect, it } from "vitest";
import { classifyCoachIdeaSpecificity } from "@shared/coachIdeaSpecificity";
import {
  COACH_HYBRID_BENCHMARK_FIXTURES,
  COACH_HYBRID_FALSE_POSITIVE_PROBES,
} from "@shared/coachHybridBenchmarkFixtures";

describe("coach idea specificity classifier", () => {
  it("does not use length alone: a long vague paragraph stays vague or moderate", () => {
    const longVague =
      "I have been thinking a lot about restaurant menus lately and I want a Reel that covers the whole topic in a useful way. It should be good, feel premium, and do not make it boring. I also want people to understand why menus matter in general and maybe mention guests, owners, and kitchens if that helps. Please make it comprehensive.";
    expect(classifyCoachIdeaSpecificity(longVague).classification).not.toBe("highly_specific");
  });

  it("can mark a short complete brief as highly specific", () => {
    const short =
      'Talking-head Reel arguing owners should cut menu size. Open with "Your kitchen doesn\'t need another employee." Do not discuss food cost. End by telling them to audit menu complexity.';
    const result = classifyCoachIdeaSpecificity(short);
    expect(result.features.topic).toBe(true);
    expect(result.features.stance).toBe(true);
    expect(result.features.hook).toBe(true);
    expect(result.features.constraints).toBe(true);
    expect(result.classification).toBe("highly_specific");
  });

  it("classifies the user vague examples as vague", () => {
    const ideas = [
      "make a Reel about restaurant menus",
      "make content about burnout",
      "I sell candles and need content",
      "make something about restaurant equipment",
      "help me talk about social media growth",
    ];
    for (const idea of ideas) {
      expect(classifyCoachIdeaSpecificity(idea).classification, idea).toBe("vague");
    }
  });

  it("classifies the user moderate examples as moderately specific", () => {
    const ideas = [
      "explain why oversized restaurant menus create operational problems",
      "show creators why studying winning hooks matters",
      "explain why restaurants should measure prep flow before buying equipment",
    ];
    for (const idea of ideas) {
      expect(classifyCoachIdeaSpecificity(idea).classification, idea).toBe("moderately_specific");
    }
  });

  it("classifies complete briefs as highly specific", () => {
    const ideas = [
      "Tell the story of SpyReels as a tool that helps creators find useful patterns in viral Reels. Do not say 'copy competitors' and do not name SpyReels until the final sentence.",
      'Make a 30-second talking-head Reel arguing that restaurant owners should reduce menu size before increasing kitchen staff. Open with "Your kitchen doesn\'t need another employee." Do not discuss food cost. End by telling them to audit their menu complexity.',
      "Make a talking-head Reel explaining that restaurant owners should measure prep flow before buying equipment. Do not discuss financing or equipment pricing. Open by challenging the idea that new equipment automatically fixes a slow kitchen.",
    ];
    for (const idea of ideas) {
      expect(classifyCoachIdeaSpecificity(idea).classification, idea).toBe("highly_specific");
    }
  });

  it("never upgrades gold vague or moderate fixtures to highly specific", () => {
    const unsafe = COACH_HYBRID_BENCHMARK_FIXTURES.filter(
      (fixture) => fixture.goldSpecificity !== "highly_specific"
    ).filter((fixture) => classifyCoachIdeaSpecificity(fixture.rawIdea).classification === "highly_specific");
    expect(unsafe.map((fixture) => fixture.id)).toEqual([]);
  });

  it("keeps false-positive probes out of highly_specific", () => {
    for (const probe of COACH_HYBRID_FALSE_POSITIVE_PROBES) {
      expect(classifyCoachIdeaSpecificity(probe.rawIdea).classification, probe.id).not.toBe(probe.mustNotBe);
    }
  });

  it("returns structured features and a conservative reason when strategy should still run", () => {
    const result = classifyCoachIdeaSpecificity("explain why restaurants should measure prep flow before buying equipment");
    expect(result.features.topic).toBe(true);
    expect(result.features.stance).toBe(true);
    expect(result.features.hook).toBe(false);
    expect(result.features.format).toBe(false);
    expect(result.classification).toBe("moderately_specific");
    expect(result.reason).toMatch(/Run strategy/i);
  });
});
