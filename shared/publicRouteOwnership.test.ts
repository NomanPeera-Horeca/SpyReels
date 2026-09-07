import { describe, expect, it } from "vitest";
import { classifySpyReelsRoute } from "./publicRouteOwnership";

describe("classifySpyReelsRoute", () => {
  it("assigns acquisition pages to the public web renderer", () => {
    expect(classifySpyReelsRoute("/")).toBe("public-web");
    expect(classifySpyReelsRoute("/features/viral-reel-finder")).toBe("public-web");
    expect(classifySpyReelsRoute("/free-tools/viral-hooks")).toBe("public-web");
    expect(classifySpyReelsRoute("/pricing?utm_source=test")).toBe("public-web");
    expect(classifySpyReelsRoute("/blog")).toBe("public-web");
    expect(classifySpyReelsRoute("/blog/guide-reverse-engineer-viral-reels")).toBe("public-web");
  });

  it("keeps product and authoring routes in the existing app", () => {
    expect(classifySpyReelsRoute("/research")).toBe("app");
    expect(classifySpyReelsRoute("/studio")).toBe("app");
    expect(classifySpyReelsRoute("/carousels")).toBe("app");
    expect(classifySpyReelsRoute("/settings")).toBe("app");
    expect(classifySpyReelsRoute("/blog/new")).toBe("app");
    expect(classifySpyReelsRoute("/blog/edit/example")).toBe("app");
  });

  it("keeps machine endpoints with backend infrastructure", () => {
    expect(classifySpyReelsRoute("/api/trpc")).toBe("system");
    expect(classifySpyReelsRoute("/robots.txt")).toBe("system");
    expect(classifySpyReelsRoute("/sitemap.xml")).toBe("system");
    expect(classifySpyReelsRoute("/llms.txt")).toBe("system");
  });

  it("does not let unknown paths fall through as valid app pages", () => {
    expect(classifySpyReelsRoute("/definitely-not-a-real-page")).toBe("not-found");
  });
});
