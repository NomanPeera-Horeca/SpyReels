import { describe, expect, it } from "vitest";
import {
  bindBriefOutlineToSlides,
  detectCarouselListContractFromBrief,
  detectExplicitCarouselListContract,
  scoreCarouselCreativeBrief,
  selectSemanticallyValidCarouselBriefs,
  validateCarouselBriefSemantics,
  validateCopyBriefAdherence,
  type CarouselCopySlotValues,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import {
  buildCarouselRemakeJsonSchema,
  buildCarouselRemakePrompt,
  effectiveSlidesForCreativeBrief,
} from "../generateCarouselRemake";
import { buildCarouselAnglesRepairNote } from "../generateCarouselAngles";
import {
  CASH_DRAINS_REMAKE_67_BRIEF,
  OPEN_CASH_FLOW_USER_PROMPT,
} from "./fixtures/cashDrainsRemake67";
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

describe("carousel remake 67 brief semantics", () => {
  it("fails the production six-drain brief without an explicit user list contract", () => {
    expect(detectExplicitCarouselListContract(OPEN_CASH_FLOW_USER_PROMPT)).toBeNull();
    expect(detectCarouselListContractFromBrief(CASH_DRAINS_REMAKE_67_BRIEF)).toEqual({
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
    const issues = validateCarouselBriefSemantics(CASH_DRAINS_REMAKE_67_BRIEF);
    expect(issues).toContain("The hook promises 6 items but fewer than 6 are outlined");
    expect(issues).toContain(
      "Simple listicles should not include a standalone context slide"
    );
    expect(
      selectSemanticallyValidCarouselBriefs([CASH_DRAINS_REMAKE_67_BRIEF]).briefs
    ).toEqual([]);
  });
});

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

  it("fails remake 64 for sequence errors and competing endings", () => {
    const issues = adherenceIssues();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues).toContain("Copy has multiple competing endings");
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

describe("copy-generation slideIntent schema", () => {
  it("requires slideIntent on every slide and allows optional closingType", () => {
    const template = CAROUSEL_TEMPLATES_BY_ID.get("photo_story_test");
    expect(template).toBeDefined();
    const schema = buildCarouselRemakeJsonSchema(template!.slides);
    const firstSlide = (
      schema.schema.properties as Record<string, Record<string, unknown>>
    )[template!.slides[0]!.id] as {
      properties?: Record<string, { enum?: string[] }>;
      required?: string[];
    };
    expect(firstSlide.required).toContain("slideIntent");
    expect(firstSlide.required).not.toContain("closingType");
    expect(firstSlide.properties?.closingType).toBeDefined();
    expect(firstSlide.properties?.slideIntent?.enum).toEqual([
      "content",
      "transition",
      "closing",
    ]);
    expect(firstSlide.properties?.closingType?.enum).toContain("question");
    expect(firstSlide.properties?.closingType?.enum).toContain("dm");
  });

  it("uses a non-strict 10-slide copy schema without dropping slots or intent fields", () => {
    const template = CAROUSEL_TEMPLATES_BY_ID.get("listicle_7_mistakes");
    expect(template).toBeDefined();
    const slides = [
      ...template!.slides,
      {
        ...template!.slides[1]!,
        id: "slide_10",
      },
    ];
    expect(slides).toHaveLength(10);

    const schema = buildCarouselRemakeJsonSchema(slides);
    expect(schema.name).toBe("carousel_remake_slots");
    expect(schema.strict).toBe(false);

    const properties = schema.schema.properties as Record<
      string,
      {
        properties?: Record<string, unknown>;
        required?: string[];
      }
    >;
    const required = schema.schema.required as string[];
    expect(required).toEqual(slides.map((slide) => slide.id));

    for (const slide of slides) {
      expect(properties[slide.id]).toBeDefined();
      const slideSchema = properties[slide.id]!;
      expect(slideSchema.required).toContain("slideIntent");
      expect(slideSchema.required).not.toContain("closingType");
      expect(slideSchema.properties?.closingType).toBeDefined();
      expect(slideSchema.properties?.slideIntent).toBeDefined();
      for (const slot of slide.slots) {
        expect(slideSchema.properties?.[slot.id]).toBeDefined();
        expect(slideSchema.required).toContain(slot.id);
      }
    }
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

  it("numbers list items from listItemIndex, not physical position", () => {
    expect(template).toBeDefined();
    const brief = validFiveLeakFiveFixBrief();
    const drainOutline = [
      {
        position: 1,
        role: "hook" as const,
        objective: "Promise six cash drains on the cover.",
        recommendedVisual: "text" as const,
        listItemIndex: null,
      },
      {
        position: 2,
        role: "context" as const,
        objective: "Keep setup on the cover and do not consume item 01.",
        recommendedVisual: "text" as const,
        listItemIndex: null,
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        position: i + 3,
        role: "insight" as const,
        objective: `Cash drain ${i + 1} names a distinct silent leak.`,
        recommendedVisual: "checklist" as const,
        listItemIndex: i + 1,
      })),
      {
        position: 9,
        role: "cta" as const,
        objective: "Ask them to audit the six cash drains this week.",
        recommendedVisual: "text" as const,
        listItemIndex: null,
      },
    ];
    const listBrief: CarouselCreativeBrief = {
      ...brief,
      title: "6 Cash Drains Quietly Bleeding Your Business",
      hook: "6 Cash Drains Quietly Bleeding Your Business",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 9,
      slideOutline: drainOutline,
    };
    const slides = effectiveSlidesForCreativeBrief(template!, listBrief);
    expect(slides).toHaveLength(9);
    const contextKicker = slides[1]?.slots.find((slot) => slot.id === "kicker");
    const firstItemKicker = slides[2]?.slots.find((slot) => slot.id === "kicker");
    const lastItemKicker = slides[7]?.slots.find((slot) => slot.id === "kicker");
    expect(contextKicker?.defaultText).toBe("·");
    expect(firstItemKicker?.defaultText).toBe("01");
    expect(lastItemKicker?.defaultText).toBe("06");
    const prompt = buildCarouselRemakePrompt(
      template!.name,
      template!.description,
      slides,
      "infer from source",
      new Map(),
      "The 6 Silent Cash Drains Killing Small Businesses",
      listBrief
    );
    expect(prompt).toContain(
      "List item number: 01. Use this for Number kickers, not the physical slide position."
    );
    expect(prompt).toContain(
      "Not a numbered list item. Do not assign a promised item number to this slide."
    );
    expect(prompt).toContain("Never number from physical slide position.");
    expect(prompt).toContain("Planned role: cover");
    expect(prompt).toContain("Planned role: list_item");
    expect(prompt).toContain("Planned role: closing");
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
      slideIntent: "content",
    },
    slide_02: {
      headline: "Paper gains can hide an empty checking account",
      body: "Owners often celebrate sales while the register is already thin.",
      slideIntent: "content",
    },
    slide_03: {
      headline: "Money leaves before it lands",
      body: "Work can be done while payment is still weeks away.",
      slideIntent: "content",
    },
    slide_04: {
      headline: "Look at the account every Friday",
      body: "A short weekly review spots drains early.",
      slideIntent: "content",
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
          slideIntent: "closing",
          closingType: "takeaway",
        },
        { brief, slideRoles: ["hook", "list_item", "list_item", "list_item", "list_item"] }
      )
    ).toEqual([]);
  });

  it("rejects a slide that omits slideIntent", () => {
    expect(
      closingCopyIssues(
        {
          headline: "Which leak will you plug first?",
          body: "Pick one drain and handle it this week.",
          slideIntent: "closing",
          closingType: "question",
        },
        {
          middle: {
            slide_03: {
              headline: "Money leaves before it lands",
              body: "Work can be done while payment is still weeks away.",
            },
          },
        }
      )
    ).toContain("Position 3 is missing slideIntent");
  });

  it("rejects a final closing that omits closingType", () => {
    expect(
      closingCopyIssues({
        headline: "Which leak will you plug first?",
        body: "Pick one drain and handle it this week.",
        slideIntent: "closing",
      })
    ).toContain("Position 5 is missing closingType");
  });

  it("accepts a content slide that omits closingType", () => {
    expect(
      closingCopyIssues(
        {
          headline: "Which leak will you plug first?",
          body: "Pick one drain and handle it this week.",
          slideIntent: "closing",
          closingType: "question",
        },
        {
          middle: {
            slide_03: {
              headline: "Which timing trap empties the account first?",
              body: "Work can be done while payment is still weeks away.",
              slideIntent: "content",
            },
          },
        }
      )
    ).toEqual([]);
  });

  it("accepts a question ending", () => {
    expect(
      closingCopyIssues({
        headline: "Which leak will you plug first?",
        body: "Pick one drain and handle it this week.",
        slideIntent: "closing",
        closingType: "question",
      })
    ).toEqual([]);
  });

  it("accepts a follow CTA ending", () => {
    expect(
      closingCopyIssues({
        headline: "Instagram may not show you the next one",
        body: "Follow so you do not miss the next cash check.",
        cta_label: "Follow along",
        slideIntent: "closing",
        closingType: "follow",
      })
    ).toEqual([]);
  });

  it("accepts a comment CTA ending", () => {
    expect(
      closingCopyIssues({
        headline: "Comment the leak that hits you",
        body: "Name it below so you commit to plugging it.",
        cta_label: "Comment below",
        slideIntent: "closing",
        closingType: "comment",
      })
    ).toEqual([]);
  });

  it("accepts a DM keyword CTA ending", () => {
    expect(
      closingCopyIssues({
        headline: "DM CASH for the checklist",
        body: "Send the keyword and we will reply with the weekly review.",
        cta_label: "DM CASH",
        slideIntent: "closing",
        closingType: "dm",
      })
    ).toEqual([]);
  });

  it("accepts a practical-action ending", () => {
    expect(
      closingCopyIssues({
        headline: "Audit cash this Friday",
        body: "Open the account and mark every outgoing charge.",
        slideIntent: "closing",
        closingType: "practical_action",
      })
    ).toEqual([]);
  });

  it("rejects a non-final question marked closing", () => {
    const issues = closingCopyIssues(
      {
        headline: "Keep one Friday cash check",
        body: "That single habit is the whole point of the carousel.",
        slideIntent: "closing",
        closingType: "takeaway",
      },
      {
        middle: {
          slide_04: {
            headline: "Which leak hits you most?",
            body: "Name the drain that is already emptying the account.",
            slideIntent: "closing",
            closingType: "question",
          },
        },
      }
    );
    expect(issues).toContain("Copy has multiple competing endings");
  });

  it("rejects a non-final follow, comment, or DM closing", () => {
    const follow = closingCopyIssues(
      {
        headline: "Keep one Friday cash check",
        body: "That single habit is the whole point of the carousel.",
        slideIntent: "closing",
        closingType: "takeaway",
      },
      {
        middle: {
          slide_04: {
            headline: "Follow for the next check",
            body: "Turn on alerts so the next post reaches you.",
            slideIntent: "closing",
            closingType: "follow",
          },
        },
      }
    );
    const comment = closingCopyIssues(
      {
        headline: "Keep one Friday cash check",
        body: "That single habit is the whole point of the carousel.",
        slideIntent: "closing",
        closingType: "takeaway",
      },
      {
        middle: {
          slide_04: {
            headline: "Comment the leak that hits you",
            body: "Name it below so you commit to plugging it.",
            slideIntent: "closing",
            closingType: "comment",
          },
        },
      }
    );
    const dm = closingCopyIssues(
      {
        headline: "Keep one Friday cash check",
        body: "That single habit is the whole point of the carousel.",
        slideIntent: "closing",
        closingType: "takeaway",
      },
      {
        middle: {
          slide_04: {
            headline: "DM CASH for the checklist",
            body: "Send the keyword and we will reply with the weekly review.",
            slideIntent: "closing",
            closingType: "dm",
          },
        },
      }
    );
    expect(follow).toContain("Copy has multiple competing endings");
    expect(comment).toContain("Copy has multiple competing endings");
    expect(dm).toContain("Copy has multiple competing endings");
  });

  it("accepts a normal educational question in the middle marked content", () => {
    expect(
      closingCopyIssues(
        {
          headline: "Which leak will you plug first?",
          body: "Pick one drain and handle it this week.",
          slideIntent: "closing",
          closingType: "question",
        },
        {
          middle: {
            slide_03: {
              headline: "Which timing trap empties the account first?",
              body: "Work can be done while payment is still weeks away.",
              slideIntent: "content",
            },
          },
        }
      )
    ).toEqual([]);
  });

  it("rejects duplicated closing language", () => {
    const issues = closingCopyIssues(
      {
        headline: "Look at the account every Friday",
        body: "A short weekly review spots drains early.",
        slideIntent: "closing",
        closingType: "takeaway",
      },
      {
        middle: {
          slide_04: {
            headline: "Look at the account every Friday",
            body: "A short weekly review spots drains early.",
            slideIntent: "content",
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
      slideIntent: "closing",
      closingType: "follow",
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
          slideIntent: "closing",
          closingType: "question",
        },
        {
          middle: {
            slide_04: {
              headline: "Owners can save cash by checking Friday",
              body: "A weekly review is how you save the account from quiet leaks.",
              slideIntent: "content",
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
      slideIntent: "closing",
      closingType: "soft_close",
    });
    expect(
      issues.filter((issue) => /does not match planned objective/.test(issue))
    ).toEqual([]);
    expect(issues).toEqual([]);
  });
});
