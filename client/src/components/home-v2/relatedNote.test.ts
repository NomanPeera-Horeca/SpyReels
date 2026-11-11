import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ViralPost } from "@shared/viralPosts";

(globalThis as unknown as { React: typeof React }).React = React;

const base: ViralPost = {
  id: "post-1",
  sourceId: "reel-1",
  platform: "instagram",
  sourceUrl: "https://www.instagram.com/reel/reel-1/",
  thumbnailUrl: "https://example.test/reel.jpg",
  creatorName: "Hotel builder",
  creatorHandle: "hotelbuilder",
  hook: "Every duct modelled before the walls go up",
  caption: "AI-modelled hotel MEP",
  publishedAt: "2026-04-08T15:00:00.000Z",
  views: 62400,
  engagementRate: 0.035,
  trendStatus: "proven-format",
  relevanceLabel: "Related inspiration",
  relevanceReason: "",
  saved: false,
  dismissed: false,
  remade: false,
};

async function render(post: ViralPost) {
  const { HomeVideoCard } = await import("./HomeParts");
  return renderToStaticMarkup(
    React.createElement(HomeVideoCard, {
      post,
      busy: false,
      compact: false,
      onRemake: () => {},
      onPlay: () => {},
    })
  );
}

describe("Home card: related inspiration line", () => {
  it("a related video says so, with its tip", async () => {
    const html = await render({ ...base, fit: "related", relatedTip: "Show how kitchen ventilation is planned before fit-out" });
    expect(html).toContain('data-testid="home-related-note"');
    expect(html).toContain("Related inspiration · Show how kitchen ventilation is planned before fit-out");
  });

  it("a related video without a tip still says it is related", async () => {
    const html = await render({ ...base, fit: "related" });
    expect(html).toContain("Related inspiration</p>");
  });

  it("direct matches and unranked videos show no extra line", async () => {
    expect(await render({ ...base, fit: "direct" })).not.toContain("home-related-note");
    expect(await render(base)).not.toContain("home-related-note");
  });
});
