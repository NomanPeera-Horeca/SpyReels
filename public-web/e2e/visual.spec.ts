import { expect, test } from "@playwright/test";
import {
  marketingFaq,
  marketingFinalCta,
  marketingFooter,
  marketingHeader,
  marketingPrimaryButton,
  marketingProcessSteps,
  marketingSectionHeader,
  marketingToolGrid,
  prepareVisualPage,
  screenshotWithoutStickyHeader,
  visualScreenshotOptions,
  visualSectionScreenshotOptions,
} from "./visualHelpers";

const VISUAL_PROJECTS = new Set(["desktop-1440", "mobile-390"]);

type PageDef = {
  name: string;
  path: string;
  /** MarketingSectionHeader eyebrows present on this page (in page order). */
  sectionHeaders: readonly { slug: string; eyebrow: string }[];
  /** Primary Large close-ups on this page (hero / finder-search / final-cta). */
  primaryButtons: readonly string[];
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
    primaryButtons: ["finder-search", "final-cta"],
  },
  {
    name: "homepage",
    path: "/",
    sectionHeaders: [
      { slug: "workspace", eyebrow: "Everything in one workspace" },
      { slug: "beyond", eyebrow: "Beyond the workspace" },
      { slug: "faq", eyebrow: "Frequently asked questions" },
    ],
    primaryButtons: ["hero", "final-cta"],
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
    primaryButtons: ["finder-search", "final-cta"],
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
    test(`${pageDef.name} initial state`, async ({ page }, testInfo) => {
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

      // Shared chrome shots once (homepage) — sticky header stays visible here
      if (pageDef.name === "homepage") {
        const header = marketingHeader(page);
        await expect(header).toHaveCount(1);
        await expect(header).toHaveScreenshot(
          "marketing-header-closed.png",
          visualSectionScreenshotOptions
        );

        if (testInfo.project.name === "desktop-1440") {
          const product = header.locator("details.product-menu");
          await product.evaluate((el) => {
            (el as HTMLDetailsElement).open = true;
          });
          await expect(product).toHaveAttribute("open", "");
          await expect(header).toHaveScreenshot(
            "marketing-header-product-open.png",
            visualSectionScreenshotOptions
          );
          await product.evaluate((el) => {
            (el as HTMLDetailsElement).open = false;
          });
        }

        if (testInfo.project.name === "mobile-390") {
          const toggle = header.locator("#menu-toggle");
          await toggle.click();
          await expect(header.locator("#nav-inner")).toHaveClass(/menu-open/);
          await expect(header).toHaveScreenshot(
            "marketing-header-mobile-open.png",
            visualSectionScreenshotOptions
          );
          await toggle.click();
        }

        const footer = marketingFooter(page);
        await expect(footer).toHaveCount(1);
        await screenshotWithoutStickyHeader(page, footer, async () => {
          await expect(footer).toHaveScreenshot(
            "marketing-footer.png",
            visualSectionScreenshotOptions
          );
        });
      }

      for (const header of pageDef.sectionHeaders) {
        const loc = marketingSectionHeader(page, header.eyebrow);
        await expect(loc).toHaveCount(1);
        await screenshotWithoutStickyHeader(page, loc, async () => {
          await expect(loc).toHaveScreenshot(
            `${pageDef.name}-section-header-${header.slug}.png`,
            visualSectionScreenshotOptions
          );
        });
      }

      const toolGrid = marketingToolGrid(page);
      await expect(toolGrid.locator('[id^="tool-"]').first()).toBeVisible();
      await expect
        .poll(async () => toolGrid.locator('[id^="tool-"]').count())
        .toBeGreaterThanOrEqual(4);
      await screenshotWithoutStickyHeader(page, toolGrid, async () => {
        await expect(toolGrid).toHaveScreenshot(
          `${pageDef.name}-tool-grid.png`,
          visualSectionScreenshotOptions
        );
      });

      const faq = marketingFaq(page);
      await expect(faq).toHaveCount(1);
      await expect
        .poll(async () => faq.locator("details").count())
        .toBeGreaterThanOrEqual(5);
      await screenshotWithoutStickyHeader(page, faq, async () => {
        await expect(faq).toHaveScreenshot(
          `${pageDef.name}-faq.png`,
          visualSectionScreenshotOptions
        );
      });

      const finalCta = marketingFinalCta(page);
      await expect(finalCta).toHaveCount(1);
      await expect(finalCta.getByRole("heading", { level: 2 })).toBeVisible();
      await expect(finalCta.locator("a.sr-primary-button")).toBeVisible();
      await screenshotWithoutStickyHeader(page, finalCta, async () => {
        await expect(finalCta).toHaveScreenshot(
          `${pageDef.name}-final-cta.png`,
          visualSectionScreenshotOptions
        );
      });

      const processSteps = marketingProcessSteps(page);
      await expect(processSteps).toHaveCount(1);
      await expect(processSteps.locator("article")).toHaveCount(3);
      await screenshotWithoutStickyHeader(page, processSteps, async () => {
        await expect(processSteps).toHaveScreenshot(
          `${pageDef.name}-process-steps.png`,
          visualSectionScreenshotOptions
        );
      });

      for (const kind of pageDef.primaryButtons) {
        const button = marketingPrimaryButton(page, kind);
        await expect(button).toHaveCount(1);
        await screenshotWithoutStickyHeader(page, button, async () => {
          await expect(button).toHaveScreenshot(
            `${pageDef.name}-primary-button-${kind}.png`,
            visualSectionScreenshotOptions
          );
        });
      }
    });
  }
});
