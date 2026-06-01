import { describe, expect, it } from "vitest";
import { injectPageHeadMeta, parseBlogSlugFromPath } from "./blogPageHtml";

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <title>Old title</title>
    <meta name="description" content="Old description" />
  </head>
  <body></body>
</html>`;

describe("injectPageHeadMeta", () => {
  it("replaces title and description and adds canonical/og tags", () => {
    const out = injectPageHeadMeta(SAMPLE_HTML, {
      title: "Best Meedro Alternative 2026 | SpyReels",
      description: "Compare SpyReels as a Meedro alternative for Instagram Reels creators.",
      canonical: "https://spyreels.ai/blog/guide-meedro-alternative",
      ogType: "article",
    });

    expect(out).toContain("<title>Best Meedro Alternative 2026 | SpyReels</title>");
    expect(out).toContain(
      'content="Compare SpyReels as a Meedro alternative for Instagram Reels creators."'
    );
    expect(out).not.toContain("Generic fallback");
    expect(out).toContain('rel="canonical" href="https://spyreels.ai/blog/guide-meedro-alternative"');
    expect(out).toContain('property="og:type" content="article"');
  });

  it("escapes HTML in meta values", () => {
    const out = injectPageHeadMeta(SAMPLE_HTML, {
      title: 'Test & "quotes"',
      description: "<script>alert(1)</script>",
      canonical: "https://spyreels.ai/blog/test",
    });
    expect(out).toContain("Test &amp; &quot;quotes&quot;");
    expect(out).not.toContain("<script>alert(1)</script>");
  });
});

describe("parseBlogSlugFromPath", () => {
  it("parses blog slugs", () => {
    expect(parseBlogSlugFromPath("/blog/guide-meedro-alternative")).toBe(
      "guide-meedro-alternative"
    );
    expect(parseBlogSlugFromPath("/blog/guide-meedro-alternative/")).toBe(
      "guide-meedro-alternative"
    );
    expect(parseBlogSlugFromPath("/pricing")).toBeNull();
  });
});
