import { describe, expect, it } from "vitest";
import { isIdeaPhrase, rankSearchIdeas, searchIdeaScore } from "../searchIdeas";

const row = (phrase: string, topicSlug: string, demand: number, viral = 0, retired = 0) => ({
  phrase,
  topicSlug,
  demand,
  viral,
  runs: viral > 0 ? 1 : 0,
  retired,
});

describe("search ideas for Home", () => {
  it("keeps real video ideas, not the bare topic name or one word", () => {
    expect(isIdeaPhrase("meal prep for beginners", "Meal prep")).toBe(true);
    expect(isIdeaPhrase("meal prep", "Meal prep")).toBe(false);
    expect(isIdeaPhrase("mealprep", "Meal prep")).toBe(false);
  });

  it("merges platforms, ranks by demand plus proof, at most two per topic", () => {
    const labels = new Map([["meal", "Meal prep"], ["fit", "Home workouts"]]);
    const ideas = rankSearchIdeas(
      [
        row("meal prep for beginners", "meal", 90),
        row("meal prep for beginners", "meal", 70, 4), // same phrase, other platform: viral adds up
        row("cheap meal prep ideas", "meal", 85),
        row("meal prep for weight loss", "meal", 80),
        row("home workout no equipment", "fit", 60),
        row("retired phrase here", "fit", 99, 0, 1),
      ],
      labels,
      4
    );
    expect(ideas.map(i => i.phrase)).toEqual([
      "meal prep for beginners",
      "cheap meal prep ideas",
      "home workout no equipment",
    ]);
    expect(ideas[0]).toMatchObject({ title: "Meal prep for beginners", demand: 90, viralFound: 4, topicLabel: "Meal prep" });
  });

  it("proof raises the score but demand leads", () => {
    expect(searchIdeaScore({ demand: 60, viralFound: 8 })).toBeGreaterThan(searchIdeaScore({ demand: 60, viralFound: 0 }));
    expect(searchIdeaScore({ demand: 95, viralFound: 0 })).toBeGreaterThan(searchIdeaScore({ demand: 60, viralFound: 3 }));
  });
});
