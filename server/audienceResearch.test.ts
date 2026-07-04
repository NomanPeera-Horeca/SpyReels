import { describe, expect, it } from "vitest";
import {
  formatAudienceSignalsForPrompt,
  looksLikeAudienceQuestion,
  NICHE_SUBREDDITS,
  rankAudienceSignals,
} from "@shared/audienceResearch";
import { REEL_NICHE_VALUES } from "@shared/reelNiches";

describe("audienceResearch", () => {
  it("detects question-like titles", () => {
    expect(looksLikeAudienceQuestion("How do I lose belly fat?")).toBe(true);
    expect(looksLikeAudienceQuestion("Best camera for Reels")).toBe(false);
    expect(looksLikeAudienceQuestion("Should I quit my job to start a business?")).toBe(true);
  });

  it("maps every niche slug to subreddits", () => {
    for (const niche of REEL_NICHE_VALUES) {
      expect(NICHE_SUBREDDITS[niche].length).toBeGreaterThan(0);
    }
  });

  it("dedupes and ranks signals by score", () => {
    const ranked = rankAudienceSignals([
      { source: "reddit", title: "Q1", snippet: null, sourceUrl: "https://reddit.com/a", score: 10 },
      { source: "reddit", title: "Q1 duplicate", snippet: null, sourceUrl: "https://reddit.com/a", score: 50 },
      { source: "quora", title: "Q2", snippet: null, sourceUrl: "https://quora.com/b", score: 30 },
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.sourceUrl).toBe("https://reddit.com/a");
    expect(ranked[0]?.score).toBe(50);
  });

  it("formats signals for LLM prompts", () => {
    const block = formatAudienceSignalsForPrompt([
      {
        source: "reddit",
        title: "Why am I not losing weight?",
        snippet: "I track calories but scale won't move",
        sourceUrl: "https://reddit.com/r/fitness/comments/abc",
        score: 120,
      },
    ]);

    expect(block).toContain("Real audience questions");
    expect(block).toContain("[Reddit]");
    expect(block).toContain("https://reddit.com/r/fitness/comments/abc");
  });
});
