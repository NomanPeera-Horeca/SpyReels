import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEO_INDEXING_REQUEST_HEADERS,
  canonicalMatchesPath,
  extractSeoContract,
  parseSitemapLocs,
  sitemapContainsPath,
  type SeoContract,
} from "./seo/extractSeoContract";
import { SEO_MIGRATION_TARGET_PAGES, SEO_NEXT_PAGES } from "./seo/pages";

const SEO_DIR = join(__dirname, "seo");
const SITEMAP_URL =
  process.env.SEO_SITEMAP_URL || "https://spyreels.ai/sitemap.xml";
const LIVE_ORIGIN = (process.env.SEO_LIVE_ORIGIN || "https://spyreels.ai").replace(
  /\/$/,
  ""
);

function loadBaseline(relDir: "baselines" | "migration-targets", id: string): SeoContract {
  const path = join(SEO_DIR, relDir, `${id}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as SeoContract;
}

test.describe("SEO contract baselines", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "SEO contract runs once");
  });

  let sitemapLocs: string[] = [];

  test.beforeAll(async ({ request }) => {
    const response = await request.get(SITEMAP_URL);
    expect(response.ok(), `sitemap ${SITEMAP_URL} must be reachable`).toBeTruthy();
    sitemapLocs = parseSitemapLocs(await response.text());
    expect(sitemapLocs.length).toBeGreaterThan(0);
  });

  for (const pageDef of SEO_NEXT_PAGES) {
    test(`${pageDef.id}: matches baseline + 200 + canonical + sitemap`, async ({
      request,
    }) => {
      // Simulate production host so indexing flag → robots index, follow.
      const response = await request.get(pageDef.path, {
        headers: SEO_INDEXING_REQUEST_HEADERS,
      });
      expect(response.status(), `${pageDef.path} status`).toBe(200);
      const html = await response.text();
      const actual = extractSeoContract(html, pageDef.path, response.status());
      const baseline = loadBaseline("baselines", pageDef.id);

      expect(
        actual,
        `SEO contract drift on ${pageDef.path}. Update with: pnpm test:seo:update (server needs SPYREELS_PUBLIC_WEB_INDEXING_ENABLED=true)`
      ).toEqual(baseline);
      expect(actual.robots).toMatch(/index/i);
      expect(actual.robots).not.toMatch(/noindex/i);
      expect(canonicalMatchesPath(actual.canonical, pageDef.path)).toBeTruthy();
      expect(
        sitemapContainsPath(sitemapLocs, pageDef.path),
        `${pageDef.path} missing from ${SITEMAP_URL}`
      ).toBeTruthy();
    });
  }

  for (const pageDef of SEO_MIGRATION_TARGET_PAGES) {
    test(`${pageDef.id}: migration-target baseline stays pinned (live capture)`, async () => {
      // Frozen contract: do not re-fetch live in CI (date drift / deploy churn).
      // Refresh intentionally via: SEO_LIVE_ORIGIN=... pnpm test:seo:update
      const baseline = loadBaseline("migration-targets", pageDef.id);
      expect(baseline.path).toBe(pageDef.path);
      expect(baseline.status).toBe(200);
      expect(canonicalMatchesPath(baseline.canonical, pageDef.path)).toBeTruthy();
      expect(
        sitemapContainsPath(sitemapLocs, pageDef.path),
        `${pageDef.path} missing from ${SITEMAP_URL}`
      ).toBeTruthy();
      expect(baseline.title).toBeTruthy();
      expect(baseline.h1).toBeTruthy();
      expect(baseline.jsonLd.length).toBeGreaterThanOrEqual(1);
      expect(LIVE_ORIGIN).toContain("spyreels.ai");
    });
  }
});
