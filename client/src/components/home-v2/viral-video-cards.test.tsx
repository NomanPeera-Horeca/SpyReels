import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ViralPost } from "@shared/viralPosts";
import { HomeVideoCard } from "./HomeParts";
import { HOME_COPY } from "./copy";

const sample: ViralPost = {
  id: "post-1",
  sourceId: "reel-1",
  platform: "instagram",
  sourceUrl: "https://www.instagram.com/reel/reel-1/",
  thumbnailUrl: "https://example.test/reel.jpg",
  creatorName: "Restaurant Mentor",
  creatorHandle: "restaurantmentor",
  hook: "Menu prices that make sense",
  caption: "How restaurants can price smarter",
  publishedAt: "2026-04-08T15:00:00.000Z",
  views: 62400,
  engagementRate: 0.035,
  trendStatus: "proven-format",
  relevanceLabel: "Restaurant business",
  relevanceReason: "Helps restaurant owners",
  saved: false,
  dismissed: false,
  remade: false,
};

describe("Home viral video card", () => {
  it("uses the approved heading and the shared portrait Result Card", () => {
    expect(HOME_COPY.videos.title).toBe("Viral Videos for you");
    const html = renderToStaticMarkup(
      <HomeVideoCard
        post={sample}
        busy={false}
        compact={false}
        onRemake={() => {}}
        onToggleSave={() => {}}
        onPlay={() => {}}
      />
    );
    expect(html).toContain('data-testid="home-result-card"');
    expect(html).toContain("Menu prices that make sense");
    expect(html).toContain("@restaurantmentor");
    expect(html).toContain("62.4K views");
    expect(html).toContain("3.5% eng");
    expect(html).toContain("Remake");
    expect(html).toContain("Save");
    // Unverified performance signals must not be fabricated on Home.
    expect(html).not.toContain("niche avg");
    expect(html).not.toContain("34x followers");
  });

  it("keeps the mobile card playable while hiding desktop Expand", () => {
    const html = renderToStaticMarkup(
      <HomeVideoCard
        post={{ ...sample, views: null, engagementRate: null, thumbnailUrl: null }}
        busy={false}
        compact
        onRemake={() => {}}
        onToggleSave={() => {}}
        onPlay={() => {}}
      />
    );
    expect(html).toContain('aria-label="Play"');
    expect(html).not.toContain('aria-label="Open video"');
    expect(html).not.toContain("null views");
    expect(html).toContain("Menu prices that make sense");
  });
});
