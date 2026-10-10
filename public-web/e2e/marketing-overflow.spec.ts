import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [390, 768, 1024, 1180, 1280, 1440] as const;

const PAGES = [
  { name: "homepage", path: "/" },
  { name: "viral-reel-finder", path: "/features/viral-reel-finder" },
  { name: "tiktok-viral-video-finder", path: "/free-tools/tiktok-viral-video-finder" },
  { name: "youtube-shorts-viral-finder", path: "/free-tools/youtube-shorts-viral-finder" },
] as const;

type OverflowHit = {
  scrollWidth: number;
  clientWidth: number;
  offenders: Array<{
    sel: string;
    right: number;
    width: number;
    text: string;
  }>;
};

async function measureOverflow(page: Page, viewportWidth: number): Promise<OverflowHit> {
  return page.evaluate((vw) => {
    const doc = document.documentElement;
    const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
    const clientWidth = doc.clientWidth;
    const offenders: OverflowHit["offenders"] = [];
    const seen = new Set<string>();

    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      // Intentional horizontal rails (contained).
      if (el.closest('[class*="CreatorStories"], [data-marketing-creator-stories]')) continue;
      if (el.closest(".rail, [data-overflow-ok]")) continue;

      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.right <= vw + 1 && rect.left >= -1) continue;

      const cls =
        typeof el.className === "string" && el.className
          ? el.className.split(/\s+/).slice(0, 2).join(".")
          : "";
      const sel = el.id
        ? `#${el.id}`
        : el.getAttribute("data-marketing-tool-grid") != null
          ? "[data-marketing-tool-grid]"
          : el.getAttribute("data-marketing-beyond") != null
            ? "[data-marketing-beyond]"
            : `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
      const key = `${sel}|${Math.round(rect.right)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offenders.push({
        sel,
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48),
      });
      if (offenders.length >= 12) break;
    }

    return { scrollWidth, clientWidth, offenders };
  }, viewportWidth);
}

test.describe("Marketing pages: no horizontal overflow", () => {
  for (const pageDef of PAGES) {
    for (const width of WIDTHS) {
      test(`${pageDef.name} @ ${width}px`, async ({ page }, testInfo) => {
        // Run once per page×width (avoid 4 project multiplies).
        test.skip(
          testInfo.project.name !== "desktop-1440",
          "overflow matrix runs on desktop-1440 project only"
        );

        await page.setViewportSize({ width, height: 900 });
        await page.goto(pageDef.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(200);

        const hit = await measureOverflow(page, width);
        const pageScrolls = hit.scrollWidth > hit.clientWidth + 1;
        const hasOffenders = hit.offenders.length > 0;

        expect(
          pageScrolls || hasOffenders,
          [
            `${pageDef.path} @ ${width}px`,
            `scrollWidth=${hit.scrollWidth} clientWidth=${hit.clientWidth}`,
            ...hit.offenders.map(
              (o) => `  right=${o.right} w=${o.width} ${o.sel} | ${o.text}`
            ),
          ].join("\n")
        ).toBe(false);
      });
    }
  }
});
