import { describe, expect, it } from "vitest";
import {
  coachScriptWithinBudget,
  coachScriptWordCount,
  COACH_LOOP_MAX_TOTAL_WORDS,
  COACH_STORY_MAX_TOTAL_WORDS,
  durationLabelFromWordCount,
} from "@shared/coachScriptLength";

describe("coachScriptLength", () => {
  it("computes story duration from word count", () => {
    expect(durationLabelFromWordCount(120, "story")).toBe("~40 seconds");
    expect(durationLabelFromWordCount(135, "story")).toBe("~45 seconds");
  });

  it("computes loop duration from word count", () => {
    expect(durationLabelFromWordCount(36, "loop")).toBe("~12 seconds");
    expect(durationLabelFromWordCount(45, "loop")).toBe("~15 seconds");
  });

  it("flags scripts over budget", () => {
    const longHook = "word ".repeat(30).trim();
    const longExplain = "word ".repeat(40).trim();
    expect(
      coachScriptWithinBudget(longHook, {
        explain: longExplain,
        illustrate: "",
        teach: "",
        cta: "",
      })
    ).toBe(false);
  });

  it("accepts mockup-sized script", () => {
    const hook = "I worked 9 to 5 for 3 years before my first $1K on the side. Here is what I did differently.";
    const sections = {
      explain:
        "Most people try to save their way out of a job they hate. They cut coffee and still feel stuck because income never moves.",
      illustrate:
        "Month 2 I built one small offer on weekends. First $1K took 11 weeks. Same job. Different leverage.",
      teach: "Earn before you optimize. One skill you can sell beats another month of penny-pinching.",
      cta: "Comment SIDE if you want my 3-shift checklist.",
    };
    const total = coachScriptWordCount(hook, sections);
    expect(total).toBeLessThanOrEqual(COACH_STORY_MAX_TOTAL_WORDS);
    expect(coachScriptWithinBudget(hook, sections, "story")).toBe(true);
  });

  it("enforces loop mode budget", () => {
    const hook = "Still posting daily with zero views?";
    const sections = {
      explain: "The hook is not the problem.",
      illustrate: "I fixed one line and doubled saves.",
      teach: "Delay your payoff.",
      cta: "Send this to a friend who is stuck.",
    };
    expect(coachScriptWordCount(hook, sections)).toBeLessThanOrEqual(COACH_LOOP_MAX_TOTAL_WORDS);
    expect(coachScriptWithinBudget(hook, sections, "loop")).toBe(true);
  });
});
