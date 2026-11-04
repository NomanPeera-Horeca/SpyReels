import { afterEach, describe, expect, it } from "vitest";
import {
  availableAt,
  demandScores,
  failureStreak,
  performanceScore,
  pickV2,
  platformMedian,
  relevanceScore,
  scoreV2,
  V2,
  type V2Input,
} from "../keywordScoringV2";
import { classifyRelevance, normalizeTokens, parseRelevanceAnswer, phraseHasTerm, topicTerms } from "../keywordRelevance";
import { nextAssignment } from "../keywordExperiment";
import { retiredUnderCurrentRule } from "../keywordPicker";
import { reportedCost } from "../searchVolume";
import { keywordScoringMode } from "../keywords";

const NOW = new Date("2026-11-04T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const base = (over: Partial<V2Input>): V2Input => ({
  id: 1,
  phrase: "x",
  demand: 80,
  searches: 0,
  found: 0,
  passed: 0,
  googleVolume: null,
  tiktokSuggested: false,
  label: "plausible",
  recentPassed: [],
  lastSearchedAt: null,
  firstSearchedAt: null,
  ...over,
});

describe("relevance terms", () => {
  it("normalizes hashtags, camelCase and plurals", () => {
    expect(normalizeTokens("#BrainRot Memes")).toEqual(["brain", "rot", "meme"]);
    expect(normalizeTokens("Home Buying Tips")).toEqual(["home", "buying", "tip"]);
  });

  it("matches joined and spaced forms", () => {
    expect(phraseHasTerm("brainrot", "brain rot")).toBe(true);
    expect(phraseHasTerm("steal a brainrot in roblox", "brain rot")).toBe(true);
    expect(phraseHasTerm("homeinspection", "home inspection")).toBe(true);
    expect(phraseHasTerm("buying a car", "home buying")).toBe(false);
  });

  it("builds terms from label pairs without generic words; long labels give no lone words", () => {
    const t = topicTerms("home buying tips", []);
    expect(t).toContain("home buying");
    expect(t).not.toContain("buying");
    expect(t).not.toContain("buying tip");
    expect(topicTerms("Meal prep", [])).toContain("meal");
  });

  it("blocks only clearly irrelevant phrases; unsure ones stay plausible", () => {
    const terms = topicTerms("home buying tips", ["mortgage", "first time buyer", "home inspection"]);
    expect(classifyRelevance({ phrase: "fha mortgage rates", terms })).toBe("relevant");
    expect(classifyRelevance({ phrase: "vancouverwa", terms, aiLabel: "irrelevant" })).toBe("irrelevant");
    expect(classifyRelevance({ phrase: "land", terms })).toBe("plausible");
    expect(classifyRelevance({ phrase: "realestate", terms, aiLabel: "plausible" })).toBe("plausible");
    // Niche jargon from the topic's own viral hashtags is disputed, not blocked.
    expect(classifyRelevance({ phrase: "tungtungtungsahur", terms: topicTerms("brain rot content and trends", []), aiLabel: "irrelevant", fromTopicVideos: true })).toBe("disputed");
    expect(relevanceScore({ label: "disputed", tiktokSuggested: false, found: 0, passed: 0 })).toBeGreaterThanOrEqual(V2.gate);
  });

  it("parses the AI answer defensively", () => {
    const r = parseRelevanceAnswer('```json\n{"aliases":["mortgage","first time buyer"],"labels":{"1":"R","2":"I","3":"X"}}\n```');
    expect(r.aliases).toEqual(["mortgage", "first time buyer"]);
    expect(r.labels.get(1)).toBe("relevant");
    expect(r.labels.get(2)).toBe("irrelevant");
    expect(r.labels.has(3)).toBe(false);
    expect(parseRelevanceAnswer("not json").labels.size).toBe(0);
  });
});

describe("scoring v2 signals", () => {
  it("relevance: label prior, replaced by observed on-topic rate", () => {
    expect(relevanceScore({ label: "plausible", tiktokSuggested: false, found: 0, passed: 0 })).toBeCloseTo(V2.priorPlausible);
    expect(relevanceScore({ label: "irrelevant", tiktokSuggested: false, found: 0, passed: 0 })).toBeLessThan(V2.gate);
    // An "irrelevant" phrase that keeps returning on-topic videos clears the gate.
    expect(relevanceScore({ label: "irrelevant", tiktokSuggested: false, found: 40, passed: 36 })).toBeGreaterThan(V2.gate);
    // A "relevant" phrase that returns off-topic videos falls below it.
    expect(relevanceScore({ label: "relevant", tiktokSuggested: false, found: 60, passed: 2 })).toBeLessThan(V2.gate);
  });

  it("demand: within-topic percentile, unknown in 0.40-0.60, zero is 0, TikTok bonus, clamped", () => {
    const d = demandScores([
      { googleVolume: 1_500_000, demand: 50, tiktokSuggested: false },
      { googleVolume: 2400, demand: 50, tiktokSuggested: false },
      { googleVolume: 10, demand: 50, tiktokSuggested: false },
      { googleVolume: 0, demand: 100, tiktokSuggested: false },
      { googleVolume: null, demand: 100, tiktokSuggested: false },
      { googleVolume: null, demand: 0, tiktokSuggested: false },
      { googleVolume: 1_500_000, demand: 50, tiktokSuggested: true },
    ]);
    // Known > 0 in this topic: 10, 2400, 1.5M, 1.5M -> mid-rank percentiles 0, 1/3, 5/6, 5/6.
    expect(d[0]).toBeCloseTo(5 / 6);
    expect(d[1]).toBeCloseTo(1 / 3);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(0);
    expect(d[4]).toBeCloseTo(0.6);
    expect(d[5]).toBeCloseTo(0.4);
    expect(d[6]).toBeCloseTo(5 / 6 + 0.15);
    expect(Math.max(...d)).toBeLessThanOrEqual(1);
  });

  it("performance: bounded, 0.5 at the median, shrunk for small samples", () => {
    const m = platformMedian([{ searches: 1, passed: 0 }, { searches: 1, passed: 2 }, { searches: 1, passed: 8 }]);
    expect(m).toBe(2);
    expect(performanceScore({ searches: 10, passed: 20 }, m)).toBeCloseTo(0.5);
    const one = performanceScore({ searches: 1, passed: 15 }, m);
    const ten = performanceScore({ searches: 10, passed: 150 }, m);
    expect(one).toBeLessThan(ten);
    expect(ten).toBeLessThan(1);
  });

  it("cooldown doubles per failure up to 30 days; parking after 6 failures over 21+ days; never permanent", () => {
    expect(failureStreak([0, 0, 3, 0])).toBe(2);
    const twoFails = availableAt({ recentPassed: [0, 0], lastSearchedAt: daysAgo(1), firstSearchedAt: daysAgo(5), searches: 2, passed: 0 }, NOW);
    expect(twoFails.at?.getTime()).toBe(daysAgo(1).getTime() + 4 * 86_400_000);
    const back = availableAt({ recentPassed: [0, 0], lastSearchedAt: daysAgo(5), firstSearchedAt: daysAgo(9), searches: 2, passed: 0 }, NOW);
    expect(back.at).toBeNull();
    const parked = availableAt({ recentPassed: [0, 0, 0, 0, 0, 0], lastSearchedAt: daysAgo(2), firstSearchedAt: daysAgo(30), searches: 6, passed: 0 }, NOW);
    expect(parked.parked).toBe(true);
    const unparked = availableAt({ recentPassed: [0, 0, 0, 0, 0, 0], lastSearchedAt: daysAgo(61), firstSearchedAt: daysAgo(90), searches: 6, passed: 0 }, NOW);
    expect(unparked).toEqual({ at: null, parked: false });
  });
});

describe("lanes and picking", () => {
  it("proven phrases go to exploit, untried and recovering ones to explore, 20% explore", () => {
    const scored = scoreV2(
      [
        base({ id: 1, phrase: "proven", label: "relevant", searches: 1, found: 11, passed: 11, recentPassed: [11], lastSearchedAt: daysAgo(1), firstSearchedAt: daysAgo(1) }),
        base({ id: 2, phrase: "also proven", label: "relevant", searches: 2, found: 14, passed: 10, recentPassed: [5, 5], lastSearchedAt: daysAgo(1), firstSearchedAt: daysAgo(3) }),
        base({ id: 3, phrase: "new relevant", label: "relevant", googleVolume: 2400 }),
        base({ id: 4, phrase: "new unrelated", label: "irrelevant", googleVolume: 368000 }),
        base({ id: 5, phrase: "cooling", label: "relevant", searches: 1, found: 6, passed: 0, recentPassed: [0], lastSearchedAt: daysAgo(1), firstSearchedAt: daysAgo(1) }),
        base({ id: 6, phrase: "recovered", label: "relevant", searches: 1, found: 6, passed: 0, recentPassed: [0], lastSearchedAt: daysAgo(3), firstSearchedAt: daysAgo(3) }),
      ],
      2,
      NOW
    );
    const lane = (id: number) => scored.find(s => s.id === id)!.lane;
    expect(lane(1)).toBe("exploit");
    expect(lane(3)).toBe("explore");
    expect(lane(4)).toBe("blocked");
    expect(lane(5)).toBe("cooling");
    expect(lane(6)).toBe("explore");
    const picked = pickV2(scored, 5);
    expect(picked.filter(p => p.pickedLane === "explore").length).toBeGreaterThanOrEqual(1);
    expect(picked.map(p => p.id)).not.toContain(4);
    expect(picked.map(p => p.id)).not.toContain(5);
    expect(picked[0].id).toBe(1);
  });

  it("huge Google volume alone does not beat a relevant proven phrase", () => {
    const scored = scoreV2(
      [
        base({ id: 1, phrase: "proven", label: "relevant", googleVolume: 10, searches: 1, found: 14, passed: 10, recentPassed: [10], lastSearchedAt: daysAgo(1), firstSearchedAt: daysAgo(1) }),
        base({ id: 2, phrase: "huge", label: "plausible", googleVolume: 1_500_000 }),
      ],
      2,
      NOW
    );
    expect(pickV2(scored, 1)[0].id).toBe(1);
  });
});

describe("experiment assignment", () => {
  it("keeps arms balanced per cell and stops at the minimum", () => {
    const cells = [
      { topicSlug: "a", platform: "tiktok", v1: 0, v2: 0 },
      { topicSlug: "b", platform: "tiktok", v1: 0, v2: 0 },
    ];
    for (let i = 0; i < 8; i += 1) {
      const next = nextAssignment(cells, 2, 7)!;
      const cell = cells.find(c => c.topicSlug === next.topicSlug)!;
      cell[next.arm] += 1;
      for (const c of cells) expect(Math.abs(c.v1 - c.v2)).toBeLessThanOrEqual(1);
    }
    expect(cells.every(c => c.v1 === 2 && c.v2 === 2)).toBe(true);
    expect(nextAssignment(cells, 2, 7)).toBeNull();
  });
});

describe("guards", () => {
  afterEach(() => {
    delete process.env.KEYWORD_SCORING;
  });

  it("production stays on current scoring unless KEYWORD_SCORING=v2", () => {
    expect(keywordScoringMode()).toBe("current");
    process.env.KEYWORD_SCORING = "V2-typo";
    expect(keywordScoringMode()).toBe("current");
    process.env.KEYWORD_SCORING = "v2";
    expect(keywordScoringMode()).toBe("v2");
  });

  it("the current arm applies the current retirement rule", () => {
    expect(retiredUnderCurrentRule({ runs: 2, found: 10, passed: 1, viral: 0, goodCreators: 0 })).toBe(true);
    expect(retiredUnderCurrentRule({ runs: 1, found: 10, passed: 1, viral: 0, goodCreators: 0 })).toBe(false);
  });

  it("reads DataForSEO's reported cost, else null (keep the reservation)", () => {
    expect(reportedCost({ cost: 0.075, tasks: [] })).toBe(0.075);
    expect(reportedCost({ tasks: [] })).toBeNull();
    expect(reportedCost(null)).toBeNull();
  });
});

describe("experiment pace", () => {
  afterEach(() => {
    delete process.env.KEYWORD_EXPERIMENT_SEARCHES_PER_TICK;
  });
  it("runs 3 searches per tick by default, bounded 1-10", async () => {
    const { experimentSearchesPerTick } = await import("../keywordExperiment");
    expect(experimentSearchesPerTick()).toBe(3);
    process.env.KEYWORD_EXPERIMENT_SEARCHES_PER_TICK = "50";
    expect(experimentSearchesPerTick()).toBe(10);
    process.env.KEYWORD_EXPERIMENT_SEARCHES_PER_TICK = "0";
    expect(experimentSearchesPerTick()).toBe(3);
  });
});
