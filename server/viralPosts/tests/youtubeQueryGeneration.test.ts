import { describe, expect, it } from "vitest";
import {
  buildYouTubeQueryFallback,
  normalizeYouTubeQueryResponse,
} from "../youtubeQueryGeneration";

describe("YouTube creator-language query generation", () => {
  it.each([
    ["Restaurants & Cafes", "restaurant profitability"],
    ["Health & Fitness", "client growth"],
    ["Real Estate", "lead generation"],
    ["Beauty", "client acquisition"],
    ["Personal Finance", "budgeting"],
  ])("keeps deterministic fallback scoped to the actual niche for %s", (niche, pillar) => {
    const queries = buildYouTubeQueryFallback({ niche, pillar, limit: 2 });
    expect(queries).toHaveLength(2);
    expect(queries.join(" ").toLowerCase()).toContain(niche.toLowerCase());
  });

  it("normalizes and dedupes AI queries without inventing extra entries", () => {
    expect(
      normalizeYouTubeQueryResponse(
        {
          queries: [
            "how realtors get clients",
            "  realtor marketing tips  ",
            "HOW REALTORS GET CLIENTS",
          ],
        },
        2
      )
    ).toEqual(["how realtors get clients", "realtor marketing tips"]);
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
