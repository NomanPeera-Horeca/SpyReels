import { describe, expect, it } from "vitest";
import { winnerText, withOwnWinners, type OwnWinner } from "../ownWinners";
import type { RelevanceProfile } from "../relevanceRanking";

const profile: RelevanceProfile = {
  id: "p1",
  niche: "Webinars",
  pillars: ["Webinar scripting"],
  subtopics: ["Closing the pitch"],
  audiences: [],
  goals: [],
  languages: ["en"],
  topicSlugs: new Set(["webinars"]),
  embedding: [1],
};

const winner = (over: Partial<OwnWinner>): OwnWinner => ({
  candidateId: 1,
  platform: "tiktok",
  text: "How I sold $1M with one webinar",
  summary: null,
  multiple: 5,
  views: 100000,
  topicSlugs: ["paid-webinars"],
  ...over,
});

describe("winnerText", () => {
  it("takes the first sentence of the caption, trimmed", () => {
    expect(winnerText(null, "How I sold $1M with one webinar. Comment PITCH  for the link #webinar")).toBe(
      "How I sold $1M with one webinar."
    );
    expect(winnerText(null, null)).toBe("");
  });
});

describe("withOwnWinners", () => {
  it("adds winner topics and what they were about, keeping the confirmed strategy", () => {
    const p = withOwnWinners(profile, [winner({ summary: "A founder story about one paid webinar" })]);
    expect(p.niche).toBe("Webinars");
    expect(p.pillars).toEqual(["Webinar scripting"]);
    expect([...p.topicSlugs].sort()).toEqual(["paid-webinars", "webinars"]);
    expect(p.subtopics).toEqual(["Closing the pitch", "Worked for me: A founder story about one paid webinar"]);
    expect(p.embedding).toBeNull();
  });

  it("returns the profile unchanged without winners", () => {
    expect(withOwnWinners(profile, [])).toBe(profile);
  });
});
