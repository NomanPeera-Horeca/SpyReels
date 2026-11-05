import { afterEach, describe, expect, it } from "vitest";
import {
  audienceTerms,
  detectLanguage,
  placesIn,
  promoMarkers,
  rankForProfile,
  RELEVANCE,
  relevanceProfileText,
  type RelevanceProfile,
  type RelevanceVideo,
} from "../relevanceRanking";
import { relevanceRankingEnabled } from "../relevanceHome";

const now = new Date("2026-11-05T12:00:00Z");
// 4-dim toy embeddings: [fitness-moms, restaurant, dubai-rent, generic-gym]
const E = {
  momFit: [1, 0, 0, 0.2],
  gym: [0.25, 0, 0, 1],
  restaurant: [0, 1, 0, 0],
  dubai: [0, 0, 1, 0],
};

function profile(over: Partial<RelevanceProfile> = {}): RelevanceProfile {
  return {
    id: "p1",
    niche: "Fitness for busy moms",
    category: "Fitness",
    pillars: ["Quick home workouts for moms: 15-minute routines"],
    subtopics: [],
    audiences: [{ who: "Busy moms with young kids", outcome: "get fit in 15 minutes a day" }],
    goals: ["Grow a coaching business"],
    languages: [],
    topicSlugs: new Set(["home-workouts", "womens-fitness"]),
    embedding: E.momFit,
    ...over,
  };
}

let nextId = 1;
function video(over: Partial<RelevanceVideo> = {}): RelevanceVideo {
  const id = nextId++;
  return {
    id,
    platform: "tiktok",
    url: `https://example.com/${id}`,
    caption: "A quick routine you can do at home",
    summary: null,
    format: "tutorial",
    topicSlugs: [],
    status: "viral",
    multiple: 10,
    publishedAt: new Date("2026-10-30T00:00:00Z"),
    creatorKey: `tiktok:creator${id}`,
    embedding: E.momFit,
    ...over,
  };
}

describe("signals", () => {
  it("finds the audience in plain words and aliases", () => {
    const t = audienceTerms([{ who: "Busy moms with young kids" }]);
    expect(t).toEqual(expect.arrayContaining(["mom", "mother", "busy", "kid"]));
  });
  it("finds places, including market words like FHA (US) and RERA (UAE)", () => {
    expect(placesIn("Renting in Dubai? Know your RERA rights")).toEqual(["uae"]);
    expect(placesIn("FHA loan for your first home")).toEqual(["us"]);
    expect(placesIn("Landlords are dumping houses as U.S. housing demand collapses")).toEqual(["us"]);
    expect(placesIn("10 meal prep ideas")).toEqual([]);
  });
  it("detects caption language by script and common words, or says unsure", () => {
    expect(detectLanguage("حان الوقت لمنيو رقمي يضاعف مبيعاتك المنيو الرقمي")).toBe("ar");
    expect(detectLanguage("How to get your first restaurant customers this week with the right offer")).toBe("en");
    expect(detectLanguage("#fyp #viral")).toBeNull();
  });
  it("counts promotional markers", () => {
    expect(promoMarkers("Factory direct supply, great quality! WhatsApp +86 138 0000 0000")).toBeGreaterThanOrEqual(2);
    expect(promoMarkers("3 menu mistakes that cost you money")).toBe(0);
  });
  it("puts audience and goals into the profile text used for its embedding", () => {
    const t = relevanceProfileText(profile());
    expect(t).toContain("Audience: Busy moms with young kids");
    expect(t).toContain("Goals: Grow a coaching business");
  });
});

describe("ranking", () => {
  it("keeps proven performance meaningful only among relevant videos: a mega-viral off-niche video does not win", () => {
    const relevant = video({ caption: "15 minute home workout for busy moms", multiple: 8, topicSlugs: ["home-workouts"] });
    const offNiche = video({ caption: "Heavy deadlift PR at the gym", embedding: E.gym, multiple: 9000, topicSlugs: ["gym-workouts"] });
    const r = rankForProfile(profile(), [offNiche, relevant], { limit: 5, now });
    expect(r.picked.map(p => p.video.id)).toEqual([relevant.id]);
    expect(r.rejected.find(x => x.video.id === offNiche.id)?.rejected).toBe("below_relevance_gate");
  });

  it("among relevant videos, the stronger performer ranks higher", () => {
    const a = video({ caption: "home workout for moms", multiple: 5 });
    const b = video({ caption: "home workout for moms", multiple: 400 });
    const r = rankForProfile(profile(), [a, b], { limit: 5, now });
    expect(r.picked[0]?.video.id).toBe(b.id);
  });

  it("does not fill weak coverage with unrelated videos", () => {
    const r = rankForProfile(profile(), [video({ caption: "Restaurant menu pricing", embedding: E.restaurant })], { limit: 10, now });
    expect(r.picked).toHaveLength(0);
    expect(r.coverage).toBe("none");
  });

  it("reports thin coverage when only a few pass", () => {
    const r = rankForProfile(profile(), [video({ caption: "home workout for moms" })], { limit: 10, now });
    expect(r.picked).toHaveLength(1);
    expect(r.coverage).toBe("thin");
  });

  it("rejects videos in a language the creator does not use", () => {
    const r = rankForProfile(profile(), [video({ caption: "Rutina rápida para mamás en casa con los niños para que la hagas hoy" })], { limit: 5, now });
    expect(r.rejected[0]?.rejected).toBe("language_mismatch");
  });

  it("for a place-specific creator, rejects another place and prefers the same place", () => {
    const dubai = profile({
      niche: "Dubai real estate investment advice",
      pillars: ["Dubai renter rights"],
      audiences: [{ who: "Expats renting in Dubai", outcome: "understand tenant rights" }],
      topicSlugs: new Set(["dubai-rental-laws"]),
      embedding: E.dubai,
    });
    const us = video({ caption: "FHA loan tips for renters in Florida", embedding: E.dubai });
    const uae = video({ caption: "Your landlord in Dubai cannot do this: RERA rules for tenants", embedding: E.dubai });
    const unknown = video({ caption: "What tenants should check before signing a lease", embedding: E.dubai });
    const r = rankForProfile(dubai, [us, uae, unknown], { limit: 5, now });
    expect(r.rejected.find(x => x.video.id === us.id)?.rejected).toBe("different_place");
    expect(r.picked[0]?.video.id).toBe(uae.id);
    expect(r.picked.find(p => p.video.id === unknown.id)?.flags).toContain("place_not_stated");
  });

  it("rejects TV and film re-uploads as not remakeable", () => {
    const r = rankForProfile(profile(), [video({ caption: "The new season of South Park premieres on September 16 #southpark" })], { limit: 5, now });
    expect(r.rejected[0]?.rejected).toBe("reupload_clip");
  });

  it("does not blanket-ban adverts: keeps a clearly relevant one with a penalty, rejects an unrelated one", () => {
    const resto = profile({
      niche: "Restaurant marketing",
      pillars: ["Promotions that bring customers in"],
      audiences: [{ who: "Independent restaurant owners" }],
      topicSlugs: new Set(["restaurant-marketing"]),
      embedding: E.restaurant,
    });
    const relevantAd = video({
      caption: "Restaurant owners: this promo filled our tables. Book now, link in bio",
      embedding: E.restaurant,
      topicSlugs: ["restaurant-marketing"],
    });
    const unrelatedAd = video({
      caption: "Professional manufacturer of kitchen equipment. Factory direct supply. WhatsApp +86 138 0000 0000",
      embedding: [0, 0.5, 0, 0.5],
      format: "product_demo",
    });
    const r = rankForProfile(resto, [relevantAd, unrelatedAd], { limit: 5, now });
    expect(r.picked.find(p => p.video.id === relevantAd.id)?.flags).toContain("advert_kept_relevant");
    expect(r.rejected.find(x => x.video.id === unrelatedAd.id)?.rejected).toMatch(/advert_not_relevant|below_relevance_gate/);
  });

  it("never rejects the language the creator writes in, even when other languages are declared", () => {
    const p = profile({ languages: ["ar"] });
    const r = rankForProfile(p, [video({ caption: "This is the quick home workout for busy moms that you can do with your kids" })], { limit: 5, now });
    expect(r.picked).toHaveLength(1);
  });

  it("shows one video per creator", () => {
    const a = video({ caption: "home workout for moms", creatorKey: "tiktok:same" });
    const b = video({ caption: "home workout for moms", creatorKey: "tiktok:same" });
    expect(rankForProfile(profile(), [a, b], { limit: 5, now }).picked).toHaveLength(1);
  });

  it("uses the documented weights and gate", () => {
    const w = RELEVANCE.weights;
    expect(w.semantic + w.topic + w.audience + w.place).toBeCloseTo(1, 10);
    expect(RELEVANCE.final.relevance + RELEVANCE.final.performance).toBeCloseTo(1, 10);
    expect(RELEVANCE.advertKeep).toBeGreaterThan(RELEVANCE.gate);
  });
});

describe("off by default", () => {
  const before = process.env.RELEVANCE_RANKING;
  afterEach(() => {
    if (before === undefined) delete process.env.RELEVANCE_RANKING;
    else process.env.RELEVANCE_RANKING = before;
  });
  it("is on only with RELEVANCE_RANKING=on", () => {
    delete process.env.RELEVANCE_RANKING;
    expect(relevanceRankingEnabled()).toBe(false);
    process.env.RELEVANCE_RANKING = "on";
    expect(relevanceRankingEnabled()).toBe(true);
  });
});
