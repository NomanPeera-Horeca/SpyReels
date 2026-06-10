import { describe, expect, it } from "vitest";
import {
  effectiveRelevanceScore,
  failOpenRelevanceEntry,
  shouldKeepRelevanceVerdict,
  type RelevanceVerdict,
} from "./pipeline";

function verdict(
  overrides: Partial<RelevanceVerdict> & Pick<RelevanceVerdict, "score">
): RelevanceVerdict {
  return {
    shortcode: "abc123",
    relevant: true,
    languageMismatch: false,
    ...overrides,
  };
}

describe("effectiveRelevanceScore", () => {
  it("returns raw score when languageMismatch is false", () => {
    expect(effectiveRelevanceScore(verdict({ score: 72 }))).toBe(72);
  });

  it("subtracts 35 when languageMismatch is true", () => {
    expect(effectiveRelevanceScore(verdict({ score: 80, languageMismatch: true }))).toBe(
      45
    );
  });

  it("floors at 0 and does not go negative", () => {
    expect(effectiveRelevanceScore(verdict({ score: 30, languageMismatch: true }))).toBe(
      0
    );
  });
});

describe("shouldKeepRelevanceVerdict", () => {
  it("keeps when no mismatch and score is at or above 55", () => {
    const entry = shouldKeepRelevanceVerdict(verdict({ score: 55 }));
    expect(entry.keep).toBe(true);
    expect(entry.score).toBe(55);
    expect(entry.rawScore).toBe(55);
    expect(entry.languageMismatch).toBe(false);
  });

  it("drops mismatch reel when raw 80 becomes effective 45", () => {
    const entry = shouldKeepRelevanceVerdict(
      verdict({ score: 80, languageMismatch: true })
    );
    expect(entry.keep).toBe(false);
    expect(entry.score).toBe(45);
    expect(entry.rawScore).toBe(80);
    expect(entry.languageMismatch).toBe(true);
  });

  it("keeps mismatch reel at boundary when raw 90 becomes effective 55", () => {
    const entry = shouldKeepRelevanceVerdict(
      verdict({ score: 90, languageMismatch: true })
    );
    expect(entry.keep).toBe(true);
    expect(entry.score).toBe(55);
    expect(entry.rawScore).toBe(90);
  });

  it("drops mismatch reel when raw 30 floors to effective 0", () => {
    const entry = shouldKeepRelevanceVerdict(
      verdict({ score: 30, languageMismatch: true })
    );
    expect(entry.keep).toBe(false);
    expect(entry.score).toBe(0);
    expect(entry.rawScore).toBe(30);
  });

  it("drops when relevant is false regardless of language", () => {
    const entry = shouldKeepRelevanceVerdict(
      verdict({ score: 90, relevant: false, languageMismatch: false })
    );
    expect(entry.keep).toBe(false);
    expect(entry.score).toBe(90);
  });
});

describe("failOpenRelevanceEntry", () => {
  it("keeps with score 50 and no language mismatch", () => {
    const entry = failOpenRelevanceEntry();
    expect(entry.keep).toBe(true);
    expect(entry.score).toBe(50);
    expect(entry.rawScore).toBe(50);
    expect(entry.languageMismatch).toBe(false);
  });
});
