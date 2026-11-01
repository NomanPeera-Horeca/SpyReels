import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STARTER_VIRAL_TOPICS, topicSlug, VIRAL_TOPIC_CATEGORIES } from "../../../shared/viralTopics";
import { CONTENT_TAXONOMY } from "../../../shared/personalization/contentTaxonomy";
import { cleanProfileMatch, cleanVideoTopics, profileEmbeddingText, strategyHash } from "../topics";

describe("starter topic list", () => {
  it("has the 17 approved categories, 12 topics each, unique slugs", () => {
    expect(VIRAL_TOPIC_CATEGORIES).toHaveLength(17);
    expect(STARTER_VIRAL_TOPICS).toHaveLength(17 * 12);
    expect(new Set(STARTER_VIRAL_TOPICS.map(t => t.slug)).size).toBe(STARTER_VIRAL_TOPICS.length);
  });

  it("uses the same category slugs as the content taxonomy", () => {
    const taxonomy = new Set(CONTENT_TAXONOMY.map(c => c.slug));
    for (const c of VIRAL_TOPIC_CATEGORIES) expect(taxonomy.has(c), c).toBe(true);
  });

  it("makes readable slugs", () => {
    expect(topicSlug("ChatGPT & AI prompts")).toBe("chatgpt-and-ai-prompts");
    expect(topicSlug("women's fitness")).toBe("womens-fitness");
    expect(topicSlug("café business")).toBe("cafe-business");
  });
});

describe("cleanVideoTopics", () => {
  const known = new Set(["ai-tools", "tech-news", "menu-pricing", "coding-tips"]);
  it("keeps known slugs only, max 3, no repeats", () => {
    expect(cleanVideoTopics(["AI-tools", "made-up", "ai-tools", "tech-news", "menu-pricing", "coding-tips"], known)).toEqual([
      "ai-tools",
      "tech-news",
      "menu-pricing",
    ]);
    expect(cleanVideoTopics("ai-tools", known)).toEqual([]);
  });
});

describe("cleanProfileMatch", () => {
  const known = new Set(["ai-tools", "iphone-and-apple-news"]);
  it("keeps known topics and at most 2 valid new topics", () => {
    const out = cleanProfileMatch(
      {
        topics: ["ai-tools", "nope"],
        newTopics: [
          { label: "Halal food in Dubai", category: "food" },
          { label: "AI tools", category: "tech" }, // already known
          { label: "x", category: "food" }, // too short
          { label: "Desert camping", category: "not-a-category" },
          { label: "Arabic calligraphy", category: "lifestyle" },
          { label: "Third new one", category: "travel" },
        ],
      },
      known
    );
    expect(out.topics).toEqual(["ai-tools"]);
    expect(out.newTopics.map(t => t.slug)).toEqual(["halal-food-in-dubai", "arabic-calligraphy"]);
  });

  it("returns nothing for junk", () => {
    expect(cleanProfileMatch(null, known)).toEqual({ topics: [], newTopics: [] });
  });
});

describe("strategyHash", () => {
  const base = {
    socialProfileId: "p1",
    workspaceId: "w1",
    category: "Tech",
    niche: "Apple and AI tech news",
    pillars: ["iPhone tips", "AI tools"],
    subtopics: ["iOS shortcuts"],
  };
  it("ignores order and case, changes when the strategy changes", () => {
    expect(strategyHash(base)).toBe(strategyHash({ ...base, pillars: ["ai tools", "IPHONE TIPS"] }));
    expect(strategyHash(base)).not.toBe(strategyHash({ ...base, subtopics: ["Mac setup"] }));
  });
});

describe("migration 0109", () => {
  it("only creates the eight understanding tables", () => {
    const code = readFileSync("drizzle/0109_viral_understanding.sql", "utf8")
      .split("\n")
      .filter(l => !l.trim().startsWith("--"))
      .join("\n");
    expect(code.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(8);
    expect(code).not.toMatch(/\bALTER\b|\bDROP\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b/i);
    for (const t of ["viral_video_insights", "viral_creator_topics", "shared_transcripts", "viral_processing_spend"]) {
      expect(code).toContain(t);
    }
  });
});

describe("profileEmbeddingText", () => {
  it("joins the confirmed strategy into one line", () => {
    expect(
      profileEmbeddingText({
        socialProfileId: "p",
        workspaceId: "w",
        category: "Tech",
        niche: "Apple and AI tech news",
        pillars: ["iPhone tips"],
        subtopics: [],
      })
    ).toBe("Category: Tech. Niche: Apple and AI tech news. Pillars: iPhone tips");
  });
});

describe("parseFirstJsonObject", () => {
  it("reads the JSON even with words or fences around it", async () => {
    const { parseFirstJsonObject } = await import("../topics");
    expect(parseFirstJsonObject('{"topics":["ai-tools"]}\n\nThese fit because...')).toEqual({ topics: ["ai-tools"] });
    expect(parseFirstJsonObject('Here you go:\n```json\n{"a":"x } y","b":{"c":1}}\n```')).toEqual({ a: "x } y", b: { c: 1 } });
    expect(() => parseFirstJsonObject("no json here")).toThrow();
  });
});
