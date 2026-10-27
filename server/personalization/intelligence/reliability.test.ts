import { describe, expect, it } from "vitest";
import type { CreatorEvidence } from "./evidence";
import { copiesSourceText, unsupportedDemographics } from "./guards";
import { parsePillarOutput } from "./pillarRecommendations";
import { firstVisibleDelayMs, safeValidationReason, stepHasLiveSuggestions } from "./recommendationService";
import { detectContentLanguage } from "./profileBasics";
import { SubtopicStoreError, planSubtopicInserts, subtopicSaveFailureFields } from "../subtopics";
import { poolNicheForCategory } from "@shared/personalization/contentTaxonomy";
import { parseAudienceOutput } from "./audienceRecommendations";
import { videoMatchText } from "../home/homeService";

const evidence: CreatorEvidence = {
  platform: "instagram",
  snippets: [{ source: "bio", text: "Commercial kitchen equipment for restaurants." }],
  topCaptions: [],
  strength: "moderate",
  sources: ["bio"],
  corpus: "commercial kitchen equipment for restaurants.",
  hash: "abc",
  outputLanguage: { code: "en", label: "English" },
  commercialSignals: true,
  declaredText: "commercial kitchen equipment for restaurants. free kitchen design.",
  postsWithViews: 0,
};

describe("family audience evidence semantics", () => {
  it("treats kids and children as equivalent when the captions mention either", () => {
    expect(unsupportedDemographics(
      "Parents helping children with morning routines",
      "family of five, morning routine with three kids under eight"
    )).toEqual([]);
    expect(unsupportedDemographics(
      "Parents helping kids with school",
      "parenting two children while working"
    )).toEqual([]);
  });

  it("still rejects unsupported demographic claims", () => {
    expect(unsupportedDemographics(
      "Advice for children, women, and teenagers",
      "adult hiking tips"
    )).toEqual(["children", "women", "teenagers"]);
    expect(unsupportedDemographics(
      "For mothers and girls who hike",
      "weekend hikes and trail tips"
    )).toEqual(["mothers", "girls"]);
  });
});

describe("suggestion guards", () => {
  it("rejects a goal that copies a stretch of the biography", () => {
    expect(
      copiesSourceText(
        "Commercial kitchen equipment for restaurants free kitchen design today.",
        "commercial kitchen equipment for restaurants free kitchen design"
      )
    ).toBe(true);
  });

  it("allows a short purpose sentence that only shares a few words", () => {
    expect(
      copiesSourceText(
        "Help restaurant owners choose the right equipment.",
        evidence.declaredText
      )
    ).toBe(false);
  });

  it("drops one bad pillar and keeps the rest", () => {
    const parsed = parsePillarOutput(
      {
        pillars: [
          {
            title: "This title is far too long for a pillar",
            serves: "This explanation should be ignored because the title is too long.",
          },
          {
            title: "Menu pricing",
            serves: "Shows owners how to price a menu without guessing.",
            subtopics: ["Food cost", "Menu pricing", "Weekly specials"],
          },
          {
            title: "Kitchen layout",
            serves: "Helps founders plan a kitchen that can actually run service.",
            subtopics: ["Line setup"],
          },
          {
            title: "Staff training",
            serves: "Gives owners a simple way to train a new team.",
          },
        ],
        confidence: "medium",
      },
      evidence,
      "Help restaurant owners run a profitable kitchen.",
      [],
      []
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pillars.map(p => p.title)).toEqual([
      "Menu pricing",
      "Kitchen layout",
      "Staff training",
    ]);
    expect(parsed.value.subtopics[0]).toEqual([
      "Food cost",
      "Menu pricing",
      "Weekly specials",
    ]);
    expect(parsed.value.pillars.every(p => p.viewSharePercent === null)).toBe(true);
  });

  it("accepts title-case pillar labels and still drops an invented brand", () => {
    const parsed = parsePillarOutput(
      {
        pillars: [
          {
            title: "Menu Pricing",
            serves: "Shows owners how to price a menu without guessing.",
            subtopics: ["Food cost", "Menu pricing", "Weekly specials"],
          },
          {
            title: "Kitchen Layout",
            serves: "Helps founders plan a kitchen that can actually run service.",
            subtopics: ["Line setup"],
          },
          {
            title: "Weekly HorecaStore",
            serves: "Gives owners a simple way to train a new team.",
          },
          {
            title: "Staff Training",
            serves: "Gives owners a simple way to train a new team.",
          },
        ],
        confidence: "medium",
      },
      evidence,
      "Help restaurant owners run a profitable kitchen.",
      [],
      []
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pillars.map(p => p.title)).toEqual([
      "Menu Pricing",
      "Kitchen Layout",
      "Staff Training",
    ]);
  });

  it("reports a pillar validation failure without profile text", () => {
    expect(safeValidationReason("goal names things not in the evidence (HorecaStore)")).toBe(
      "goal names things not in the evidence"
    );
    expect(
      stepHasLiveSuggestions(
        [
          { kind: "niche", status: "suggested" },
          { kind: "language", status: "confirmed" },
          { kind: "pillar", status: "superseded" },
        ],
        "goal"
      )
    ).toBe(true);
    expect(
      stepHasLiveSuggestions([{ kind: "pillar", status: "superseded" }], "pillars")
    ).toBe(false);
  });

  it("detects Spanish from the profile text and does not guess from an empty bio", () => {
    expect(
      detectContentLanguage("Cocina para restaurante y también para el equipo de sala.")
        ?.code
    ).toBe("es");
    expect(detectContentLanguage("hi")).toBeNull();
    expect(detectContentLanguage("Restaurant")).toBeNull();
    expect(
      detectContentLanguage(
        "Commercial kitchen equipment for restaurants. Order online or DM for a quote."
      )?.code
    ).toBe("en");
    expect(
      detectContentLanguage(
        "Daily strategies to grow your restaurant. Shop our catalog and supplies."
      )?.code
    ).toBe("en");
    expect(detectContentLanguage("Restaurant supplies")).toBeNull();
    expect(
      detectContentLanguage("para el restaurante and your menu today")?.code
    ).not.toBe("en");
  });
});

describe("pillar subtopics", () => {
  const title = "restaurant profitability";

  it("does not insert a duplicate or a dismissed topic", () => {
    const labels = planSubtopicInserts({
      labels: ["Food cost", "food   cost", "Menu pricing", "Restaurant P&L"],
      pillarItemId: "pillar-1",
      normalizedPillarTitle: title,
      existing: [
        {
          pillarItemId: "pillar-1",
          normalizedLabel: "food cost",
          normalizedPillarTitle: title,
          status: "dismissed",
        },
        {
          pillarItemId: "pillar-old",
          normalizedLabel: "menu pricing",
          normalizedPillarTitle: title,
          status: "dismissed",
        },
      ],
    });
    expect(labels).toEqual(["Restaurant P&L"]);
  });

  it("allows a dismissed topic again when the pillar title changed", () => {
    const labels = planSubtopicInserts({
      labels: ["Food cost"],
      pillarItemId: "pillar-2",
      normalizedPillarTitle: "guest experience",
      existing: [
        {
          pillarItemId: "pillar-1",
          normalizedLabel: "food cost",
          normalizedPillarTitle: title,
          status: "dismissed",
        },
      ],
    });
    expect(labels).toEqual(["Food cost"]);
  });
});

describe("release A corrections", () => {
  it("names a missing topic migration without profile text", () => {
    const fields = subtopicSaveFailureFields(
      new SubtopicStoreError(["migration 0104: table pillar_subtopics is missing"])
    );
    expect(fields).toEqual({
      code: "subtopic_store",
      missing: ["migration 0104: table pillar_subtopics is missing"],
    });
    expect(JSON.stringify(fields)).not.toMatch(/bio|caption/i);
  });

  it("records the visible delay only after a suggestion exists", () => {
    const confirmedAt = new Date("2026-10-23T13:50:43.001Z");
    expect(firstVisibleDelayMs(confirmedAt, 0, confirmedAt.getTime() + 5700)).toBeNull();
    expect(firstVisibleDelayMs(confirmedAt, 1, confirmedAt.getTime() + 5700)).toBe(5700);
    expect(firstVisibleDelayMs(null, 1, Date.now())).toBeNull();
  });
});

describe("Home niche freshness", () => {
  it("keeps Home on the confirmed label and does not invent a pool for a missing category", () => {
    expect(
      videoMatchText({
        hasProfile: true,
        nicheLabel: "Restaurants & Cafes",
        categoryLabel: null,
        featuredNicheSlug: null,
        description: "Restaurants & Cafes. Help fitness coaches sign clients.",
        pillarTitles: ["Menu engineering"],
        goalText: "Help fitness coaches sign clients.",
        audienceText: "Restaurant owners. Lower food cost",
        personalizationComplete: true,
        nextStep: null,
      })
    ).toBe("Restaurants & Cafes");
    expect(poolNicheForCategory(null)).toBeNull();
    expect(poolNicheForCategory("unknown")).toBeNull();
  });
});

describe("audience and pillar offer guards", () => {
  const hobby: CreatorEvidence = {
    ...evidence,
    commercialSignals: false,
    corpus: "funny pet edits. link in bio for my favorite pet products.",
    declaredText: "funny pet edits. link in bio for my favorite pet products.",
  };

  it("keeps a valid audience when another suggestion is generic or an affiliate pitch", () => {
    const parsed = parseAudienceOutput(
      {
        audiences: [
          { who: "Pet owners", outcome: "laugh at animal clips", why: "The clips are about pets." },
          { who: "Short-form video enthusiasts", outcome: "watch more clips", why: "They scroll." },
          { who: "Pet product shoppers", outcome: "buy recommended products", why: "The link mentions products." },
          {
            who: "Aspiring app founders",
            outcome: "ship a first business",
            why: "The account is about building apps.",
          },
        ],
        confidence: "medium",
      },
      hobby,
      "Entertain people with funny pet clips.",
      []
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.audiences.map(a => a.who)).toEqual([
      "Pet owners",
      "Aspiring app founders",
    ]);
  });

  it("rejects an affiliate audience and a generic viewer group", () => {
    const shoppers = parseAudienceOutput(
      {
        audiences: [
          { who: "Pet product shoppers", outcome: "buy recommended products", why: "The link mentions products." },
        ],
        confidence: "medium",
      },
      hobby,
      "Entertain people with funny pet clips.",
      []
    );
    expect(shoppers.ok).toBe(false);
    const viewers = parseAudienceOutput(
      {
        audiences: [
          { who: "Short-form video enthusiasts", outcome: "watch more clips", why: "They scroll." },
        ],
        confidence: "medium",
      },
      hobby,
      "Entertain people with funny pet clips.",
      []
    );
    expect(viewers.ok).toBe(false);
  });

  it("drops a product pillar and a subjectless title, and keeps a subject pillar", () => {
    const parsed = parsePillarOutput(
      {
        pillars: [
          { title: "Pet Product Spotlights", serves: "Shows affiliate products from the link in bio." },
          { title: "Daily Life", serves: "Shares ordinary moments from the week." },
          { title: "Pet Reactions", serves: "Shows the funny reactions people already see in the clips." },
        ],
        confidence: "medium",
      },
      hobby,
      "Entertain people with funny pet clips.",
      [],
      []
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pillars.map(p => p.title)).toEqual(["Pet Reactions"]);
  });
});
