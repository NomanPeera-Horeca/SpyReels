import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_WEIGHTS,
  TODAY_PICKS_SCORE_WEIGHTS,
  scoreCandidate,
  type ScoredCandidateInput,
} from "../scoring";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function candidate(
  partial: Partial<ScoredCandidateInput> &
    Pick<ScoredCandidateInput, "views" | "relevanceScore" | "adaptabilityScore">
): ScoredCandidateInput {
  return {
    likes: partial.likes ?? null,
    comments: partial.comments ?? null,
    shares: partial.shares ?? null,
    saves: partial.saves ?? null,
    creatorFollowers: partial.creatorFollowers ?? 40_000,
    publishedAt: partial.publishedAt ?? new Date("2026-09-03T12:00:00.000Z"),
    views: partial.views,
    relevanceScore: partial.relevanceScore,
    adaptabilityScore: partial.adaptabilityScore,
  };
}

describe("Today Picks scoring profile", () => {
  it("lets a highly relevant remakeable reel beat a less-relevant reel with moderately better velocity", () => {
    const relevant = candidate({
      views: 300_000,
      likes: 15_000,
      comments: 600,
      creatorFollowers: 50_000,
      relevanceScore: 96,
      adaptabilityScore: 92,
    });
    const fasterLessRelevant = candidate({
      views: 360_000,
      likes: 18_000,
      comments: 720,
      creatorFollowers: 90_000,
      relevanceScore: 38,
      adaptabilityScore: 42,
    });
    const pool = [relevant, fasterLessRelevant];

    const relevantScore = scoreCandidate(
      relevant,
      pool,
      NOW,
      TODAY_PICKS_SCORE_WEIGHTS
    );
    const fasterScore = scoreCandidate(
      fasterLessRelevant,
      pool,
      NOW,
      TODAY_PICKS_SCORE_WEIGHTS
    );

    expect(relevantScore.finalScore).toBeGreaterThan(fasterScore.finalScore);
  });

  it("still ranks a strong viral relevant reel above a weak low-performance reel", () => {
    const strong = candidate({
      views: 320_000,
      likes: 18_000,
      comments: 900,
      creatorFollowers: 45_000,
      publishedAt: new Date("2026-08-29T12:00:00.000Z"),
      relevanceScore: 86,
      adaptabilityScore: 82,
    });
    const weak = candidate({
      views: 8_000,
      likes: 120,
      comments: 8,
      creatorFollowers: 20_000,
      publishedAt: new Date("2026-09-04T12:00:00.000Z"),
      relevanceScore: 52,
      adaptabilityScore: 48,
    });
    const pool = [strong, weak];

    const strongScore = scoreCandidate(strong, pool, NOW, TODAY_PICKS_SCORE_WEIGHTS);
    const weakScore = scoreCandidate(weak, pool, NOW, TODAY_PICKS_SCORE_WEIGHTS);

    expect(strongScore.finalScore).toBeGreaterThan(weakScore.finalScore);
  });

  it("does not collapse the score when follower data is missing", () => {
    const withFollowers = candidate({
      views: 180_000,
      likes: 9_000,
      comments: 400,
      creatorFollowers: 30_000,
      relevanceScore: 80,
      adaptabilityScore: 76,
    });
    const withoutFollowers = {
      ...withFollowers,
      creatorFollowers: null,
    };
    const pool = [withFollowers, withoutFollowers];

    const missing = scoreCandidate(
      withoutFollowers,
      pool,
      NOW,
      TODAY_PICKS_SCORE_WEIGHTS
    );
    const present = scoreCandidate(
      withFollowers,
      pool,
      NOW,
      TODAY_PICKS_SCORE_WEIGHTS
    );

    expect(missing.reachMultiplier).toBeNull();
    expect(missing.availability.hasFollowers).toBe(false);
    expect(missing.finalScore).toBeGreaterThan(0.3);
    expect(Math.abs(missing.finalScore - present.finalScore)).toBeLessThan(0.25);
  });

  it("keeps the default scorer backward-compatible for existing callers", () => {
    const input = candidate({
      views: 90_000,
      likes: 4_500,
      comments: 220,
      creatorFollowers: 12_000,
      relevanceScore: 70,
      adaptabilityScore: 55,
    });

    const implicit = scoreCandidate(input, [input], NOW);
    const explicit = scoreCandidate(input, [input], NOW, DEFAULT_SCORE_WEIGHTS);

    expect(implicit.finalScore).toBe(explicit.finalScore);
    expect(implicit.trendStatus).toBe(explicit.trendStatus);
    expect(implicit.availability).toEqual(explicit.availability);
  });

  it("weights relevance and remakeability more strongly than the default profile", () => {
    const highFit = candidate({
      views: 220_000,
      likes: 11_000,
      comments: 500,
      creatorFollowers: 35_000,
      relevanceScore: 94,
      adaptabilityScore: 90,
    });
    const lowFit = {
      ...highFit,
      relevanceScore: 40,
      adaptabilityScore: 42,
    };
    const pool = [highFit, lowFit];

    const defaultGap =
      scoreCandidate(highFit, pool, NOW, DEFAULT_SCORE_WEIGHTS).finalScore -
      scoreCandidate(lowFit, pool, NOW, DEFAULT_SCORE_WEIGHTS).finalScore;
    const todayGap =
      scoreCandidate(highFit, pool, NOW, TODAY_PICKS_SCORE_WEIGHTS).finalScore -
      scoreCandidate(lowFit, pool, NOW, TODAY_PICKS_SCORE_WEIGHTS).finalScore;

    expect(defaultGap).toBeGreaterThan(0);
    expect(todayGap).toBeGreaterThan(defaultGap);
    expect(TODAY_PICKS_SCORE_WEIGHTS.relevance).toBeGreaterThan(
      DEFAULT_SCORE_WEIGHTS.relevance
    );
    expect(TODAY_PICKS_SCORE_WEIGHTS.adaptability).toBeGreaterThan(
      DEFAULT_SCORE_WEIGHTS.adaptability
    );
    expect(TODAY_PICKS_SCORE_WEIGHTS.velocity).toBeLessThan(
      DEFAULT_SCORE_WEIGHTS.velocity
    );
  });
});
