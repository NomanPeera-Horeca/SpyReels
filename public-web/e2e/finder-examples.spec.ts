import { expect, test } from "@playwright/test";

const FINDERS = [
  {
    name: "instagram",
    path: "/features/viral-reel-finder",
    prefix: "Try ",
    handles: ["garyvee", "humphreytalks", "codiesanchez"],
  },
  {
    name: "tiktok",
    path: "/free-tools/tiktok-viral-video-finder",
    prefix: "Try ",
    handles: ["charlidamelio", "khaby.lame", "mrbeast"],
  },
  {
    name: "youtube",
    path: "/free-tools/youtube-shorts-viral-finder",
    prefix: "Try ",
    handles: ["mrbeast", "mkbhd", "aliabdaal"],
  },
] as const;

test.describe("Finder example handles (Figma locked)", () => {
  for (const finder of FINDERS) {
    test(`${finder.name}: exactly 3 Try handles, one line at 390`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "mobile-390",
        "one-line example check runs at 390"
      );

      await page.goto(finder.path, { waitUntil: "networkidle" });

      const row = page
        .locator("p")
        .filter({
          has: page.getByRole("button", { name: `@${finder.handles[0]}`, exact: true }),
        })
        .first();

      await expect(row).toBeVisible();
      await expect(row).toContainText(finder.prefix.trim());

      for (const handle of finder.handles) {
        await expect(page.getByRole("button", { name: `@${handle}`, exact: true })).toBeVisible();
      }
      expect(finder.handles).toHaveLength(3);

      // No fourth demo handle from the old sets.
      await expect(page.getByRole("button", { name: "@russellbrunson", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "@zachking", exact: true })).toHaveCount(0);

      const metrics = await row.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          whiteSpace: style.whiteSpace,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          lineHeight: style.lineHeight,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
        };
      });

      expect(metrics.whiteSpace).toBe("nowrap");
      // Single visual line: height within ~1.75× line-height (caption + padding).
      const linePx = Number.parseFloat(metrics.lineHeight);
      expect(metrics.height).toBeLessThanOrEqual(linePx * 1.75 + 4);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
      expect(metrics.text.startsWith("Try ")).toBeTruthy();
    });
  }

  test("integration AI title is full string on mobile-390", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "mobile title lock check");
    await page.goto("/", { waitUntil: "networkidle" });
    const title = page.locator("#ai-extension").getByText("SpyReels in ChatGPT and Claude", {
      exact: true,
    });
    await expect(title).toBeVisible();
    const text = await title.innerText();
    expect(text).toBe("SpyReels in ChatGPT and Claude");
  });
});
