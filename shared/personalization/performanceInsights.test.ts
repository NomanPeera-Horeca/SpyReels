import { describe, expect, it } from "vitest";
import {
  buildPerformancePanels,
  MIN_COMPARISON_BASELINE,
  MIN_COMPARISON_GROUP,
  type InsightPost,
} from "./performanceInsights";

const NOW = new Date("2026-10-20T12:00:00.000Z");

function post(partial: Partial<InsightPost> & { postId: string; views: number }): InsightPost {
  return {
    url: `https://example.com/${partial.postId}`,
    publishedAt: "2026-09-01T12:00:00.000Z",
    likes: 10,
    comments: 2,
    durationSec: 30,
    caption: "A normal update",
    thumbnailUrl: null,
    videoUrl: null,
    ...partial,
  };
}

describe("performance insights", () => {
  it("reports a question-opening view multiple from real views only", () => {
    const posts: InsightPost[] = [
      post({ postId: "q1", views: 5000, caption: "Why do restaurants waste food?" }),
      post({ postId: "q2", views: 4800, caption: "What should you prep first?" }),
      post({ postId: "q3", views: 4600, caption: "How do you price a menu?" }),
      post({ postId: "a1", views: 1000, caption: "Sunday specials are live" }),
      post({ postId: "a2", views: 1100, caption: "New fryer in the kitchen" }),
      post({ postId: "a3", views: 900, caption: "Team photo from service" }),
    ];
    const panels = buildPerformancePanels(posts, NOW);
    expect(panels.goal?.confidence).toBe("eligible");
    expect(panels.goal?.figure).toBe("4.8x");
    expect(panels.goal?.headline).toBe(
      "Videos starting with a question average 4.8x more views."
    );
    expect(panels.goal?.comparison).toMatchObject({
      metric: "views",
      groupCount: MIN_COMPARISON_GROUP,
      baselineCount: MIN_COMPARISON_BASELINE,
      baselineValue: 1000,
    });
    expect(panels.goal?.headline.toLowerCase()).not.toContain("watch");
  });

  it("does not divide by a zero or missing baseline", () => {
    const posts: InsightPost[] = [
      post({ postId: "q1", views: 5000, caption: "Why now?" }),
      post({ postId: "q2", views: 4000, caption: "How come?" }),
      post({ postId: "q3", views: 3000, caption: "What next?" }),
      post({ postId: "z1", views: 0, caption: "Plain one" }),
      post({ postId: "z2", views: 0, caption: "Plain two" }),
      post({ postId: "z3", views: 0, caption: "Plain three" }),
    ];
    const panels = buildPerformancePanels(posts, NOW);
    expect(panels.goal?.figure).toBeNull();
    expect(panels.goal?.confidence).toBe("qualitative");
  });

  it("stays qualitative when the sample is too small or the posts are too new", () => {
    const tooFew: InsightPost[] = [
      post({ postId: "q1", views: 9000, caption: "Why?" }),
      post({ postId: "q2", views: 8000, caption: "How?" }),
      post({ postId: "a1", views: 1000, caption: "Update" }),
      post({ postId: "a2", views: 1000, caption: "Another update" }),
      post({ postId: "a3", views: 1000, caption: "Third update" }),
    ];
    expect(buildPerformancePanels(tooFew, NOW).goal?.figure).toBeNull();

    const tooNew = [
      post({ postId: "q1", views: 9000, caption: "Why?", publishedAt: "2026-10-20T10:00:00.000Z" }),
      post({ postId: "q2", views: 8000, caption: "How?", publishedAt: "2026-10-20T10:00:00.000Z" }),
      post({ postId: "q3", views: 7000, caption: "What?", publishedAt: "2026-10-20T10:00:00.000Z" }),
      post({ postId: "a1", views: 1000, caption: "Update", publishedAt: "2026-10-20T10:00:00.000Z" }),
      post({ postId: "a2", views: 1000, caption: "Another", publishedAt: "2026-10-20T10:00:00.000Z" }),
      post({ postId: "a3", views: 1000, caption: "Third", publishedAt: "2026-10-20T10:00:00.000Z" }),
    ];
    expect(buildPerformancePanels(tooNew, NOW).goal?.figure).toBeNull();
  });

  it("uses engagement only from likes and comments, and keeps screens on different videos", () => {
    const posts: InsightPost[] = [
      post({
        postId: "q1",
        views: 2000,
        likes: 400,
        comments: 40,
        caption: "Why do restaurants waste food?",
        topicLabel: "Food waste",
      }),
      post({
        postId: "q2",
        views: 1800,
        likes: 360,
        comments: 20,
        caption: "What should you prep first?",
        topicLabel: "Food waste",
      }),
      post({
        postId: "q3",
        views: 1600,
        likes: 300,
        comments: 20,
        caption: "How do you price a menu?",
        topicLabel: "Food waste",
      }),
      post({
        postId: "d1",
        views: 4000,
        likes: 20,
        comments: 1,
        caption: "Walk through the line",
        formatLabel: "product_demo",
        topicLabel: "Equipment",
        durationSec: 50,
      }),
      post({
        postId: "d2",
        views: 4200,
        likes: 20,
        comments: 1,
        caption: "Show the fryer",
        formatLabel: "product_demo",
        topicLabel: "Equipment",
        durationSec: 55,
      }),
      post({
        postId: "d3",
        views: 3800,
        likes: 18,
        comments: 1,
        caption: "Unbox the oven",
        formatLabel: "product_demo",
        topicLabel: "Equipment",
        durationSec: 60,
      }),
    ];
    const panels = buildPerformancePanels(posts, NOW);
    expect(panels.audience?.comparison?.metric).toBe("engagement_rate");
    expect(panels.audience?.headline).toContain("higher engagement");
    expect(panels.audience?.headline.toLowerCase()).not.toContain("watch");
    expect(panels.pillars?.headline).toContain("about food waste");
    const ids = [panels.goal?.postId, panels.audience?.postId, panels.pillars?.postId];
    expect(new Set(ids).size).toBe(3);
  });

  it("does not claim an engagement rate when likes or comments are missing or zero", () => {
    const posts: InsightPost[] = [
      post({ postId: "q1", views: 1000, likes: 400, comments: null, caption: "Why waste food?" }),
      post({ postId: "q2", views: 1000, likes: 400, comments: 0, caption: "What should you prep?" }),
      post({ postId: "q3", views: 1000, likes: null, comments: 40, caption: "How do you price a menu?" }),
      post({ postId: "a1", views: 1000, likes: 20, comments: 2, caption: "Sunday specials" }),
      post({ postId: "a2", views: 1000, likes: 20, comments: 2, caption: "New fryer" }),
      post({ postId: "a3", views: 1000, likes: 20, comments: 2, caption: "Team photo" }),
    ];
    const panels = buildPerformancePanels(posts, NOW);
    const headlines = [panels.goal?.headline, panels.audience?.headline, panels.pillars?.headline];
    expect(headlines.some(line => line?.includes("higher engagement"))).toBe(false);
    expect(panels.audience?.comparison?.metric).not.toBe("engagement_rate");
  });

  it("returns an empty qualitative state when nothing was posted", () => {
    expect(buildPerformancePanels([], NOW)).toEqual({
      goal: null,
      audience: null,
      pillars: null,
    });
  });
});
