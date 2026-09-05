import { describe, expect, it } from "vitest";
import {
  PLATFORM_DIVERSITY_MAX_SCORE_GAP,
  selectDiverseFeed,
  type DiversityCandidate,
} from "../diversity";

function candidate(args: {
  id: number;
  score: number;
  platform: string;
  creator?: string;
}): DiversityCandidate {
  const creator = args.creator ?? `creator-${args.id}`;
  return {
    candidateId: args.id,
    sourceId: `source-${args.id}`,
    creatorKey: creator,
    caption: `Distinct candidate ${args.id} with a unique useful lesson`,
    hook: `Hook ${args.id}`,
    contentPillar: `pillar-${args.id}`,
    format: "talking-head",
    finalScore: args.score,
    trendStatus: "proven-format",
    hidden: false,
    recentlyDismissed: false,
    recentlyShown: false,
    hashtagKey: null,
    platform: args.platform,
  };
}

describe("viralPosts diversity", () => {
  it("does not sacrifice a materially stronger candidate just to force platform variety", () => {
    const selected = selectDiverseFeed(
      [
        candidate({ id: 1, score: 0.9, platform: "instagram" }),
        candidate({ id: 2, score: 0.8, platform: "instagram" }),
        candidate({ id: 3, score: 0.6, platform: "instagram" }),
        candidate({ id: 4, score: 0.5, platform: "youtube" }),
      ],
      { min: 2, max: 3, minFinalScore: 0.45 }
    );

    expect(selected.map((item) => item.candidateId)).toEqual([1, 2, 3]);
  });

  it("prefers another platform when its score is within the soft diversity gap", () => {
    const samePlatformScore = 0.6;
    const altPlatformScore = samePlatformScore - (PLATFORM_DIVERSITY_MAX_SCORE_GAP - 0.005);
    const selected = selectDiverseFeed(
      [
        candidate({ id: 1, score: 0.9, platform: "instagram" }),
        candidate({ id: 2, score: 0.8, platform: "instagram" }),
        candidate({ id: 3, score: samePlatformScore, platform: "instagram" }),
        candidate({ id: 4, score: altPlatformScore, platform: "youtube" }),
      ],
      { min: 2, max: 3, minFinalScore: 0.45 }
    );

    expect(selected.map((item) => item.candidateId)).toEqual([1, 2, 4]);
  });
});
