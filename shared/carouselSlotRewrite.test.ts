import { describe, expect, it } from "vitest";
import type { CarouselSlideSpec } from "./carouselTemplates";
import {
  buildCarouselSlotRewriteContext,
  extractCarouselRewriteFacts,
  isCarouselSlotRewriteAction,
  isNearDuplicateCarouselRewrite,
  isPunchierCarouselRewrite,
  preservesCarouselSubjectAnchors,
  validateCarouselSlotRewriteAlternatives,
  validateCarouselSlotRewriteText,
} from "./carouselSlotRewrite";

const slides: CarouselSlideSpec[] = [
  {
    id: "slide_01",
    role: "hook",
    viralWhy: "Stop the scroll with the pricing mistake.",
    layoutId: "hook_bold_center",
    slots: [
      {
        id: "kicker",
        role: "kicker",
        label: "Kicker",
        budget: { min: 4, max: 28 },
        defaultText: "PRICING",
      },
      {
        id: "headline",
        role: "headline",
        label: "Headline",
        budget: { min: 8, max: 48 },
        defaultText: "Your menu price is costing you profit",
      },
    ],
    composition: {
      family: "story_narrative",
      archetype: "hook",
      treatment: "hook_bold_center",
      semanticRole: "hook",
      listItemIndex: null,
    },
  },
  {
    id: "slide_02",
    role: "point",
    viralWhy: "Name the first pricing mistake.",
    layoutId: "list_item_numbered",
    slots: [
      {
        id: "headline",
        role: "headline",
        label: "Headline",
        budget: { min: 8, max: 52 },
        defaultText: "Guessing instead of costing",
      },
      {
        id: "body",
        role: "body",
        label: "Body",
        budget: { min: 12, max: 90 },
        defaultText: "Owners cut 12% off popular plates without knowing food cost.",
      },
    ],
    composition: {
      family: "story_narrative",
      archetype: "point",
      treatment: "list_item_numbered",
      semanticRole: "point",
      listItemIndex: 1,
    },
  },
];

const slotValues = {
  slide_01: {
    kicker: "PRICING",
    headline: "Your menu price is costing you profit",
  },
  slide_02: {
    headline: "Guessing instead of costing",
    body: "Owners cut 12% off popular plates without knowing food cost.",
  },
};

function source(overrides: Record<string, unknown> = {}) {
  return {
    niche: "restaurant owners",
    sourceUrl: null,
    angleOptionsJson: [
      {
        schemaVersion: 2,
        isLegacy: false,
        id: "brief-a",
        kicker: "PRICING",
        title: "5 pricing mistakes restaurant owners make",
        description: "Protect menu profit.",
        estimatedSlideCount: 7,
        topic: "5 pricing mistakes restaurant owners make",
        inferredAudience: "independent restaurant owners",
        audienceReasoning: "They set prices themselves.",
        contentGoal: "educate",
        contentFormat: "listicle",
        angleType: "mistakes",
        hook: "Your menu price is costing you profit",
        corePromise: "Spot the pricing leaks that shrink ticket profit.",
        centralInsight: "Cheap-looking prices can still lose money.",
        keyPoints: [],
        slideOutline: [],
        layoutFamily: "story",
        visualDirection: "clean type",
        imageDirection: "kitchen stills",
        claimRisk: "low",
        researchMode: "none",
        evidenceRequirements: [],
        prohibitedClaims: ["Do not invent revenue numbers"],
        ctaDirection: "Save this before you reprint menus",
        scores: {
          clarity: 8,
          specificity: 8,
          novelty: 6,
          shareability: 7,
          saveability: 8,
          overall: 8,
        },
        confidence: 0.8,
      },
    ],
    selectedAngleIndex: 0,
    slideStructure: slides,
    slotValues,
    slideId: "slide_01",
    slotId: "headline",
    ...overrides,
  };
}

describe("carousel slot rewrite context", () => {
  it("keeps a small on-topic package for a specific pricing idea", () => {
    const built = buildCarouselSlotRewriteContext(source());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.context.brief?.topic).toContain("pricing mistakes restaurant");
    expect(built.context.slot.currentText).toBe(
      "Your menu price is costing you profit"
    );
    expect(built.context.slide.semanticRole).toBe("hook");
    expect(built.context.nearby.nextHeadline).toBe("Guessing instead of costing");
    expect(JSON.stringify(built.context)).not.toContain("imageUrls");
    expect(JSON.stringify(built.context)).not.toContain("designOverride");
  });

  it("includes source URL when the remake came from an article or video", () => {
    const built = buildCarouselSlotRewriteContext(
      source({
        sourceUrl: "https://youtube.com/watch?v=menu-pricing",
        niche: "restaurant operators",
      })
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.context.sourceUrl).toContain("youtube.com");
    expect(built.context.brief?.topic).toContain("restaurant");
  });

  it("still grounds a vague Instagram growth idea in the stored topic", () => {
    const built = buildCarouselSlotRewriteContext(
      source({
        niche: "creators",
        angleOptionsJson: [
          {
            schemaVersion: 2,
            isLegacy: false,
            id: "brief-b",
            kicker: "GROWTH",
            title: "How to grow on Instagram",
            description: "Simple posting habits.",
            estimatedSlideCount: 6,
            topic: "How to grow on Instagram",
            inferredAudience: "creators",
            audienceReasoning: "They want reach.",
            contentGoal: "educate",
            contentFormat: "how_to",
            angleType: "framework",
            hook: "Stop posting more. Post better.",
            corePromise: "Grow with a tighter posting loop.",
            centralInsight: "Consistency beats random virality.",
            keyPoints: [],
            slideOutline: [],
            layoutFamily: "howto",
            visualDirection: "phone screens",
            imageDirection: "phone screens",
            claimRisk: "low",
            researchMode: "none",
            evidenceRequirements: [],
            prohibitedClaims: [],
            ctaDirection: "Try this for 7 days",
            scores: {
              clarity: 7,
              specificity: 6,
              novelty: 5,
              shareability: 7,
              saveability: 6,
              overall: 6,
            },
            confidence: 0.6,
          },
        ],
      })
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.context.brief?.topic).toBe("How to grow on Instagram");
  });

  it("rejects unknown slides and slots", () => {
    expect(
      buildCarouselSlotRewriteContext(source({ slideId: "slide_99" })).ok
    ).toBe(false);
    expect(
      buildCarouselSlotRewriteContext(source({ slotId: "missing" })).ok
    ).toBe(false);
  });

  it("extracts factual numbers from selected copy", () => {
    expect(
      extractCarouselRewriteFacts(
        "Owners cut 12% off popular plates and lose $4,200."
      )
    ).toEqual(["12%", "$4,200"]);
  });
});

describe("carousel slot rewrite validation", () => {
  const context = {
    slot: {
      id: "headline",
      role: "headline",
      label: "Headline",
      budget: { min: 8, max: 40 },
      currentText: "Cut 12% without a food-cost check",
    },
    factsToPreserve: ["12%"],
  };

  it("rejects empty, overflowing, or fact-dropping copy", () => {
    expect(validateCarouselSlotRewriteText("   ", context).ok).toBe(false);
    expect(
      validateCarouselSlotRewriteText(
        "This headline is far too long for the slot budget",
        context
      ).ok
    ).toBe(false);
    expect(
      validateCarouselSlotRewriteText("Cut prices without a check", context)
    ).toEqual({ ok: false, reason: "missing_fact" });
  });

  it("accepts shorter copy that keeps the original number", () => {
    expect(
      validateCarouselSlotRewriteText("Hold the 12% food-cost check", context, {
        requireShorterThan: context.slot.currentText,
      })
    ).toEqual({ ok: true, text: "Hold the 12% food-cost check" });
  });

  it("requires exactly 3 valid alternatives", () => {
    const ok = validateCarouselSlotRewriteAlternatives(
      [
        "Keep the 12% food-cost check",
        "Run the 12% food-cost math",
        "12% cuts hide food cost",
      ],
      context
    );
    expect(ok.ok).toBe(true);
    expect(
      validateCarouselSlotRewriteAlternatives(["only one"], context).ok
    ).toBe(false);
  });

  it("rejects the current line and near-duplicate alternatives", () => {
    expect(
      validateCarouselSlotRewriteAlternatives(
        [
          "Cut 12% without a food-cost check",
          "Price after 12%",
          "12% cuts hide cost",
        ],
        context
      ).ok
    ).toBe(false);
    expect(
      validateCarouselSlotRewriteAlternatives(
        [
          "Keep the 12% food-cost check",
          "Keep that 12% food-cost check",
          "12% cuts hide food cost",
        ],
        context
      ).ok
    ).toBe(false);
  });

  it("rejects a longer, weaker punchier rewrite", () => {
    expect(
      validateCarouselSlotRewriteText(
        "I wasn't nearly as prepared as I thought.",
        {
          slot: {
            id: "headline",
            role: "headline",
            label: "Headline",
            budget: { min: 8, max: 60 },
            currentText: "I thought I was ready. I wasn't.",
          },
          factsToPreserve: [],
        },
        { action: "make_punchier" }
      )
    ).toEqual({ ok: false, reason: "not_punchier" });
    expect(
      isPunchierCarouselRewrite(
        "I thought I was ready. I wasn't.",
        "I wasn't nearly as prepared as I thought.",
        "headline"
      )
    ).toBe(false);
    expect(
      isNearDuplicateCarouselRewrite(
        "I thought I was ready. I wasn't.",
        "I thought I was ready. I wasn't."
      )
    ).toBe(true);
    expect(
      isPunchierCarouselRewrite("PRICING", "PRICE LEAK", "kicker")
    ).toBe(true);
  });

  it("rejects punchier copy that drifts off a restaurant pricing topic", () => {
    const pricing = {
      slot: {
        id: "headline",
        role: "headline",
        label: "Headline",
        budget: { min: 8, max: 60 },
        currentText: "Your menu price is costing you profit",
      },
      factsToPreserve: [],
    };
    expect(
      validateCarouselSlotRewriteText(
        "Creators should post more this week",
        pricing,
        {
          action: "make_punchier",
          topic: "5 pricing mistakes restaurant owners make",
        }
      )
    ).toEqual({ ok: false, reason: "topic_drift" });
    expect(
      validateCarouselSlotRewriteText(
        "Cut the menu, keep the profit",
        pricing,
        { action: "make_punchier" }
      )
    ).toEqual({ ok: false, reason: "topic_drift" });
    expect(
      preservesCarouselSubjectAnchors(
        "Your menu price is costing you profit",
        "Your prices are eating your profit"
      )
    ).toBe(true);
    expect(
      validateCarouselSlotRewriteText(
        "Your prices are eating your profit",
        pricing,
        { action: "make_punchier" }
      ).ok
    ).toBe(true);
  });

  it("keeps labor-cost, food-cost, equipment, and delivery-fee subjects", () => {
    expect(
      preservesCarouselSubjectAnchors(
        "Why restaurant labor costs keep rising",
        "Hire cheaper people this week"
      )
    ).toBe(false);
    expect(
      preservesCarouselSubjectAnchors(
        "Why restaurant labor costs keep rising",
        "Payroll is eating the week"
      )
    ).toBe(true);
    expect(
      preservesCarouselSubjectAnchors(
        "Cut 12% without a food-cost check",
        "Cut 12% without a check"
      )
    ).toBe(false);
    expect(
      preservesCarouselSubjectAnchors(
        "The cheapest fridge costs more",
        "Buy cheaper kitchen tools"
      )
    ).toBe(false);
    expect(
      preservesCarouselSubjectAnchors(
        "The cheapest fridge costs more",
        "Cheap equipment costs more later"
      )
    ).toBe(true);
    expect(
      preservesCarouselSubjectAnchors(
        "The delivery fee is killing you",
        "Apps are eating your week"
      )
    ).toBe(false);
    expect(
      preservesCarouselSubjectAnchors(
        "The delivery fee is killing you",
        "Delivery fees eat the ticket"
      )
    ).toBe(true);
  });

  it("lets generic story copy stay creative when no subject family is present", () => {
    expect(
      preservesCarouselSubjectAnchors(
        "I thought I was ready. I wasn't.",
        "Ready was a lie."
      )
    ).toBe(true);
    expect(
      validateCarouselSlotRewriteText(
        "Ready was a lie.",
        {
          slot: {
            id: "headline",
            role: "headline",
            label: "Headline",
            budget: { min: 8, max: 48 },
            currentText: "I thought I was ready. I wasn't.",
          },
          factsToPreserve: [],
        },
        { action: "make_punchier" }
      ).ok
    ).toBe(true);
  });

  it("allowlists only the five AI actions", () => {
    expect(isCarouselSlotRewriteAction("make_punchier")).toBe(true);
    expect(isCarouselSlotRewriteAction("regenerate_slide")).toBe(false);
    expect(isCarouselSlotRewriteAction("rewrite_carousel")).toBe(false);
  });
});
