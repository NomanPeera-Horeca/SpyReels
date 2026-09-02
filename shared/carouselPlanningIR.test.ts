import { describe, expect, it } from "vitest";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
  type CarouselSlideRole,
} from "./carouselStudio";
import {
  FORBIDDEN_CAROUSEL_PLANNING_IR_KEYS,
  bindPlanningIRToSlides,
  compileCreativeBriefToPlanningIR,
  planningCopySequenceFromIR,
  planningIRCopyGenerationGate,
  planningIRListItemIndexes,
  validateCarouselPlanningIR,
  type CarouselPlanningIR,
} from "./carouselPlanningIR";
import {
  CASH_DRAINS_REMAKE_67_BRIEF,
  OPEN_CASH_FLOW_USER_PROMPT,
  cashDrainsRemake67CorrectedBrief,
} from "../server/carousel/tests/fixtures/cashDrainsRemake67";
import {
  CASH_LEAKS_REMAKE_64_BRIEF,
  validFiveLeakFiveFixBrief,
} from "../server/carousel/tests/fixtures/cashLeaksRemake64";

function sampleOutline(
  roles: CarouselSlideRole[]
): CarouselCreativeBrief["slideOutline"] {
  return roles.map((role, index) => ({
    position: index + 1,
    role,
    objective: `${role} beat ${index + 1}`,
    recommendedVisual: "text" as const,
    listItemIndex: null,
  }));
}

function sampleBrief(
  overrides: Partial<CarouselCreativeBrief> = {}
): CarouselCreativeBrief {
  const estimatedSlideCount = overrides.estimatedSlideCount ?? 5;
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: overrides.id ?? "brief_ir",
    kicker: overrides.kicker ?? "Diagnostic",
    title: overrides.title ?? "Cash is a system",
    description: overrides.description ?? "Show why cash runs out before profit.",
    estimatedSlideCount,
    topic: overrides.topic ?? "small business cash flow",
    inferredAudience: overrides.inferredAudience ?? "small business owners",
    audienceReasoning:
      overrides.audienceReasoning ?? "The source names this audience.",
    contentGoal: overrides.contentGoal ?? "education",
    contentFormat: overrides.contentFormat ?? "breakdown",
    angleType: overrides.angleType ?? "diagnostic",
    hook: overrides.hook ?? "Profit on paper, empty in the bank.",
    corePromise: overrides.corePromise ?? "See the cash timing gaps before they compound.",
    centralInsight: overrides.centralInsight ?? "Cash timing is the silent killer.",
    keyPoints: overrides.keyPoints ?? [
      { title: "Timing", explanation: "Money leaves first.", purpose: "Name the gap." },
      { title: "Receivables", explanation: "Unpaid invoices hide.", purpose: "Show a leak." },
      { title: "Inventory", explanation: "Stock can trap cash.", purpose: "Show a second leak." },
      { title: "Check", explanation: "A weekly review helps.", purpose: "Give a next step." },
    ],
    slideOutline:
      overrides.slideOutline ??
      sampleOutline(["hook", "problem", "insight", "example", "cta"]),
    layoutFamily: overrides.layoutFamily ?? "breakdown",
    visualDirection: overrides.visualDirection ?? "Simple numbered cards.",
    imageDirection: overrides.imageDirection ?? "Neutral desk photos.",
    claimRisk: overrides.claimRisk ?? "medium",
    researchMode: overrides.researchMode ?? "claim_verification",
    evidenceRequirements: overrides.evidenceRequirements ?? ["Verify cash-cycle claims"],
    prohibitedClaims: overrides.prohibitedClaims ?? ["Guaranteed profit in 30 days"],
    ctaDirection: overrides.ctaDirection ?? "Save this cash-check list",
    scores:
      overrides.scores ??
      scoreCarouselCreativeBrief({
        relevance: 80,
        usefulness: 70,
        specificity: 60,
        visualPotential: 50,
        factualSafety: 90,
        originality: 40,
      }),
    confidence: overrides.confidence ?? 0.8,
  };
}

function numberedListOutline(args: {
  itemLabel: string;
  count: number;
  taxonomyLabel?: string;
  includeContext?: boolean;
}): CarouselCreativeBrief["slideOutline"] {
  const slides: CarouselCreativeBrief["slideOutline"] = [
    {
      position: 1,
      role: "hook",
      objective: `Promise ${args.count} ${args.itemLabel} on the cover.`,
      recommendedVisual: "text",
      listItemIndex: null,
    },
  ];
  if (args.includeContext) {
    slides.push({
      position: 2,
      role: "context",
      objective: "Extra framing only. Do not consume an item number.",
      recommendedVisual: "text",
      listItemIndex: null,
    });
  }
  const start = slides.length + 1;
  for (let i = 0; i < args.count; i += 1) {
    const label = args.taxonomyLabel ?? args.itemLabel;
    slides.push({
      position: start + i,
      role: "insight",
      objective: `${label} ${i + 1} names a distinct beat.`,
      recommendedVisual: "checklist",
      listItemIndex: i + 1,
    });
  }
  slides.push({
    position: slides.length + 1,
    role: "cta",
    objective: `Ask them to save the ${args.count} ${args.itemLabel} this week.`,
    recommendedVisual: "text",
    listItemIndex: null,
  });
  return slides;
}

function beatRoles(ir: CarouselPlanningIR): string[] {
  return ir.beats.map((beat) => beat.role);
}

function listSequence(ir: CarouselPlanningIR): Array<{ role: string; index: number }> {
  return ir.beats
    .filter((beat) => beat.sequence?.kind === "list")
    .map((beat) => ({
      role: beat.role,
      index: beat.sequence!.index,
    }));
}

function pairSequence(
  ir: CarouselPlanningIR
): Array<{ role: string; index: number; side: "problem" | "solution" }> {
  return ir.beats.flatMap((beat) => {
    if (beat.sequence?.kind !== "problem_solution") return [];
    return [
      {
        role: beat.role,
        index: beat.sequence.index,
        side: beat.sequence.side,
      },
    ];
  });
}

describe("compileCreativeBriefToPlanningIR", () => {
  it("is deterministic and template agnostic", () => {
    const brief = cashDrainsRemake67CorrectedBrief();
    const first = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const second = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/templateId|layoutId|slide_0|fontSize|imageUrl/);
    const leaked = FORBIDDEN_CAROUSEL_PLANNING_IR_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(first, key)
    );
    expect(leaked).toEqual([]);
  });

  it("maps remake 67 corrected six-drain structure from an open prompt", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: cashDrainsRemake67CorrectedBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.version).toBe(1);
    expect(ir.contract).toEqual({
      source: "strategist",
      kind: "enumerated",
      count: 6,
      itemType: "cash drains",
      locked: true,
    });
    expect(beatRoles(ir)).toEqual([
      "cover",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "closing",
    ]);
    expect(listSequence(ir)).toEqual([
      { role: "list_item", index: 1 },
      { role: "list_item", index: 2 },
      { role: "list_item", index: 3 },
      { role: "list_item", index: 4 },
      { role: "list_item", index: 5 },
      { role: "list_item", index: 6 },
    ]);
    expect(ir.beats[3]?.position).toBe(4);
    expect(ir.beats[3]?.sequence).toEqual({ kind: "list", index: 3 });
    expect(ir.research.mode).toBe("claim_verification");
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("uses the user contract when the source prompt is enumerated", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: cashDrainsRemake67CorrectedBrief(),
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    expect(ir.contract.source).toBe("user");
    expect(ir.contract.count).toBe(6);
    expect(ir.contract.itemType).toBe("cash drains");
    expect(ir.contract.locked).toBe(true);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("fails IR validation for the original remake 67 brief", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: CASH_DRAINS_REMAKE_67_BRIEF,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract).toEqual({
      source: "strategist",
      kind: "enumerated",
      count: 6,
      itemType: "cash drains",
      locked: true,
    });
    expect(listSequence(ir)).toHaveLength(5);
    const issues = validateCarouselPlanningIR(ir);
    expect(issues).toContain(
      "Enumerated contract promises 6 list items but found 5"
    );
    expect(issues).toContain(
      "Simple listicles should not include a standalone context beat"
    );
  });

  it("maps a valid remake 64 paired structure into problem/solution sequences", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: validFiveLeakFiveFixBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract.source).toBe("strategist");
    expect(ir.contract.count).toBe(5);
    expect(ir.contract.itemType).toMatch(/leaks/);
    expect(beatRoles(ir)[0]).toBe("cover");
    expect(beatRoles(ir)[ir.beats.length - 1]).toBe("closing");
    expect(pairSequence(ir)).toEqual([
      { role: "problem", index: 1, side: "problem" },
      { role: "solution", index: 1, side: "solution" },
      { role: "problem", index: 2, side: "problem" },
      { role: "solution", index: 2, side: "solution" },
      { role: "problem", index: 3, side: "problem" },
      { role: "solution", index: 3, side: "solution" },
      { role: "problem", index: 4, side: "problem" },
      { role: "solution", index: 4, side: "solution" },
      { role: "problem", index: 5, side: "problem" },
      { role: "solution", index: 5, side: "solution" },
    ]);
    expect(ir.beats[2]?.position).toBe(3);
    expect(ir.beats[2]?.sequence).toEqual({
      kind: "problem_solution",
      index: 1,
      side: "solution",
    });
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("keeps the original remake 64 brief invalid", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: CASH_LEAKS_REMAKE_64_BRIEF,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const issues = validateCarouselPlanningIR(ir);
    expect(issues).toContain(
      "Paired contract promises 5 problem/solution pairs but they are not fulfilled"
    );
  });

  it("maps 5 mistakes as a simple enumerated list", () => {
    const brief = sampleBrief({
      title: "5 Mistakes Restaurant Owners Still Make",
      hook: "5 mistakes restaurant owners still make on a busy night.",
      corePromise: "Name five mistakes owners can stop repeating.",
      estimatedSlideCount: 7,
      slideOutline: numberedListOutline({ itemLabel: "mistake", count: 5 }),
    });
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "5 mistakes restaurant owners make",
    });
    expect(ir.contract).toEqual({
      source: "user",
      kind: "enumerated",
      count: 5,
      itemType: "mistakes",
      locked: true,
    });
    expect(beatRoles(ir)).toEqual([
      "cover",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "closing",
    ]);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("maps 5 problems as a simple enumerated list", () => {
    const brief = sampleBrief({
      title: "5 Problems Killing Restaurant Profit",
      hook: "5 Problems Killing Restaurant Profit",
      corePromise: "Name the five problems owners miss.",
      estimatedSlideCount: 7,
      slideOutline: numberedListOutline({ itemLabel: "problem", count: 5 }),
    });
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract.source).toBe("strategist");
    expect(ir.contract.count).toBe(5);
    expect(ir.contract.itemType).toBe("problems");
    expect(listSequence(ir).map((item) => item.index)).toEqual([1, 2, 3, 4, 5]);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("maps 5 leaks as a simple enumerated list, not paired solutions", () => {
    const brief = sampleBrief({
      title: "5 Cash Leaks Quietly Draining Your Business",
      hook: "5 Cash Leaks Quietly Draining Your Business",
      corePromise: "Name the five cash leaks owners miss.",
      estimatedSlideCount: 7,
      slideOutline: numberedListOutline({
        itemLabel: "cash leak",
        count: 5,
        taxonomyLabel: "Cash leak",
      }),
    });
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "5 cash leaks quietly draining your business",
    });
    expect(ir.contract.source).toBe("user");
    expect(ir.contract.count).toBe(5);
    expect(ir.contract.itemType).toBe("cash leaks");
    expect(pairSequence(ir)).toEqual([]);
    expect(listSequence(ir)).toHaveLength(5);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("locks a 6 myths brief selected from an open prompt", () => {
    const brief = sampleBrief({
      title: "6 Cash Myths Owners Still Believe",
      hook: "6 Cash Myths Owners Still Believe",
      corePromise: "Bust six cash myths with clearer habits.",
      angleType: "myth_busting",
      estimatedSlideCount: 8,
      slideOutline: numberedListOutline({
        itemLabel: "myth",
        count: 6,
        taxonomyLabel: "Myth",
      }),
    });
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract).toEqual({
      source: "strategist",
      kind: "enumerated",
      count: 6,
      itemType: "cash myths",
      locked: true,
    });
    expect(beatRoles(ir)).toEqual([
      "cover",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "closing",
    ]);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("maps a normal non-enumerated breakdown without list sequences", () => {
    const brief = sampleBrief();
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract).toEqual({
      source: "none",
      kind: "open",
      count: null,
      itemType: null,
      locked: false,
    });
    expect(beatRoles(ir)).toEqual([
      "cover",
      "problem",
      "insight",
      "example",
      "closing",
    ]);
    expect(ir.beats.every((beat) => beat.sequence == null)).toBe(true);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("maps a story brief without numbered items", () => {
    const brief = sampleBrief({
      title: "The night the till went quiet",
      hook: "The night the till went quiet.",
      corePromise: "Walk owners through one cash-crisis night.",
      contentFormat: "story",
      layoutFamily: "story",
      angleType: "story",
      estimatedSlideCount: 6,
      slideOutline: sampleOutline([
        "hook",
        "context",
        "problem",
        "insight",
        "example",
        "cta",
      ]),
    });
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract.kind).toBe("open");
    expect(ir.strategy.preferredFamily).toBe("story");
    expect(beatRoles(ir)).toEqual([
      "cover",
      "context",
      "problem",
      "insight",
      "example",
      "closing",
    ]);
    expect(ir.beats.every((beat) => beat.sequence == null)).toBe(true);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });

  it("maps a comparison brief without numbered items", () => {
    const brief = sampleBrief({
      title: "Profit versus cash on the same week",
      hook: "Profit versus cash on the same week.",
      corePromise: "Show the difference between profit and cash.",
      contentFormat: "comparison",
      layoutFamily: "comparison",
      estimatedSlideCount: 5,
      slideOutline: sampleOutline([
        "hook",
        "comparison",
        "insight",
        "comparison",
        "cta",
      ]),
    });
    const ir = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(ir.contract.kind).toBe("open");
    expect(ir.strategy.preferredFamily).toBe("comparison");
    expect(beatRoles(ir)).toEqual([
      "cover",
      "comparison",
      "insight",
      "comparison",
      "closing",
    ]);
    expect(validateCarouselPlanningIR(ir)).toEqual([]);
  });
});

describe("validateCarouselPlanningIR", () => {
  it("rejects renderer and template-specific fields", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: sampleBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const leaked = {
      ...ir,
      templateId: "photo_story_v2",
      beats: ir.beats.map((beat, index) =>
        index === 0
          ? { ...beat, layoutId: "hook_bold_center", slide_01: { headline: "Hi" } }
          : beat
      ),
    } as CarouselPlanningIR & { templateId: string };
    const issues = validateCarouselPlanningIR(leaked);
    expect(issues.some((issue) => /templateId/.test(issue))).toBe(true);
    expect(issues.some((issue) => /layoutId/.test(issue))).toBe(true);
    expect(issues.some((issue) => /slide_01/.test(issue))).toBe(true);
    expect(issues.some((issue) => /headline/.test(issue))).toBe(true);
  });

  it("rejects a missing cover, missing closing, and unstable ids", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: sampleBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    ir.beats[0] = { ...ir.beats[0]!, role: "insight", id: "slide_role" };
    ir.beats[ir.beats.length - 1] = {
      ...ir.beats[ir.beats.length - 1]!,
      role: "summary",
    };
    const issues = validateCarouselPlanningIR(ir);
    expect(issues).toContain("Planning IR must contain exactly one cover");
    expect(issues).toContain("Planning IR must contain exactly one closing");
    expect(issues.some((issue) => /stable id/.test(issue))).toBe(true);
  });

  it("rejects a solution that precedes or lacks its problem", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: validFiveLeakFiveFixBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const leak1 = ir.beats.find(
      (beat) =>
        beat.sequence?.kind === "problem_solution" &&
        beat.sequence.index === 1 &&
        beat.sequence.side === "problem"
    );
    const fix1 = ir.beats.find(
      (beat) =>
        beat.sequence?.kind === "problem_solution" &&
        beat.sequence.index === 1 &&
        beat.sequence.side === "solution"
    );
    expect(leak1 && fix1).toBeTruthy();
    if (leak1 && fix1) {
      const leakSequence = leak1.sequence;
      leak1.sequence = fix1.sequence;
      fix1.sequence = leakSequence;
    }
    const issues = validateCarouselPlanningIR(ir);
    expect(issues).toContain("Solution 1 appears before Problem 1");
  });
});

describe("bindPlanningIRToSlides", () => {
  it("exposes sequence indexes rather than physical positions", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: cashDrainsRemake67CorrectedBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const slideIds = ir.beats.map(
      (_, i) => `slide_${String(i + 1).padStart(2, "0")}`
    );
    const bindings = bindPlanningIRToSlides(ir, slideIds);
    expect(bindings[0]).toMatchObject({
      role: "cover",
      listItemIndex: null,
      slideId: "slide_01",
    });
    expect(bindings[1]).toMatchObject({
      role: "list_item",
      listItemIndex: 1,
      position: 2,
    });
    expect(planningIRListItemIndexes(ir)).toEqual([
      null,
      1,
      2,
      3,
      4,
      5,
      6,
      null,
    ]);
  });
});

describe("planningIRCopyGenerationGate", () => {
  it("blocks invalid remake 67 IR before copy generation", () => {
    const ir = compileCreativeBriefToPlanningIR({
      brief: CASH_DRAINS_REMAKE_67_BRIEF,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const gate = planningIRCopyGenerationGate(ir);
    expect(gate.blocked).toBe(true);
    if (gate.blocked) {
      expect(gate.errorCategory).toBe("planning_ir_validation");
      expect(gate.issues.length).toBeGreaterThan(0);
    }
  });

  it("allows valid remake 64 and corrected remake 67 IR", () => {
    expect(
      planningIRCopyGenerationGate(
        compileCreativeBriefToPlanningIR({
          brief: validFiveLeakFiveFixBrief(),
          sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
        })
      )
    ).toEqual({ blocked: false });
    expect(
      planningIRCopyGenerationGate(
        compileCreativeBriefToPlanningIR({
          brief: cashDrainsRemake67CorrectedBrief(),
          sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
        })
      )
    ).toEqual({ blocked: false });
  });

  it("exposes list vs problem_solution copy sequences", () => {
    const list = planningCopySequenceFromIR(
      compileCreativeBriefToPlanningIR({
        brief: cashDrainsRemake67CorrectedBrief(),
        sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      })
    );
    const paired = planningCopySequenceFromIR(
      compileCreativeBriefToPlanningIR({
        brief: validFiveLeakFiveFixBrief(),
        sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      })
    );
    expect(list.kind).toBe("list");
    expect(paired.kind).toBe("problem_solution");
  });
});
