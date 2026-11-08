import { describe, expect, it } from "vitest";
import { mergeRelevanceProfiles } from "../combinedProfile";
import type { RelevanceProfile } from "../relevanceRanking";

const base = (over: Partial<RelevanceProfile>): RelevanceProfile => ({
  id: "p1",
  niche: "Webinars",
  category: "Business",
  pillars: [],
  subtopics: [],
  audiences: [],
  goals: [],
  languages: [],
  topicSlugs: new Set(),
  embedding: [1, 2, 3],
  ...over,
});

describe("mergeRelevanceProfiles", () => {
  it("keeps the active profile's niche and id and unions the rest without duplicates", () => {
    const merged = mergeRelevanceProfiles(
      base({ pillars: ["Webinar scripting"], audiences: [{ who: "Coaches" }], topicSlugs: new Set(["webinars"]), languages: ["en"] }),
      [
        base({
          id: "p2",
          niche: "Personal brand",
          pillars: ["webinar scripting", "Founder brand"],
          audiences: [{ who: "coaches" }, { who: "Founders" }],
          topicSlugs: new Set(["personal-branding"]),
          languages: ["en"],
        }),
      ]
    );
    expect(merged.id).toBe("p1");
    expect(merged.niche).toBe("Webinars");
    expect(merged.pillars).toEqual(["Webinar scripting", "Founder brand"]);
    expect(merged.audiences.map(a => a.who)).toEqual(["Coaches", "Founders"]);
    expect([...merged.topicSlugs].sort()).toEqual(["personal-branding", "webinars"]);
    expect(merged.languages).toEqual(["en"]);
    expect(merged.embedding).toBeNull();
  });

  it("returns the active profile unchanged when there are no others", () => {
    const p = base({});
    expect(mergeRelevanceProfiles(p, [])).toBe(p);
  });
});
