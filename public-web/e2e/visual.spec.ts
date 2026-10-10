import { expect, test } from "@playwright/test";
import {
  marketingSectionHeader,
  marketingToolGrid,
  prepareVisualPage,
  visualScreenshotOptions,
  visualSectionScreenshotOptions,
} from "./visualHelpers";

const VISUAL_PROJECTS = new Set(["desktop-1440", "mobile-390"]);

type PageDef = {
  name: string;
  path: string;
  /** MarketingSectionHeader eyebrows present on this page (in page order). */
  sectionHeaders: readonly { slug: string; eyebrow: string }[];
};

const PAGES: readonly PageDef[] = [
  {
    name: "viral-reel-finder",
    path: "/features/viral-reel-finder",
    sectionHeaders: [
      { slug: "how-it-works", eyebrow: "How it works" },
      { slug: "workspace", eyebrow: "Everything in one workspace" },
      { slug: "beyond", eyebrow: "Beyond the workspace" },
      { slug: "faq", eyebrow: "Frequently asked questions" },
    ],
  },
  {
    name: "homepage",
    path: "/",
    sectionHeaders: [
      { slug: "workspace", eyebrow: "Everything in one workspace" },
      { slug: "beyond", eyebrow: "Beyond the workspace" },
    ],
  },
  {
    name: "tiktok-viral-video-finder",
    path: "/free-tools/tiktok-viral-video-finder",
    sectionHeaders: [
      { slug: "how-it-works", eyebrow: "How it works" },
      { slug: "workspace", eyebrow: "Everything in one workspace" },
      { slug: "beyond", eyebrow: "Beyond the workspace" },
      { slug: "faq", eyebrow: "Frequently asked questions" },
    ],
  },
] as const;

test.describe("public-web visual baselines", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !VISUAL_PROJECTS.has(testInfo.project.name),
      "Visual baselines run on desktop-1440 and mobile-390 only"
    );
  });

  for (const pageDef of PAGES) {
    test(`${pageDef.name} initial state`, async ({ page }) => {
      await prepareVisualPage(page, pageDef.path);

      // Initial empty finder only — never open auth or interact
      expect(page.url()).not.toMatch(/[?&]auth=/);
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Font probe for Phase 3 reporting (logged, does not affect pixels)
      const fontReport = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        const family = h1 ? getComputedStyle(h1).fontFamily : "";
        let interLoaded = false;
        try {
          interLoaded = Array.from(document.fonts).some(
            (face) => /inter/i.test(face.family) && face.status === "loaded"
          );
        } catch {
          interLoaded = false;
        }
        return {
          path: location.pathname,
          h1FontFamily: family,
          interInDocumentFonts: interLoaded,
          fontsSize: document.fonts.size,
        };
      });
      console.log(`[visual-font] ${JSON.stringify(fontReport)}`);

      await expect(page).toHaveScreenshot(`${pageDef.name}.png`, {
        ...visualScreenshotOptions,
      });

      for (const header of pageDef.sectionHeaders) {
        const loc = marketingSectionHeader(page, header.eyebrow);
        await expect(loc).toHaveCount(1);
        await loc.scrollIntoViewIfNeeded();
        await expect(loc).toHaveScreenshot(
          `${pageDef.name}-section-header-${header.slug}.png`,
          visualSectionScreenshotOptions
        );
      }

      const toolGrid = marketingToolGrid(page);
      await expect(toolGrid.locator('[id^="tool-"]').first()).toBeVisible();
      await expect
        .poll(async () => toolGrid.locator('[id^="tool-"]').count())
        .toBeGreaterThanOrEqual(4);
      await toolGrid.scrollIntoViewIfNeeded();
      await expect(toolGrid).toHaveScreenshot(
        `${pageDef.name}-tool-grid.png`,
        visualSectionScreenshotOptions
      );
    });
  }
});
