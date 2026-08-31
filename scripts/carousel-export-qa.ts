/**
 * Deterministic Carousel Studio PNG export QA.
 * Builds 360px fixture slides, captures with the same option builder as
 * carouselExport.ts, then checks dimensions, edge fill, and ZIP names.
 *
 *   pnpm exec tsx scripts/carousel-export-qa.ts
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import JSZip from "jszip";
import {
  buildSlideCaptureOptions,
  expectedCarouselZipFilenames,
  slideCaptureOutputSize,
  type SlideCaptureSizeOptions,
} from "../client/src/lib/carouselExportOptions";
import { analyzePngContentFill } from "./pngContentFill";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML_TO_IMAGE = join(ROOT, "node_modules/html-to-image/dist/html-to-image.js");

type CaptureResult = {
  name: string;
  bytes: number[];
};

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; background: #111; }
      #stage { width: 360px; }
      .slide {
        width: 360px;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
      }
      .slide-45 { height: 450px; }
      .cover {
        background: linear-gradient(90deg, #c81d25 0%, #f59e0b 50%, #2563eb 100%);
        color: #fff;
        font: 700 28px/1.2 system-ui, sans-serif;
        padding: 24px;
      }
      .cover img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.35;
      }
      .cover .copy { position: relative; z-index: 1; }
      .text-only {
        background: #5b21b6;
        color: #faf5ff;
        font: 700 22px/1.3 system-ui, sans-serif;
        padding: 28px 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .text-only h1 { margin: 0; font-size: 32px; }
      .text-only p { margin: 0; text-align: right; }
    </style>
  </head>
  <body>
    <div id="stage">
      <div class="slide slide-45 cover" data-carousel-slide-id="cover">
        <img alt="" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='450'><rect width='360' height='450' fill='%23000'/><circle cx='280' cy='120' r='70' fill='%23ffffff'/></svg>" />
        <div class="copy">Cover with generated image</div>
      </div>
      <div class="slide slide-45 text-only" data-carousel-slide-id="text">
        <h1>Text-only slide fills the frame</h1>
        <p>Right edge copy</p>
      </div>
    </div>
  </body>
</html>`;

function launchBrowser() {
  const cached = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (cached) {
    const hasBrowser =
      existsSync(cached) &&
      ["chromium_headless_shell-", "chromium-"].some((prefix) => {
        try {
          return readdirSync(cached).some((name) => name.startsWith(prefix));
        } catch {
          return false;
        }
      });
    if (!hasBrowser) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  return chromium.launch({ headless: true, channel: "chrome" }).catch(() =>
    chromium.launch({ headless: true })
  );
}

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  await page.setContent(FIXTURE_HTML, { waitUntil: "load" });
  await page.addScriptTag({ path: HTML_TO_IMAGE });

  const measured = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>("[data-carousel-slide-id]")
    ).map((node) => ({
      name: node.dataset.carouselSlideId || "slide",
      width: Math.max(1, node.offsetWidth || 360),
      height: Math.max(1, node.offsetHeight || 450),
    }));
  });

  const captureOptions = measured.map((slide) =>
    buildSlideCaptureOptions(slide.width, slide.height)
  );

  const captures = await page.evaluate(
    async (opts: SlideCaptureSizeOptions[]) => {
      const htmlToImage = (
        window as unknown as {
          htmlToImage: {
            toBlob: (
              node: HTMLElement,
              options: SlideCaptureSizeOptions
            ) => Promise<Blob | null>;
          };
        }
      ).htmlToImage;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("[data-carousel-slide-id]")
      );
      const out: CaptureResult[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        const blob = await htmlToImage.toBlob(node, opts[i]!);
        if (!blob) {
          throw new Error(`Failed to capture ${node.dataset.carouselSlideId}`);
        }
        out.push({
          name: node.dataset.carouselSlideId || "slide",
          bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        });
      }
      return out;
    },
    captureOptions
  );

  await browser.close();

  const expectedNames = expectedCarouselZipFilenames(captures.length);
  const zip = new JSZip();
  const failures: string[] = [];

  for (let i = 0; i < captures.length; i++) {
    const capture = captures[i]!;
    const expected = slideCaptureOutputSize(captureOptions[i]!);
    const png = Buffer.from(capture.bytes);
    const report = await analyzePngContentFill(png);
    zip.file(expectedNames[i]!, png);

    const label = `${expectedNames[i]} (${capture.name})`;
    if (report.width !== expected.outputWidth || report.height !== expected.outputHeight) {
      failures.push(
        `${label}: got ${report.width}x${report.height}, expected ${expected.outputWidth}x${expected.outputHeight}`
      );
    }
    if (!report.leftEdgeFilled || !report.rightEdgeFilled) {
      failures.push(
        `${label}: content does not reach both edges (x ${report.contentMinX}-${report.contentMaxX})`
      );
    }
    if (report.rightTwoThirdsBlank) {
      failures.push(`${label}: right two-thirds are blank/black`);
    }
    if (report.fillWidthRatio < 0.95) {
      failures.push(
        `${label}: fillWidthRatio ${report.fillWidthRatio.toFixed(3)} (need >= 0.95)`
      );
    }
    console.log(
      `${label}: ${report.width}x${report.height} fill=${report.fillWidthRatio.toFixed(3)} left=${report.leftEdgeFilled} right=${report.rightEdgeFilled} rightBlank=${report.rightTwoThirdsBlank}`
    );
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
  const reloaded = await JSZip.loadAsync(zipBuf);
  const zipNames = Object.keys(reloaded.files).sort();
  if (JSON.stringify(zipNames) !== JSON.stringify(expectedNames)) {
    failures.push(`ZIP files ${zipNames.join(",")} != ${expectedNames.join(",")}`);
  } else {
    console.log(`ZIP contains ${zipNames.join(", ")}`);
  }

  if (failures.length > 0) {
    console.error("carousel-export-qa FAILED");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("carousel-export-qa OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
