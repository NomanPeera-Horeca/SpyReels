/**
 * Capture the 8 fixture-driven Breakdown/Listicle slides from the local
 * family renderer. Throwaway QA helper for visual review.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/qa/carousel-breakdown-vertical-slice";
const BASE = process.env.SLICE_URL ?? "http://127.0.0.1:3010/dev/carousel-breakdown-slice";

const SLIDES = [
  "slide-01-cover",
  "slide-02-comparison",
  "slide-03-number",
  "slide-04-diagram",
  "slide-05-timeline",
  "slide-06-text-visual",
  "slide-07-number",
  "slide-08-closing",
] as const;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

for (let index = 0; index < SLIDES.length; index += 1) {
  const name = SLIDES[index]!;
  await page.goto(`${BASE}?slide=${index + 1}`, { waitUntil: "networkidle" });
  const slide = page.locator("[data-breakdown-family]");
  await slide.waitFor({ state: "visible" });
  if (name === "slide-06-text-visual") {
    await page.waitForTimeout(1200);
  }
  await slide.screenshot({ path: `${OUT}/${name}.png` });
  const treatment = await slide.getAttribute("data-breakdown-treatment");
  const sequence = await slide.getAttribute("data-breakdown-sequence");
  console.log(`${name} treatment=${treatment} sequence=${sequence}`);
}

await page.setViewportSize({ width: 1680, height: 1500 });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.locator("[data-breakdown-family]").first().waitFor({ state: "visible" });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/all-8-slides.png`, fullPage: true });
console.log("wrote all-8-slides.png");

await browser.close();
