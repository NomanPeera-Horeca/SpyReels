/**
 * Local QA only. Capture Roadmap slides and build one contact sheet per set.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { CAROUSEL_STOCK_PREVIEW } from "../shared/carouselTemplates";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:3001";
const SETS = [
  {
    query: "menu",
    dump: "docs/qa/carousel-howto-roadmap-family-v1/menu-simplification/remake-dump.json",
    out: "docs/qa/carousel-howto-roadmap-family-v1/menu-simplification",
  },
  {
    query: "nonstep",
    dump: "docs/qa/carousel-howto-roadmap-family-v1/non-step-roadmap/remake-dump.json",
    out: "docs/qa/carousel-howto-roadmap-family-v1/non-step-roadmap",
  },
] as const;

async function capture(query: string, dumpPath: string, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const dump = JSON.parse(readFileSync(resolve(dumpPath), "utf8"));
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript((payload) => {
    (window as Window & { __QA_CAROUSEL_DUMP__?: unknown }).__QA_CAROUSEL_DUMP__ =
      payload;
  }, dump);
  await page.goto(`${BASE}/dev/carousel-preview?roadmap=${query}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("[data-roadmap-family]");
  const slides = page.locator("[data-carousel-slide-id]");
  const count = await slides.count();
  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const slide = slides.nth(i);
    const card = slide.locator("[data-roadmap-family]").first();
    const dest = resolve(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await ((await card.count()) > 0 ? card : slide).screenshot({ path: dest });
    paths.push(dest);
  }

  const buffers = await Promise.all(
    paths.map((p) => sharp(p).resize({ height: 640 }).toBuffer())
  );
  const metas = await Promise.all(buffers.map((buf) => sharp(buf).metadata()));
  const gap = 16;
  const width = metas.reduce((sum, meta) => sum + (meta.width ?? 0) + gap, gap);
  const height = 640 + gap * 2;
  let x = gap;
  const composites = buffers.map((input, i) => {
    const left = x;
    x += (metas[i]?.width ?? 0) + gap;
    return { input, left, top: gap };
  });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 18, g: 18, b: 20 },
    },
  })
    .composite(composites)
    .png()
    .toFile(resolve(outDir, "contact-sheet.png"));

  writeFileSync(
    resolve(outDir, "shot-index.json"),
    JSON.stringify({ query, count, paths }, null, 2)
  );
  await browser.close();
  console.log(`[qa] ${query}: captured ${count} slides in ${outDir}`);
}

function writePhotoSplitDump() {
  const source = JSON.parse(
    readFileSync(
      resolve(
        "docs/qa/carousel-howto-roadmap-family-v1/menu-simplification/remake-dump.json"
      ),
      "utf8"
    )
  );
  const slides = source.slideStructureJson ?? [];
  const photoSlide = slides.find(
    (slide: { composition?: { archetype?: string; treatment?: string } }) =>
      slide.composition?.archetype === "text_visual_split" &&
      slide.composition?.treatment === "step_focus"
  );
  if (!photoSlide?.id) {
    throw new Error("No text_visual_split step_focus slide for photo-split QA");
  }
  source.imageUrlsJson = {
    ...(source.imageUrlsJson ?? {}),
    [photoSlide.id]: CAROUSEL_STOCK_PREVIEW.cafeCreator,
  };
  source.selectedBrief = {
    ...(source.selectedBrief ?? {}),
    title: "Roadmap step_photo_split fixture",
  };
  const outDir = resolve(
    "docs/qa/carousel-howto-roadmap-family-v1/step-photo-split"
  );
  mkdirSync(outDir, { recursive: true });
  const dumpPath = resolve(outDir, "remake-dump.json");
  writeFileSync(dumpPath, `${JSON.stringify(source, null, 2)}\n`);
  return {
    query: "photosplit",
    dump: dumpPath,
    out: outDir,
  };
}

async function main() {
  for (const set of SETS) {
    await capture(set.query, resolve(set.dump), resolve(set.out));
  }
  const photo = writePhotoSplitDump();
  await capture(photo.query, photo.dump, photo.out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
