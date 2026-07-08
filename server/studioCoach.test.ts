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
import { buildConvertRoughScriptPrompt, buildHookVariationsPrompt } from "@shared/studioHeit";
import { parseCoachHookVariations } from "@shared/coachScriptSections";
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

  it("rejects scripts with duplicate teach and cta", () => {
    expect(
      coachScriptIsComplete({
        hook: "Stop scrolling.",
        explain: "Problem setup here.",
        illustrate: "Story here.",
        teach: "Drop a comment below.",
        cta: "Drop a comment below.",
      })
    ).toBe(false);
  });

  it("rejects scripts missing illustrate", () => {
    expect(
      coachScriptIsComplete({
        hook: "Stop scrolling.",
        explain: "Problem setup here.",
        teach: "One takeaway.",
        cta: "Comment PLAN.",
      })
    ).toBe(false);
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

  it("builds stacked hook variation prompt with JSON object shape", () => {
    const prompt = buildHookVariationsPrompt(
      "Hook: I went from 200 views to 14k.\nBody: Most creators skip frame 0.\nCTA: Comment STUCK",
      "specific_outcome"
    );
    expect(prompt).toContain("3 NEW hook variations");
    expect(prompt).toContain('"context", "contrarian", "intrigue"');
    expect(prompt).toContain("visualHook");
    expect(prompt).toContain("spokenHook");
    expect(prompt).toContain("onScreenText");
    expect(prompt).toContain("Current hook type: specific_outcome");
  });

  it("parses stacked hook variations from LLM JSON", () => {
    const sample = {
      context: {
        hookType: "pov",
        visualHook: "Tight close-up on your hands mid-pour.",
        spokenHook: "POV: you finally cracked the algorithm.",
        onScreenText: "THIS CHANGED EVERYTHING",
      },
      contrarian: {
        hookType: "contrarian",
        visualHook: "You shake your head at the camera.",
        spokenHook: "Stop posting daily if you want growth.",
        onScreenText: "POST LESS, GROW MORE",
      },
      intrigue: {
        hookType: "curiosity_gap",
        visualHook: "Blurred dashboard with one metric glowing.",
        spokenHook: "Nobody talks about this retention trick.",
        onScreenText: "THE METRIC THEY HIDE",
      },
    };
    const parsed = parseCoachHookVariations(sample);
    expect(parsed).toHaveLength(3);
    for (const variation of parsed ?? []) {
      expect(variation.visualHook.length).toBeGreaterThan(0);
      expect(variation.spokenHook.length).toBeGreaterThan(0);
      expect(variation.onScreenText.length).toBeGreaterThan(0);
      expect([
        "specific_outcome",
        "pov",
        "contrarian",
        "question",
        "pain_point",
        "story",
        "shock_data",
        "show_end_first",
        "curiosity_gap",
      ]).toContain(variation.hookType);
    }
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

  it("routes from_plan with empty composer to load_plan_card", () => {
    const action = resolveCoachIntentRules({
      message: "",
      capabilityId: "from_plan",
    });
    expect(action.tool).toBe("load_plan_card");
  });

  it("routes from_plan with attached plan card to write_viral_script", () => {
    const action = resolveCoachIntentRules({
      message: "Day 1 plan idea: Cortisol loop\n\nAngle here.\n\nHook idea: \"You are eating less.\"",
      capabilityId: "from_plan",
      attachedPlanCardId: 12,
    });
    expect(action.tool).toBe("write_viral_script");
    expect(action.planCardId).toBe(12);
  });

  it("routes from_plan with filled prompt and no attach to write_viral_script", () => {
    const action = resolveCoachIntentRules({
      message: "Why cortisol makes you retain water in a calorie deficit",
      capabilityId: "from_plan",
    });
    expect(action.tool).toBe("write_viral_script");
  });

  it("routes Spark Deck prefill under from_plan to write_viral_script", () => {
    const message = `Write a viral script from this Spark Deck idea.

Creator goal (ground truth — follow even if it mentions a product, tool, or brand):
The morning routine of a CEO running a company in 11 Countries

Hook direction: "The morning routine of a CEO running a company in 11 Countries"

If the note says not to name a tool or product on camera, use soft-sell or problem-discovery style without naming it.`;
    const action = resolveCoachIntentRules({
      message,
      capabilityId: "from_plan",
      attachedPlanCardId: 99,
    });
    expect(action.tool).toBe("write_viral_script");
    expect(action.planCardId).toBe(99);
  });

  it("routes 30-day plan prefill with Hook idea line to write_viral_script", () => {
    const message = `Day 1 plan idea: Your Student Loans Are Costing You More Than Your Degree Is Worth

Break down the true cost of a loan.

Hook idea: "If you are taking out $40,000 in student loans right now, you will actually pay back $87,000."`;
    const action = resolveCoachIntentRules({
      message,
      attachedPlanCardId: 42,
    });
    expect(action.tool).toBe("write_viral_script");
    expect(action.planCardId).toBe(42);
  });

  it("does not treat plan Hook idea label as generate_hook_ideas", () => {
    const message =
      'Day 3 plan idea: Save money in college\n\nAngle here.\n\nHook idea: "Start with this one habit."';
    const action = resolveCoachIntentRules({ message, attachedPlanCardId: 9 });
    expect(action.tool).not.toBe("generate_hook_ideas");
    expect(action.tool).toBe("write_viral_script");
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

describe("buildConvertRoughScriptPrompt", () => {
  it("wraps rough draft with convert instructions and creator profile", () => {
    const prompt = buildConvertRoughScriptPrompt(
      "Most restaurants lose money on bad refrigeration.",
      "Restaurant equipment",
      "Restaurant owners",
      null,
      "Kitchen warning"
    );
    expect(prompt).toContain("CONVERT THIS ROUGH DRAFT");
    expect(prompt).toContain("Most restaurants lose money");
    expect(prompt).toContain("Working title hint: \"Kitchen warning\"");
    expect(prompt).toContain("Restaurant equipment");
    expect(prompt).toContain('"hook"');
    expect(prompt).toContain("productionCoach");
  });
});
