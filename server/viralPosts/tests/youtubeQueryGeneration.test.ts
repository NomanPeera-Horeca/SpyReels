import { describe, expect, it } from "vitest";
import {
  buildYouTubeQueryFallback,
  normalizeYouTubeQueryResponse,
} from "../youtubeQueryGeneration";

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

describe("YouTube keyword query generation", () => {
  it.each([
    ["Restaurants & Cafes", "restaurant profitability"],
    ["Health & Fitness", "client growth"],
    ["Real Estate", "lead generation"],
    ["Beauty", "client acquisition"],
    ["Personal Finance", "budgeting"],
  ])("keeps deterministic fallback short and scoped for %s", (niche, pillar) => {
    const queries = buildYouTubeQueryFallback({ niche, pillar, limit: 2 });
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(wordCount(query)).toBeGreaterThanOrEqual(2);
      expect(wordCount(query)).toBeLessThanOrEqual(4);
    }
  });

  it("accepts short creator-keyword phrases and dedupes them", () => {
    expect(
      normalizeYouTubeQueryResponse(
        {
          queries: [
            "realtor leads",
            "real estate marketing",
            "REALTOR LEADS",
          ],
        },
        2
      )
    ).toEqual(["realtor leads", "real estate marketing"]);
  });

  it("rejects long natural-language questions", () => {
    expect(
      normalizeYouTubeQueryResponse(
        {
          queries: [
            "how to get more restaurant customers",
            "restaurant marketing tips",
          ],
        },
        2
      )
    ).toEqual(["restaurant marketing tips"]);
  });

  it("never leaks restaurant terms into a beauty fallback", () => {
    const queries = buildYouTubeQueryFallback({
      niche: "Beauty",
      pillar: "client retention",
      limit: 3,
    });
    const text = queries.join(" ").toLowerCase();
    expect(text).not.toContain("restaurant");
    expect(text).not.toContain("hospitality");
  });
});
