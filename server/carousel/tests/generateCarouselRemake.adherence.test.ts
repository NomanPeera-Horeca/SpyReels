import { describe, expect, it } from "vitest";
import {
  bindBriefOutlineToSlides,
  scoreCarouselCreativeBrief,
  selectSemanticallyValidCarouselBriefs,
  validateCarouselBriefSemantics,
  validateCopyBriefAdherence,
  type CarouselCopySlotValues,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import {
  buildCarouselRemakePrompt,
  effectiveSlidesForCreativeBrief,
} from "../generateCarouselRemake";
import { buildCarouselAnglesRepairNote } from "../generateCarouselAngles";
import {
  CASH_LEAKS_MISSING_LEAK1_VALUES,
  CASH_LEAKS_REMAKE_64_BRIEF,
  CASH_LEAKS_REMAKE_64_SLIDE_IDS,
  CASH_LEAKS_REMAKE_64_SLIDE_ROLES,
  CASH_LEAKS_REMAKE_64_VALUES,
  VALID_FIVE_LEAK_FIVE_FIX_VALUES,
  validFiveLeakFiveFixBrief,
} from "./fixtures/cashLeaksRemake64";

function adherenceIssues(
  values = CASH_LEAKS_REMAKE_64_VALUES,
  brief = CASH_LEAKS_REMAKE_64_BRIEF
) {
  return validateCopyBriefAdherence({
    brief,
    slideIds: CASH_LEAKS_REMAKE_64_SLIDE_IDS,
    slideRoles: CASH_LEAKS_REMAKE_64_SLIDE_ROLES,
    values,
  });
}

describe("carousel remake 64 brief semantics", () => {
  it("rejects the selected brief for five plugs with only two fixes", () => {
    const issues = validateCarouselBriefSemantics(CASH_LEAKS_REMAKE_64_BRIEF);
    expect(issues.some((issue) => /5 solutions/.test(issue))).toBe(true);
    expect(
      selectSemanticallyValidCarouselBriefs([CASH_LEAKS_REMAKE_64_BRIEF]).briefs
    ).toEqual([]);
  });

  it("accepts a valid five-leak five-fix outline", () => {
    const brief = validFiveLeakFiveFixBrief();
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toHaveLength(1);
  });

  it("puts semantic issues into the existing one-time angle repair note", () => {
    const issues = validateCarouselBriefSemantics(CASH_LEAKS_REMAKE_64_BRIEF);
    const note = buildCarouselAnglesRepairNote(2, [
      `Brief "${CASH_LEAKS_REMAKE_64_BRIEF.title}": ${issues.join("; ")}`,
    ]);
    expect(note).toContain("matching contentFormat and layoutFamily");
    expect(note).toContain("Semantic issues to fix");
    expect(note).toContain("solutions that were not introduced");
  });
});

describe("carousel remake 64 copy adherence", () => {
  it("catches missing Leak 1 and Fix 1 before Leak 1", () => {
    const issues = adherenceIssues(CASH_LEAKS_MISSING_LEAK1_VALUES);
    expect(issues.some((issue) => /Missing Leak 1/.test(issue))).toBe(true);
    expect(issues.some((issue) => /Fix 1 appears before Leak 1/.test(issue))).toBe(
      true
    );
  });

  it("catches a five-plugs summary when fewer than five fixes were written", () => {
    const issues = adherenceIssues();
    expect(issues.some((issue) => /5 solutions/.test(issue))).toBe(true);
  });

  it("still fails remake 64 without treating slide 11 as a second CTA", () => {
    const issues = adherenceIssues();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues).not.toContain("More than one CTA slide exists");
    expect(issues).not.toContain("Copy has multiple competing endings");
    expect(issues).toContain(
      "Unexpected Leak 1 at position 2; expected at position 3"
    );
    expect(issues.some((issue) => /Position 3 is missing Leak 1/.test(issue))).toBe(
      true
    );
  });

  it("rejects Leak 1 generated on the context slide as the wrong position", () => {
    expect(adherenceIssues()).toContain(
      "Unexpected Leak 1 at position 2; expected at position 3"
    );
  });

  it("rejects Leak 1 missing from its planned position", () => {
    expect(
      adherenceIssues().some((issue) => /Position 3 is missing Leak 1/.test(issue))
    ).toBe(true);
    expect(
      adherenceIssues(CASH_LEAKS_MISSING_LEAK1_VALUES).some((issue) =>
        /Missing Leak 1/.test(issue)
      )
    ).toBe(true);
  });

  it("flags unsupported claim_verification wording from the generated slides", () => {
    const issues = adherenceIssues();
    expect(
      issues.some((issue) => /Most owners have at least two of these/.test(issue))
    ).toBe(true);
    expect(
      issues.some((issue) => /All five plugged means predictable cash/.test(issue))
    ).toBe(true);
    expect(issues.some((issue) => /A reserve is not a luxury/.test(issue))).toBe(
      true
    );
  });

  it("accepts copy that follows a valid five-leak five-fix outline", () => {
    expect(
      validateCopyBriefAdherence({
        brief: validFiveLeakFiveFixBrief(),
        slideIds: CASH_LEAKS_REMAKE_64_SLIDE_IDS,
        slideRoles: CASH_LEAKS_REMAKE_64_SLIDE_ROLES,
        values: VALID_FIVE_LEAK_FIVE_FIX_VALUES,
      })
    ).toEqual([]);
  });
});

describe("brief-to-slide positional mapping", () => {
  const template = CAROUSEL_TEMPLATES_BY_ID.get("photo_story_test");

  it("maps outline position N to effectiveSlides position N exactly", () => {
    expect(template).toBeDefined();
    const slides = effectiveSlidesForCreativeBrief(
      template!,
      CASH_LEAKS_REMAKE_64_BRIEF
    );
    expect(slides).toHaveLength(12);
    const bindings = bindBriefOutlineToSlides(
      CASH_LEAKS_REMAKE_64_BRIEF.slideOutline,
      slides.map((slide) => slide.id)
    );
    bindings.forEach((binding, index) => {
      expect(binding.position).toBe(index + 1);
      expect(binding.slideId).toBe(slides[index]?.id);
      expect(binding.slideId).toBe(`slide_${String(index + 1).padStart(2, "0")}`);
    });
    expect(bindings[2]?.objective).toContain("Leak 1");
    expect(bindings[1]?.objective).toContain("cash flow from profit");
  });

  it("binds each planned objective onto the matching slide in the copy prompt", () => {
    expect(template).toBeDefined();
    const slides = effectiveSlidesForCreativeBrief(
      template!,
      CASH_LEAKS_REMAKE_64_BRIEF
    );
    const prompt = buildCarouselRemakePrompt(
      template!.name,
      template!.description,
      slides,
      "infer from source",
      new Map(),
      "Make me a carousel about why small businesses run out of cash.",
      CASH_LEAKS_REMAKE_64_BRIEF
    );
    expect(prompt).toContain("Outline position N maps to the Nth slide exactly");
    expect(prompt).toContain(
      "Slide slide_02 (position 2, layout role: list_item)"
    );
    expect(prompt).toContain(
      "Distinguish cash flow from profit to frame why these leaks are invisible to most owners."
    );
    expect(prompt).toContain(
      "Slide slide_03 (position 3, layout role: list_item)"
    );
    expect(prompt).toContain("Introduce Leak 1 (invoice timing)");
    expect(prompt).toContain("Many owners may have more than one");
  });
});

const GENERIC_SLIDE_IDS = [
  "slide_01",
  "slide_02",
  "slide_03",
  "slide_04",
  "slide_05",
];

const GENERIC_SLIDE_ROLES = [
  "hook",
  "list_item",
  "list_item",
  "list_item",
  "cta",
];

function genericClosingBrief(
  overrides: Partial<CarouselCreativeBrief> = {}
): CarouselCreativeBrief {
  const estimatedSlideCount = overrides.estimatedSlideCount ?? 5;
  return {
    schemaVersion: 2,
    isLegacy: false,
    id: "brief_closing",
    kicker: "Diagnostic",
    title: "Cash is a system",
    description: "Show why cash runs out before profit.",
    estimatedSlideCount,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "diagnostic",
    hook: "Profit on paper, empty in the bank.",
    corePromise: "See the cash leaks before they compound.",
    centralInsight: "Cash timing is the silent killer.",
    keyPoints: [
      {
        title: "Timing",
        explanation: "Money leaves before it arrives.",
        purpose: "Name the real problem.",
      },
      {
        title: "Receivables",
        explanation: "Unpaid invoices hide as profit.",
        purpose: "Show a leak.",
      },
      {
        title: "Inventory",
        explanation: "Stock can trap cash.",
        purpose: "Show a second leak.",
      },
      {
        title: "Check",
        explanation: "A weekly cash calendar prevents surprises.",
        purpose: "Give a next step.",
      },
    ],
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective: "Open on the cash warning.",
        recommendedVisual: "text",
      },
      {
        position: 2,
        role: "context",
        objective: "Distinguish cash flow from profit to frame hidden drains.",
        recommendedVisual: "comparison",
      },
      {
        position: 3,
        role: "problem",
        objective: "Name the timing trap that empties the account.",
        recommendedVisual: "diagram",
      },
      {
        position: 4,
        role: "insight",
        objective: "Show a weekly habit that catches surprises.",
        recommendedVisual: "checklist",
      },
      {
        position: 5,
        role: "cta",
        objective: "Close with one clear next step.",
        recommendedVisual: "text",
      },
    ],
    layoutFamily: "breakdown",
    visualDirection: "Simple numbered breakdown cards.",
    imageDirection: "Neutral desk photos.",
    claimRisk: "medium",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: [],
    ctaDirection: "Ask readers to keep a weekly cash check nearby.",
    scores: scoreCarouselCreativeBrief({
      relevance: 80,
      usefulness: 80,
      specificity: 70,
      visualPotential: 60,
      factualSafety: 80,
      originality: 50,
    }),
    confidence: 0.8,
    ...overrides,
  };
}

function genericMiddleValues(): CarouselCopySlotValues {
  return {
    slide_01: {
      headline: "Bank accounts go quiet first",
      body: "A full P and L can still hide a dry week.",
    },
    slide_02: {
      headline: "Paper gains can hide an empty checking account",
      body: "Owners often celebrate sales while the register is already thin.",
    },
    slide_03: {
      headline: "Money leaves before it lands",
      body: "Work can be done while payment is still weeks away.",
    },
    slide_04: {
      headline: "Look at the account every Friday",
      body: "A short weekly review spots drains early.",
    },
  };
}

function closingCopyIssues(
  final: Record<string, string>,
  args: {
    brief?: CarouselCreativeBrief;
    middle?: Partial<CarouselCopySlotValues>;
    slideRoles?: string[];
  } = {}
) {
  return validateCopyBriefAdherence({
    brief: args.brief ?? genericClosingBrief(),
    slideIds: GENERIC_SLIDE_IDS,
    slideRoles: args.slideRoles ?? GENERIC_SLIDE_ROLES,
    values: {
      ...genericMiddleValues(),
      ...(args.middle ?? {}),
      slide_05: final,
    },
  });
}

describe("final closing copy adherence", () => {
  it("accepts a strong takeaway ending with no CTA slot", () => {
    const brief = genericClosingBrief({
      slideOutline: genericClosingBrief().slideOutline.map((slide, index) =>
        index === 4
          ? {
              ...slide,
              role: "takeaway",
              objective: "Leave them with one cash-check habit to keep.",
            }
          : slide
      ),
      ctaDirection: "Leave them with one habit, not a hard ask.",
    });
    expect(
      closingCopyIssues(
        {
          headline: "Keep one Friday cash check",
          body: "That single habit is the whole point of the carousel.",
        },
        { brief, slideRoles: ["hook", "list_item", "list_item", "list_item", "list_item"] }
      )
    ).toEqual([]);
  });

  it("accepts a question ending", () => {
    expect(
      closingCopyIssues({
        headline: "Which leak will you plug first?",
        body: "Pick one drain and handle it this week.",
      })
    ).toEqual([]);
  });

  it("accepts a follow CTA ending", () => {
    expect(
      closingCopyIssues({
        headline: "Instagram may not show you the next one",
        body: "Follow so you do not miss the next cash check.",
        cta_label: "Follow along",
      })
    ).toEqual([]);
  });

  it("accepts a comment CTA ending", () => {
    expect(
      closingCopyIssues({
        headline: "Comment the leak that hits you",
        body: "Name it below so you commit to plugging it.",
        cta_label: "Comment below",
      })
    ).toEqual([]);
  });

  it("accepts a DM keyword CTA ending", () => {
    expect(
      closingCopyIssues({
        headline: "DM CASH for the checklist",
        body: "Send the keyword and we will reply with the weekly review.",
        cta_label: "DM CASH",
      })
    ).toEqual([]);
  });

  it("accepts a practical-action ending", () => {
    expect(
      closingCopyIssues({
        headline: "Audit cash this Friday",
        body: "Open the account and mark every outgoing charge.",
      })
    ).toEqual([]);
  });

  it("rejects two competing endings when a non-final slide has a CTA slot", () => {
    const issues = closingCopyIssues(
      {
        headline: "Keep one Friday cash check",
        body: "That single habit is the whole point of the carousel.",
      },
      {
        middle: {
          slide_04: {
            headline: "Follow for the next check",
            body: "Turn on alerts so the next post reaches you.",
            cta_label: "Follow along",
          },
        },
      }
    );
    expect(issues).toContain("Copy has multiple competing endings");
  });

  it("rejects duplicated closing language", () => {
    const issues = closingCopyIssues(
      {
        headline: "Look at the account every Friday",
        body: "A short weekly review spots drains early.",
      },
      {
        middle: {
          slide_04: {
            headline: "Look at the account every Friday",
            body: "A short weekly review spots drains early.",
          },
        },
      }
    );
    expect(issues).toContain("Duplicated closing language");
  });

  it("rejects a false platform claim in the closing", () => {
    const issues = closingCopyIssues({
      headline: "Instagram will never show you our posts unless you follow",
      body: "Hit follow now or this account disappears from your feed.",
      cta_label: "Follow now",
    });
    expect(
      issues.some((issue) => /Instagram will never show you our posts/.test(issue))
    ).toBe(true);
  });

  it("does not treat non-final educational text containing save as a closing", () => {
    expect(
      closingCopyIssues(
        {
          headline: "Which leak will you plug first?",
          body: "Pick one drain and handle it this week.",
        },
        {
          middle: {
            slide_04: {
              headline: "Owners can save cash by checking Friday",
              body: "A weekly review is how you save the account from quiet leaks.",
            },
          },
        }
      )
    ).toEqual([]);
  });

  it("does not hard fail a semantically correct paraphrase with different vocabulary", () => {
    const issues = closingCopyIssues({
      headline: "Park this weekly review nearby",
      body: "Use it the next time the register feels thin.",
    });
    expect(
      issues.filter((issue) => /does not match planned objective/.test(issue))
    ).toEqual([]);
    expect(issues).toEqual([]);
  });
});
