import { describe, expect, it } from "vitest";
import { continueContentAgentAction } from "./contentAgentClarification";
import type { ContentAgentAction } from "./contentAgentTools";

describe("continueContentAgentAction", () => {
  it("keeps a schedule clarification inside schedule_filming", () => {
    const action: ContentAgentAction = {
      tool: "schedule_filming",
      confidence: 98,
      source: "rule",
      scriptId: 42,
      scheduleText: "schedule this",
    };

    const next = continueContentAgentAction(action, " Friday at 10 ");

    expect(next.tool).toBe("schedule_filming");
    expect(next.scriptId).toBe(42);
    expect(next.scheduleText).toBe("schedule this Friday at 10");
    expect(next.confidence).toBe(100);
  });

  it("keeps date and time when a second clarification supplies filming setup", () => {
    const action: ContentAgentAction = {
      tool: "schedule_filming",
      confidence: 100,
      source: "rule",
      scriptId: 42,
      scheduleText: "schedule this Friday at 10 AM",
    };

    const next = continueContentAgentAction(action, "in my office");

    expect(next.scheduleText).toBe("schedule this Friday at 10 AM in my office");
    expect(next.scriptId).toBe(42);
  });

  it("keeps a missing Remake URL inside remake_social_video", () => {
    const action: ContentAgentAction = {
      tool: "remake_social_video",
      confidence: 90,
      source: "llm",
    };

    const next = continueContentAgentAction(
      action,
      "https://www.instagram.com/reel/example/"
    );

    expect(next.tool).toBe("remake_social_video");
    expect(next.sourceUrl).toBe("https://www.instagram.com/reel/example/");
    expect(next.source).toBe("rule");
  });

  it("keeps a refine clarification scoped to the current script", () => {
    const action: ContentAgentAction = {
      tool: "refine_script",
      confidence: 72,
      source: "llm",
      scriptId: 99,
    };

    const next = continueContentAgentAction(action, "Make it more playful");

    expect(next.tool).toBe("refine_script");
    expect(next.scriptId).toBe(99);
    expect(next.refineInstruction).toBe("Make it more playful");
  });
});
