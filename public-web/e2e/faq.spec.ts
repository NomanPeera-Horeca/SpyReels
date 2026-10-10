import { expect, test } from "@playwright/test";

type FaqPair = { q: string; a: string };

const FAQ_PAGES = [
  { name: "homepage", path: "/" },
  { name: "viral-reel-finder", path: "/features/viral-reel-finder" },
  { name: "tiktok-viral-video-finder", path: "/free-tools/tiktok-viral-video-finder" },
] as const;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, "")).trim();
}

/** Visible FAQ rows from MarketingFaq SSR markup (#faq details). */
function parseVisibleFaq(html: string): FaqPair[] {
  const sectionMatch = html.match(/id="faq"[\s\S]*?<\/section>/i);
  expect(sectionMatch, "FAQ section #faq missing from SSR HTML").toBeTruthy();
  const section = sectionMatch![0];
  const pairs: FaqPair[] = [];
  const detailRe = /<details\b[\s\S]*?<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let match: RegExpExecArray | null;
  while ((match = detailRe.exec(section))) {
    const q = stripTags(match[1]);
    const answerBlock = match[2];
    const pMatch = answerBlock.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    expect(pMatch, `FAQ answer <p> missing for: ${q}`).toBeTruthy();
    const a = stripTags(pMatch![1]);
    pairs.push({ q, a });
  }
  expect(pairs.length).toBeGreaterThanOrEqual(5);
  return pairs;
}

/** FAQPage mainEntity from application/ld+json script tags. */
function parseFaqPageJsonLd(html: string): FaqPair[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  const pairs: FaqPair[] = [];
  for (const script of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(script[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as { "@type"?: string; mainEntity?: unknown };
      if (record["@type"] !== "FAQPage" || !Array.isArray(record.mainEntity)) continue;
      for (const entity of record.mainEntity) {
        if (!entity || typeof entity !== "object") continue;
        const question = entity as {
          name?: unknown;
          acceptedAnswer?: { text?: unknown };
        };
        expect(typeof question.name).toBe("string");
        expect(typeof question.acceptedAnswer?.text).toBe("string");
        pairs.push({
          q: String(question.name),
          a: String(question.acceptedAnswer?.text),
        });
      }
    }
  }
  expect(pairs.length, "FAQPage JSON-LD missing or empty").toBeGreaterThanOrEqual(5);
  return pairs;
}

test.describe("Marketing FAQ SSR + FAQPage JSON-LD parity", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "FAQ SSR assertions run once");
  });

  for (const pageDef of FAQ_PAGES) {
    test(`${pageDef.name}: answers in SSR HTML and exact FAQPage match`, async ({ request }) => {
      const response = await request.get(pageDef.path);
      expect(response.ok()).toBeTruthy();
      const html = await response.text();

      const visible = parseVisibleFaq(html);
      const jsonLd = parseFaqPageJsonLd(html);

      expect(jsonLd, "FAQPage Q/A must exactly match visible FAQ").toEqual(visible);

      for (const item of visible) {
        expect(html).toContain(item.q);
        const encodedA = item.a.replace(/'/g, "&#x27;");
        expect(
          html.includes(item.a) || html.includes(encodedA),
          `SSR HTML missing answer for: ${item.q}`
        ).toBeTruthy();
      }
    });
  }
});

/** Plus is horizontal+vertical path; Minus is horizontal only. */
async function assertFaqIconState(
  row: import("@playwright/test").Locator,
  expected: "plus" | "minus"
) {
  const plus = row.locator("summary svg").nth(0);
  const minus = row.locator("summary svg").nth(1);
  await expect(plus).toHaveCount(1);
  await expect(minus).toHaveCount(1);

  const plusVisible = await plus.isVisible();
  const minusVisible = await minus.isVisible();
  expect(
    Number(plusVisible) + Number(minusVisible),
    "exactly one FAQ icon must be visible"
  ).toBe(1);

  if (expected === "plus") {
    expect(plusVisible, "closed row must show Plus").toBe(true);
    expect(minusVisible, "closed row must hide Minus").toBe(false);
  } else {
    expect(minusVisible, "open row must show Minus").toBe(true);
    expect(plusVisible, "open row must hide Plus").toBe(false);
  }
}

test.describe("Marketing FAQ icon toggle", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "FAQ icon assertions run once");
  });

  for (const pageDef of FAQ_PAGES) {
    test(`${pageDef.name}: Plus when closed, Minus when open, toggle swaps`, async ({ page }) => {
      await page.goto(pageDef.path, { waitUntil: "networkidle" });
      const rows = page.locator("#faq details");
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(5);

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const isOpen = await row.evaluate((el) => (el as HTMLDetailsElement).open);
        await assertFaqIconState(row, isOpen ? "minus" : "plus");
      }

      // Toggle a closed row open, then closed again; assert icon swap each time.
      const closedIndex = await rows.evaluateAll((els) =>
        els.findIndex((el) => !(el as HTMLDetailsElement).open)
      );
      expect(closedIndex, "need at least one closed FAQ row").toBeGreaterThanOrEqual(0);
      const target = rows.nth(closedIndex);
      const summary = target.locator("summary");

      await summary.click();
      await expect(target).toHaveAttribute("open", "");
      await assertFaqIconState(target, "minus");

      await summary.click();
      await expect(target).not.toHaveAttribute("open");
      await assertFaqIconState(target, "plus");
    });
  }
});
