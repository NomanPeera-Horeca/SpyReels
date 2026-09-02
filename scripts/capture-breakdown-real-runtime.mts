/**
 * Capture stored remake 73 slides. Loads the remake dump through the
 * throwaway preview. Does not rebuild compositions.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/qa/carousel-breakdown-real-runtime";
const BASE =
  process.env.REAL_RUNTIME_URL ??
  "http://127.0.0.1:3010/dev/carousel-breakdown-slice?source=real";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

const probe = await page.goto(BASE, { waitUntil: "domcontentloaded" });
if (!probe || probe.status() >= 400) {
  throw new Error(`Preview failed: ${probe?.status()} ${BASE}`);
}
await page.locator("[data-real-runtime-slide]").first().waitFor({
  state: "visible",
  timeout: 30000,
});
const slideIds = await page.$$eval("[data-real-runtime-slide]", (nodes) =>
  nodes.map((node) => node.getAttribute("data-real-runtime-slide") || "")
);

for (let index = 0; index < slideIds.length; index += 1) {
  const id = slideIds[index] || `slide_${String(index + 1).padStart(2, "0")}`;
  await page.goto(`${BASE}&slide=${index + 1}`, {
    waitUntil: "domcontentloaded",
  });
  const slide = page.locator("[data-real-runtime-slide]");
  await slide.waitFor({ state: "visible" });
  await slide.screenshot({
    path: `${OUT}/slide-${String(index + 1).padStart(2, "0")}-${id}.png`,
  });
  console.log(`wrote slide ${index + 1} ${id}`);
}

await page.setViewportSize({ width: 1680, height: 1500 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.locator("[data-real-runtime-slide]").first().waitFor({
  state: "visible",
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/all-8-slides.png`, fullPage: true });
console.log("wrote all-8-slides.png");

await browser.close();
