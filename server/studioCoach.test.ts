import { describe, expect, it } from "vitest";
import {
  coachScriptIsComplete,
  countWords,
  flattenViralScriptForCopy,
  sectionsFromGenerated,
} from "@shared/coachScriptSections";
import {
  COACH_CAPABILITIES,
  COACH_EXAMPLE_PROMPTS,
  parseStudioPrefillMeta,
  VIRAL_SCRIPT_SECTION_LABELS,
} from "@shared/studioCoachUi";
import {
  resolveCoachIntentRules,
  shouldUseLlmIntentClassifier,
  type CoachToolName,
} from "@shared/studioCoachAgent";

describe("studioCoachUi", () => {
  it("parses valid prefill meta", () => {
    const meta = parseStudioPrefillMeta(
      JSON.stringify({ planCardId: 12, planCardTitle: "Test", planCardDay: 3 })
    );
    expect(meta?.planCardId).toBe(12);
    expect(meta?.planCardDay).toBe(3);
  });

  it("returns null for invalid prefill meta", () => {
    expect(parseStudioPrefillMeta("not-json")).toBeNull();
    expect(parseStudioPrefillMeta(null)).toBeNull();
  });

  it("exposes creator-friendly section labels without HEIT jargon", () => {
    const labels = Object.values(VIRAL_SCRIPT_SECTION_LABELS).join(" ").toLowerCase();
    expect(labels).toContain("hook");
    expect(labels).toContain("takeaway");
    expect(labels).not.toContain("heit");
    expect(labels).not.toContain("explain");
    expect(labels).not.toContain("illustrate");
  });

  it("includes core coach capabilities", () => {
    const ids = COACH_CAPABILITIES.map((c) => c.id);
    expect(ids).toContain("write_script");
    expect(ids).toContain("from_plan");
    expect(ids).toContain("refine_script");
    expect(ids).toContain("hook_ideas");
  });

  it("has example prompts for the command shell", () => {
    expect(COACH_EXAMPLE_PROMPTS.length).toBeGreaterThanOrEqual(4);
    expect(COACH_EXAMPLE_PROMPTS.every((p) => p.length > 20)).toBe(true);
  });
});

describe("coachScriptSections helpers", () => {
  it("detects complete generated scripts", () => {
    const complete = coachScriptIsComplete({
      hook: "Stop scrolling if you want more clients.",
      explain: "Most creators post without a hook.",
      illustrate: "I watched 200 Reels last week.",
      teach: "Lead with the outcome in sentence one.",
      cta: "Comment PLAN and I will send the template.",
    });
    expect(complete).toBe(true);
  });

  it("rejects incomplete generated scripts", () => {
    expect(coachScriptIsComplete({ hook: "Only a hook" })).toBe(false);
  });

  it("flattens scripts with creator-friendly copy labels", () => {
    const text = flattenViralScriptForCopy({
      title: "Client win script",
      hook: "This client lost 22kg.",
      sections: sectionsFromGenerated({
        explain: "Most programs fail because...",
        illustrate: "She tried three diets first.",
        teach: "Track protein, not calories.",
        cta: "Save this for later.",
      }),
    });
    expect(text).toContain("PROBLEM SETUP");
    expect(text).toContain("STORY OR EXAMPLE");
    expect(text).toContain("KEY TAKEAWAY");
    expect(text).not.toContain("HEIT");
    expect(text).not.toContain("ILLUSTRATE");
  });

  it("counts words for library saves", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("studioCoachAgent rules", () => {
  it("routes write_script capability to write_viral_script", () => {
    const action = resolveCoachIntentRules({
      message: "Turn my testimonial into a reel",
      capabilityId: "write_script",
    });
    expect(action.tool).toBe("write_viral_script");
    expect(action.confidence).toBeGreaterThanOrEqual(90);
  });

  it("routes hook requests to generate_hook_ideas when a script exists", () => {
    const action = resolveCoachIntentRules({
      message: "Give me 3 new hook ideas for this script",
      recentScriptId: 42,
    });
    expect(action.tool).toBe("generate_hook_ideas");
    expect(action.scriptId).toBe(42);
  });

  it("routes refine language to refine_script", () => {
    const action = resolveCoachIntentRules({
      message: "Make the hook more contrarian and punchy",
      recentScriptId: 7,
    });
    expect(action.tool).toBe("refine_script");
    expect(action.refineInstruction).toContain("contrarian");
  });

  it("skips LLM for high-confidence default writes", () => {
    const action = resolveCoachIntentRules({
      message: "My client lost 22kg and I want a reel about it",
    });
    expect(action.tool).toBe("write_viral_script");
    expect(shouldUseLlmIntentClassifier(action)).toBe(false);
  });

  it("routes from_plan capability to load_plan_card", () => {
    const action = resolveCoachIntentRules({
      message: "",
      capabilityId: "from_plan",
    });
    expect(action.tool).toBe("load_plan_card");
  });

  const toolNames: CoachToolName[] = [
    "write_viral_script",
    "refine_script",
    "generate_hook_ideas",
    "load_plan_card",
  ];

  it("only exposes supported coach tools", () => {
    for (const cap of COACH_CAPABILITIES) {
      expect(["write_script", "from_plan", "refine_script", "hook_ideas"]).toContain(cap.id);
    }
    expect(toolNames).toHaveLength(4);
  });
});
