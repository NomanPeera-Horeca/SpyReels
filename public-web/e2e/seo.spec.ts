import { expect, test } from "@playwright/test";

test.describe("Viral Reel Finder raw HTML", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "SEO assertions run once");
  });

  test("server HTML is crawlable without JavaScript", async ({ request }) => {
    const response = await request.get("/features/viral-reel-finder");
    expect(response.ok()).toBeTruthy();
    const html = await response.text();

    expect(html).toContain("<title>Viral Reel Finder for Instagram | SpyReels</title>");
    expect(html).toContain('rel="canonical" href="https://spyreels.ai/features/viral-reel-finder"');
    expect(html).toMatch(/name="description" content="Free viral Reel finder for Instagram/);
    expect(html).toContain("Find");
    expect(html).toContain("viral");
    expect(html).toContain("Instagram Reels in your niche");
    expect(html).toContain("Research to ready-to-film in 3 minutes");
    expect(html).toContain("Questions about finding viral Reels.");
    expect(html).toContain("Is SpyReels a free viral finder?");
    expect(html).toContain("Reel finder vs Instagram Search");
    expect(html).toContain("https://spyreels.ai/free-tools/tiktok-viral-video-finder");
    expect(html).toContain("https://spyreels.ai/free-tools/viral-hooks");
    expect(html).toContain("How it works");
    expect(html).toContain("https://spyreels.ai/blog/guide-how-to-search-reels-on-instagram");
    expect(html).toContain("application/ld+json");
    expect(html).toContain("SoftwareApplication");
    expect(html).toContain("FAQPage");
    expect(html).toContain("BreadcrumbList");
    expect(html).not.toContain("seo-crawler-snapshot");
    expect(html).not.toContain("crawler-snapshot");
    expect(html).not.toContain("<video");
    expect(html).toContain("noindex");
  });

  test("preview and localhost robots stay closed", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toMatch(/Disallow:\s*\/\s*$/m);
    expect(body).not.toMatch(/Allow:\s*\/features\/viral-reel-finder/i);
  });
});
