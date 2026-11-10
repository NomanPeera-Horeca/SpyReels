import { describe, expect, it } from "vitest";
import {
  demandFromRank,
  hashtagToPhrase,
  keywordScore,
  normalizePhrase,
  parseAutocomplete,
  pickKeywords,
  shouldRetire,
  type KeywordStats,
} from "../keywords";

const stats = (s: Partial<KeywordStats> = {}): KeywordStats => ({
  demand: 50, runs: 0, found: 0, passed: 0, viral: 0, creatorsFound: 0, goodCreators: 0, ...s,
});

describe("phrases", () => {
  it("reads Google/YouTube autocomplete answers", () => {
    expect(parseAutocomplete(["home workout", ["home workout for beginners", "home workout no equipment"]])).toEqual([
      "home workout for beginners",
      "home workout no equipment",
    ]);
    expect(parseAutocomplete({})).toEqual([]);
  });

  it("cleans phrases and hashtags", () => {
    expect(normalizePhrase("  Home  Workout #Beginners!! ")).toBe("home workout beginners");
    expect(normalizePhrase("ab")).toBeNull();
    expect(hashtagToPhrase("#home_workout")).toBe("home workout");
  });

  it("ranks earlier suggestions as higher demand", () => {
    expect(demandFromRank(0, 10)).toBeGreaterThan(demandFromRank(9, 10));
  });
});

describe("scoring", () => {
  it("prefers a phrase that found viral on-topic videos over a merely popular one", () => {
    const proven = stats({ demand: 40, runs: 3, found: 20, passed: 15, viral: 6 });
    const popularButBad = stats({ demand: 95, runs: 3, found: 20, passed: 2, viral: 0 });
    expect(keywordScore(proven)).toBeGreaterThan(keywordScore(popularButBad));
  });

  it("retires phrases that keep failing", () => {
    expect(shouldRetire(stats({ runs: 2, found: 20, passed: 3 }))).toBe(true); // 15% pass after 2 runs
    expect(shouldRetire(stats({ runs: 2, found: 20, passed: 8 }))).toBe(false);
    expect(shouldRetire(stats({ runs: 4, found: 20, passed: 10, viral: 0 }))).toBe(true);
    expect(shouldRetire(stats({ runs: 4, found: 20, passed: 10, viral: 1 }))).toBe(false);
  });

  it("mixes proven phrases with some untried ones", () => {
    const rows = [
      { phrase: "a", ...stats({ runs: 3, found: 10, passed: 9, viral: 4 }) },
      { phrase: "b", ...stats({ runs: 3, found: 10, passed: 2, viral: 0 }) },
      { phrase: "c", ...stats({ runs: 3, found: 10, passed: 7, viral: 2 }) },
      { phrase: "new-high", ...stats({ demand: 90 }) },
      { phrase: "new-low", ...stats({ demand: 20 }) },
    ];
    const picked = pickKeywords(rows, 3).map(r => r.phrase);
    expect(picked).toEqual(["a", "c", "new-high"]);
  });
});

describe("Instagram phrases", () => {
  it("turns a search phrase into a hashtag", async () => {
    const { phraseToHashtag } = await import("../keywords");
    expect(phraseToHashtag("Meal prep for beginners!")).toBe("mealprepforbeginners");
    expect(phraseToHashtag("a")).toBeNull();
    expect(phraseToHashtag("x".repeat(60))).toBeNull();
  });

  it("records only the phrases that were searched", async () => {
    const { searchedPick } = await import("../keywords");
    const pick = { topicSlug: "t", queries: ["a b", "c d"], idByQuery: new Map([["a b", 1], ["c d", 2]]) };
    const out = searchedPick(pick, ["c d"]);
    expect(out.queries).toEqual(["c d"]);
    expect([...out.idByQuery]).toEqual([["c d", 2]]);
  });
});
