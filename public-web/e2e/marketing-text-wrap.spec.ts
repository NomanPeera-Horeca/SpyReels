import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  "/",
  "/features/viral-reel-finder",
  "/free-tools/tiktok-viral-video-finder",
] as const;

type MidWordBreak = {
  path: string;
  snippet: string;
  left: string;
  right: string;
};

async function findMidWordBreaks(page: Page, path: string): Promise<MidWordBreak[]> {
  return page.evaluate((pagePath) => {
    const WORD = /[A-Za-z0-9]/;
    const roots = document.querySelectorAll(
      [
        "[data-marketing-section]",
        "[data-marketing-beyond]",
        "[data-marketing-footer]",
        "[data-marketing-header]",
        "[data-marketing-hero]",
        "[data-marketing-product-demo]",
        "[data-marketing-tool-grid]",
        "[data-marketing-finder-hero]",
      ].join(",")
    );

    /** @type {MidWordBreak[]} */
    const failures = [];

    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        if (node.nodeType !== Node.TEXT_NODE) {
          node = walker.nextNode();
          continue;
        }
        const textNode = node as Text;
        const text = textNode.nodeValue ?? "";
        const parent = textNode.parentElement;
        node = walker.nextNode();
        if (!parent || !text || text.trim().length < 2) continue;

        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number.parseFloat(style.opacity || "1") === 0) continue;

        /** @type {{ top: number, ch: string, index: number }[]} */
        const chars = [];
        for (let i = 0; i < text.length; i += 1) {
          const ch = text[i];
          if (ch === "\n" || ch === "\t") continue;
          const range = document.createRange();
          range.setStart(textNode, i);
          range.setEnd(textNode, i + 1);
          const rects = range.getClientRects();
          if (!rects.length) continue;
          const rect = rects[0];
          if (rect.width === 0 && rect.height === 0) continue;
          chars.push({ top: Math.round(rect.top * 2) / 2, ch, index: i });
        }

        for (let i = 0; i < chars.length - 1; i += 1) {
          const a = chars[i];
          const b = chars[i + 1];
          if (Math.abs(a.top - b.top) < 1) continue;
          if (!WORD.test(a.ch) || !WORD.test(b.ch)) continue;
          const start = Math.max(0, a.index - 12);
          const end = Math.min(text.length, b.index + 13);
          failures.push({
            path: pagePath,
            snippet: text.slice(start, end).replace(/\s+/g, " ").trim(),
            left: a.ch,
            right: b.ch,
          });
          break;
        }
      }
    }

    return failures;
  }, path);
}

test.describe("Marketing text wrap (no mid-word breaks)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "mid-word wrap check runs at 390");
  });

  for (const path of PAGES) {
    test(`${path}: no marketing text breaks inside a word`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      const failures = await findMidWordBreaks(page, path);
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    });
  }
});
