import { describe, expect, it } from "vitest";
import {
  injectBlogPostStructuredData,
  injectPageHeadMeta,
  enrichSpaHtmlForPublicPath,
  parseBlogSlugFromPath,
  pathnameFromRequestUrl,
} from "./blogPageHtml";

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

describe("pathnameFromRequestUrl", () => {
  it("returns pathname without query or hash", () => {
    expect(pathnameFromRequestUrl("/blog/guide-meedro-alternative")).toBe(
      "/blog/guide-meedro-alternative"
    );
    expect(pathnameFromRequestUrl("/blog/foo?utm=1#section")).toBe("/blog/foo");
  });
});

describe("injectBlogPostStructuredData", () => {
  it("adds BlogPosting and Breadcrumb JSON-LD", () => {
    const out = injectBlogPostStructuredData(SAMPLE_HTML, {
      id: 1,
      slug: "guide-meedro-alternative",
      title: "Best Meedro Alternative",
      content: "## Frequently asked questions\n\n### What is Meedro?\n\nA tool.",
      excerpt: "Short excerpt",
      metaTitle: null,
      metaDescription: "Meta desc",
      canonicalUrl: null,
      ogImageUrl: null,
      coverImageUrl: null,
      noIndex: false,
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null,
      sourceKeyword: null,
      authorId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } as never);

    expect(out).toContain('id="blog-posting-schema"');
    expect(out).toContain('"@type":"BlogPosting"');
    expect(out).toContain('id="blog-breadcrumb-schema"');
    expect(out).toContain('id="blog-faq-schema"');
  });
});

describe("enrichSpaHtmlForPublicPath", () => {
  it("injects homepage canonical for UTM query URLs", async () => {
    const out = await enrichSpaHtmlForPublicPath(
      SAMPLE_HTML,
      "/?ref=taaft_feat&utm_source=taaft_feat&utm_medium=referral",
      async () => undefined
    );
    expect(out).toContain('rel="canonical" href="https://spyreels.ai/"');
    expect(out).toContain("Instagram Reels Spy Tool");
  });

  it("injects extension meta with non-brand-first title", async () => {
    const out = await enrichSpaHtmlForPublicPath(
      SAMPLE_HTML,
      "/extension",
      async () => undefined
    );
    expect(out).toContain("<title>Chrome Extension for Instagram Reels | Sort, Transcribe, and Save</title>");
    expect(out).toContain('rel="canonical" href="https://spyreels.ai/extension"');
    expect(out).not.toContain("<title>SpyReels - Viral Instagram Reels Intelligence</title>");
  });

  it("strips query string from blog post canonical", async () => {
    const out = await enrichSpaHtmlForPublicPath(
      SAMPLE_HTML,
      "/blog/guide-meedro-alternative?utm_source=test",
      async () =>
        ({
          id: 1,
          slug: "guide-meedro-alternative",
          title: "Best Meedro Alternative",
          content: "Body",
          excerpt: "Excerpt",
          metaTitle: "Best Meedro Alternative 2026 | SpyReels",
          metaDescription: "Meta",
          canonicalUrl: null,
          ogImageUrl: null,
          coverImageUrl: null,
          noIndex: false,
          status: "published",
          publishedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: null,
          sourceKeyword: null,
          authorId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        }) as never
    );
    expect(out).toContain('rel="canonical" href="https://spyreels.ai/blog/guide-meedro-alternative"');
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
