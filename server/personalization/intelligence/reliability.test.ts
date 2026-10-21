import { describe, expect, it } from "vitest";
import type { CreatorEvidence } from "./evidence";
import { copiesSourceText } from "./guards";
import { parsePillarOutput } from "./pillarRecommendations";
import { detectContentLanguage } from "./profileBasics";
import { planSubtopicInserts } from "../subtopics";
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

describe("Home niche freshness", () => {
  it("matches videos to the confirmed niche label, not a blended description", () => {
    expect(
      videoMatchText({
        hasProfile: true,
        nicheLabel: "Restaurants & Cafes",
        featuredNicheSlug: "restaurants-cafes",
        description: "Restaurants & Cafes. Help fitness coaches sign clients.",
        personalizationComplete: true,
        nextStep: null,
      })
    ).toBe("Restaurants & Cafes");
  });
});
