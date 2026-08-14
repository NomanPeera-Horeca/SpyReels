import { describe, expect, it } from "vitest";
import {
  injectBlogPostStructuredData,
  injectPageHeadMeta,
  enrichSpaHtmlForPublicPath,
  parseBlogSlugFromPath,
  pathnameFromRequestUrl,
} from "./blogPageHtml";
import { STATIC_PAGE_JSON_LD_PATHS } from "../shared/staticPageStructuredData";

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <title>Old title</title>
    <meta name="description" content="Old description" />
  </head>
  <body>
    <div id="root"></div>
  </body>
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
    expect(out.status).toBe(200);
    expect(out.html).toContain('rel="canonical" href="https://spyreels.ai/"');
    expect(out.html).toContain("Instagram Reels Tool");
  });

  it("injects extension meta with non-brand-first title", async () => {
    const out = await enrichSpaHtmlForPublicPath(
      SAMPLE_HTML,
      "/extension",
      async () => undefined
    );
    expect(out.status).toBe(200);
    expect(out.html).toContain(
      "<title>Chrome Extension for Instagram Reels | Sort, Transcribe, and Save</title>"
    );
    expect(out.html).toContain('rel="canonical" href="https://spyreels.ai/extension"');
    expect(out.html).not.toContain(
      "<title>SpyReels - Viral Instagram Reels Intelligence</title>"
    );
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
    expect(out.status).toBe(200);
    expect(out.html).toContain(
      'rel="canonical" href="https://spyreels.ai/blog/guide-meedro-alternative"'
    );
  });

  it.each(STATIC_PAGE_JSON_LD_PATHS)(
    "injects server-side JSON-LD for static page %s",
    async (pathname) => {
      const out = await enrichSpaHtmlForPublicPath(SAMPLE_HTML, pathname, async () => undefined);
      expect(out.status).toBe(200);
      expect(out.html).toContain('type="application/ld+json"');
      if (pathname === "/") {
        expect(out.html).toContain('id="home-software-schema"');
        expect(out.html).toContain('id="home-faq-schema"');
        expect(out.html).toContain('"@type":"SoftwareApplication"');
      }
      if (pathname === "/pricing") {
        expect(out.html).toContain('id="pricing-product-schema"');
        expect(out.html).toContain('id="pricing-faq-schema"');
      }
      if (pathname === "/features/viral-reel-finder") {
        expect(out.html).toContain('id="finder-software-schema"');
        expect(out.html).toContain('id="finder-faq-schema"');
      }
      if (pathname === "/free-tools/viral-hooks") {
        expect(out.html).toContain('id="hooks-software-schema"');
      }
      if (pathname === "/affiliate") {
        expect(out.html).toContain('id="affiliate-faq-schema"');
      }
      if (pathname === "/about") {
        expect(out.html).toContain('id="about-person-schema"');
        expect(out.html).toContain('id="about-organization-schema"');
      }
      if (pathname === "/contact") {
        expect(out.html).toContain('id="contact-organization-schema"');
      }
      if (pathname === "/extension") {
        expect(out.html).toContain('id="extension-software-schema"');
      }
      expect(out.html).toContain('id="seo-crawler-snapshot"');
      expect(out.html).toContain("<h1>");
    }
  );

  it("injects crawler H1 for blog posts", async () => {
    const out = await enrichSpaHtmlForPublicPath(
      SAMPLE_HTML,
      "/blog/guide-meedro-alternative",
      async () =>
        ({
          id: 1,
          slug: "guide-meedro-alternative",
          title: "Best Meedro Alternative",
          content: "Body",
          excerpt: "Short excerpt for crawlers",
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
    expect(out.status).toBe(200);
    expect(out.html).toContain("<h1>Best Meedro Alternative</h1>");
    expect(out.html).toContain("Short excerpt for crawlers");
  });

  it("returns HTTP 404 with noindex for unknown public paths like /$", async () => {
    const out = await enrichSpaHtmlForPublicPath(SAMPLE_HTML, "/$", async () => undefined);
    expect(out.status).toBe(404);
    expect(out.html).toContain('name="robots" content="noindex, nofollow"');
    expect(out.html).toContain("Page Not Found | SpyReels");
  });

  it("returns HTTP 404 for missing blog slugs", async () => {
    const out = await enrichSpaHtmlForPublicPath(
      SAMPLE_HTML,
      "/blog/spy-on-competitor-instagram-reels-strategy",
      async () => undefined
    );
    expect(out.status).toBe(404);
    expect(out.html).toContain('name="robots" content="noindex, nofollow"');
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
