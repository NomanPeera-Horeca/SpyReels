import { expect, test } from "@playwright/test";

test.describe("Viral Reel Finder raw HTML", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "SEO assertions run once");
  });

  test("server HTML is crawlable without JavaScript", async ({ request }) => {
    const response = await request.get("/features/viral-reel-finder");
    expect(response.ok()).toBeTruthy();
    const html = await response.text();

    expect(html).toContain("<title>Instagram Reel Spy Tool - Find Any Account&#x27;s Viral Reels Free</title>");
    expect(html).toContain('rel="canonical" href="https://spyreels.ai/features/viral-reel-finder"');
    expect(html).toMatch(/name="description" content="Search any Instagram creator/);
    expect(html).toContain("Any Instagram account");
    expect(html).toContain("Three steps from competitor account");
    expect(html).toContain("Questions about the Instagram Reel Finder");
    expect(html).toContain("https://spyreels.ai/free-tools/tiktok-viral-video-finder");
    expect(html).toContain("https://spyreels.ai/blog/guide-find-viral-reels-your-niche");
    expect(html).toContain("https://spyreels.ai/blog/guide-reverse-engineer-viral-reels");
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
