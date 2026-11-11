import { afterEach, describe, expect, it } from "vitest";
import {
  audienceTerms,
  detectLanguage,
  placesIn,
  promoMarkers,
  hasSubstance,
  isSparseProfile,
  rankForProfile,
  RELEVANCE,
  profileDescription,
  relevanceProfileText,
  type RelevanceProfile,
  type RelevanceVideo,
} from "../relevanceRanking";
import { relevanceArmFor, relevanceRankingEnabled, trialBucket } from "../relevanceHome";

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
  it("ignores audience words too broad to mean anything (business owners, small businesses)", () => {
    const t = audienceTerms([{ who: "Aspiring and new laundromat owners" }, { who: "Small business owners looking for local businesses" }]);
    expect(t).toContain("laundromat");
    expect(t).not.toEqual(expect.arrayContaining(["owner"]));
    expect(t).not.toContain("business");
    expect(t).not.toContain("small");
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
  it("embeds the subject only; audience and goals stay in the full description", () => {
    const t = relevanceProfileText(profile());
    expect(t).toContain("Niche: Fitness");
    expect(t).not.toContain("Audience:");
    expect(t).not.toContain("Goals:");
    expect(profileDescription(profile())).toContain("Audience: Busy moms with young kids");
  });
  it("leaves who-it-is-for words out of the subject, unless the subject is about those people", () => {
    expect(relevanceProfileText(profile())).toContain("Niche: Fitness for");
    expect(relevanceProfileText(profile())).not.toMatch(/moms/i);
    const parenting = relevanceProfileText(profile({ niche: "Parenting tips for new moms", category: "Parenting", pillars: [] }));
    expect(parenting).toContain("Parenting tips for new moms");
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

  it("subject first: naming the audience does not rescue an off-subject video", () => {
    // A working-mom lifestyle vlog: tagged mom-life-ish, says "moms", but not about fitness.
    const vlog = video({ caption: "A day in the life of a working mom with two kids", embedding: [0.1, 0.4, 0.4, 0], topicSlugs: ["home-workouts"] });
    const r = rankForProfile(profile(), [vlog], { limit: 5, now });
    expect(r.picked).toHaveLength(0);
    expect(r.rejected[0]?.rejected).toBe("off_subject");
  });

  it("thin niche: shows only the videos strongly on the subject and keeps looser ones apart", () => {
    const strong = video({ caption: "home workout for moms", embedding: E.momFit });
    const loose = video({ caption: "A quick home workout you can do in ten minutes", embedding: [0.3, 0.6, 0, 0.6], topicSlugs: ["home-workouts", "womens-fitness"] });
    const r = rankForProfile(profile(), [strong, loose], { limit: 10, now });
    expect(r.picked.map(p => p.video.id)).toEqual([strong.id]);
    expect(r.adjacent.map(p => p.video.id)).toEqual([loose.id]);
    expect(r.coverage).toBe("thin");
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
    // No place stated: demoted (x0.7). Here that drops it below the gate, which is correct for a place-specific creator.
    const u = [...r.picked, ...r.rejected].find(p => p.video.id === unknown.id)!;
    expect(u.flags.includes("place_not_stated") || u.rejected === "below_relevance_gate").toBe(true);
    expect(r.picked.findIndex(p => p.video.id === unknown.id)).not.toBe(0);
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

describe("sparse profiles and related inspiration", () => {
  it("a niche-label-only profile is matched by its topic tags and labelled as broad, not precise", () => {
    const sparse = profile({ niche: "Real-estate", category: null, pillars: [], subtopics: [], audiences: [], topicSlugs: new Set(["first-time-buyers"]), embedding: [0, 0, 1, 0] });
    expect(isSparseProfile(sparse)).toBe(true);
    // Moderate meaning match (would be below the strong bar), but carries the creator's topic.
    const tagged = video({ caption: "First-time buyer programs explained", topicSlugs: ["first-time-buyers"], embedding: [0.3, 0.6, 0.45, 0] });
    const r = rankForProfile(sparse, [tagged], { limit: 10, now });
    expect(r.picked.map(p => p.video.id)).toEqual([tagged.id]);
    expect(r.picked[0]?.flags).toContain("sparse_profile");
    expect(r.coverageReason).toBe("sparse_profile");
  });

  it("thin library for a detailed profile is reported as thin_library, with related capped and apart", () => {
    const strong = video({ caption: "home workout for moms", embedding: E.momFit });
    const loose = Array.from({ length: 12 }, () => video({ caption: "quick home workout", embedding: [0.3, 0.6, 0, 0.6], topicSlugs: ["home-workouts", "womens-fitness"] }));
    const r = rankForProfile(profile(), [strong, ...loose], { limit: 10, now });
    expect(r.picked).toHaveLength(1);
    expect(r.coverageReason).toBe("thin_library");
    expect(r.adjacent.length).toBeLessThanOrEqual(RELEVANCE.relatedMax);
    expect(r.adjacent.some(a => a.video.id === strong.id)).toBe(false);
  });

  it("for a place-specific creator, related inspiration never includes videos that do not name their place", () => {
    const dubai = profile({
      niche: "Dubai rental law", pillars: ["Dubai tenant rights"], audiences: [{ who: "Expats renting in Dubai" }],
      topicSlugs: new Set(["dubai-rental-laws"]), embedding: E.dubai,
    });
    const generic = video({ caption: "What tenants should check before signing a lease", embedding: [0, 0, 0.7, 0.3], topicSlugs: ["dubai-rental-laws"] });
    const r = rankForProfile(dubai, [generic], { limit: 10, now });
    expect(r.adjacent).toHaveLength(0);
  });
});

describe("related inspiration quality", () => {
  it("needs real words, not only hashtags", () => {
    expect(hasSubstance({ caption: "#room #couple #fyp #foryou #dubai", summary: null })).toBe(false);
    expect(hasSubstance({ caption: "Dubai luxury villa home tour with a pool", summary: null })).toBe(true);
    expect(hasSubstance({ caption: "#fyp", summary: "A tenant explains the three rules every Dubai landlord must follow" })).toBe(true);
  });
});

describe("trial assignment", () => {
  it("is old by default, new for everyone when on", () => {
    expect(relevanceArmFor(1, {})).toBe("old");
    expect(relevanceArmFor(1, { RELEVANCE_RANKING: "on" })).toBe("new");
  });
  it("in trial: safety-stage users get new; others by a stable bucket under the percentage", () => {
    const env = { RELEVANCE_RANKING: "trial", RELEVANCE_TRIAL_USERS: "7, 42" };
    expect(relevanceArmFor(42, env)).toBe("new");
    expect(relevanceArmFor(43, env)).toBe("old");
    const ids = Array.from({ length: 400 }, (_, i) => i + 1000);
    const newShare = ids.filter(id => relevanceArmFor(id, { RELEVANCE_RANKING: "trial", RELEVANCE_TRIAL_PERCENT: "50" }) === "new").length / ids.length;
    expect(newShare).toBeGreaterThan(0.4);
    expect(newShare).toBeLessThan(0.6);
    // Persistent: same user, same arm, every time.
    expect(trialBucket(1234)).toBe(trialBucket(1234));
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

describe("RELEVANCE_TIERS: direct matches first, related after, never mixed", () => {
  // Enough strong matches to fill the limit, plus a far more viral loose video.
  const build = () => {
    const strong = Array.from({ length: 3 }, (_, i) =>
      video({ caption: "home workout for moms", embedding: E.momFit, multiple: 5 + i })
    );
    const looseViral = video({
      caption: "A quick home workout you can do in ten minutes",
      embedding: [0.3, 0.6, 0, 0.6],
      topicSlugs: ["home-workouts", "womens-fitness"],
      multiple: 5000,
    });
    return { strong, looseViral };
  };

  it("before (tiers off): a full set of strong matches lets a loose viral video into the direct set", () => {
    const { strong, looseViral } = build();
    const r = rankForProfile(profile(), [...strong, looseViral], { limit: 3, now });
    expect(r.picked.map(p => p.video.id)).toContain(looseViral.id);
  });

  it("tiers on: direct matches are strong matches only, however viral the loose one is", () => {
    const { strong, looseViral } = build();
    const r = rankForProfile(profile(), [...strong, looseViral], { limit: 3, now, tiers: true });
    expect(r.picked.map(p => p.video.id).sort()).toEqual(strong.map(s => s.id).sort());
    expect(r.coverage).toBe("ok");
  });

  it("tiers on: with fewer direct matches, related inspiration follows them and is not counted as coverage", () => {
    const { strong, looseViral } = build();
    const r = rankForProfile(profile(), [strong[0], looseViral], { limit: 3, now, tiers: true });
    expect(r.picked.map(p => p.video.id)).toEqual([strong[0].id]);
    expect(r.adjacent.map(p => p.video.id)).toEqual([looseViral.id]);
    expect(r.coverage).toBe("thin");
  });

  it("tiers on: off-subject videos are neither direct nor related (no filler)", () => {
    const { strong } = build();
    const offSubject = video({ caption: "Restaurant menu pricing tips", embedding: E.restaurant, topicSlugs: ["home-workouts"], multiple: 9000 });
    const r = rankForProfile(profile(), [strong[0], offSubject], { limit: 3, now, tiers: true });
    expect(r.picked.map(p => p.video.id)).toEqual([strong[0].id]);
    expect(r.adjacent).toHaveLength(0);
  });
});

describe("homeVideoItems", () => {
  it("ranked library videos come first and pool videos are not used as filler", async () => {
    const { homeVideoItems } = await import("../libraryHome");
    const k = (x: string) => x;
    expect(homeVideoItems(["pool1", "pool2"], { items: ["direct1"], ranked: true }, 4, k)).toEqual(["direct1"]);
    expect(homeVideoItems(["pool1", "pool2"], { items: ["lib1"] }, 4, k)).toEqual(["pool1", "pool2", "lib1"]);
    expect(homeVideoItems(["pool1"], null, 4, k)).toEqual(["pool1"]);
  });
});

describe("ranking before topic matching (brand-new creator)", () => {
  it("finds direct matches by meaning when the profile has no topics yet", () => {
    const fresh = profile({ topicSlugs: new Set() });
    const onSubject = video({ caption: "home workout for moms", embedding: E.momFit, topicSlugs: ["unrelated-topic"] });
    const offSubject = video({ caption: "Restaurant menu pricing", embedding: E.restaurant });
    const r = rankForProfile(fresh, [onSubject, offSubject], { limit: 4, now, tiers: true });
    expect(r.picked.map(p => p.video.id)).toEqual([onSubject.id]);
  });
});
