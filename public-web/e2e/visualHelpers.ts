import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const FIXTURES_DIR = join(process.cwd(), "e2e", "fixtures");

const FREEZE_CSS = `
*, *::before, *::after {
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition: none !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
input, textarea, [contenteditable="true"] {
  caret-color: transparent !important;
}
`;

function readFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, name));
}

function readJsonFixture<T>(name: string): T {
  return JSON.parse(readFixture(name).toString("utf8")) as T;
}

function readRequestedHandle(url: string): string | null {
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("input");
    if (!raw) return null;
    const decoded = JSON.parse(decodeURIComponent(raw)) as {
      json?: { handle?: string };
    };
    const handle = decoded.json?.handle;
    return typeof handle === "string" && handle.trim() ? handle.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function withRequestedUsername(
  envelope: Record<string, unknown>,
  handle: string | null
): Record<string, unknown> {
  if (!handle) return envelope;
  const clone = structuredClone(envelope) as {
    result?: { data?: { json?: { username?: string } } };
  };
  if (clone.result?.data?.json) {
    clone.result.data.json.username = handle;
  }
  return clone;
}

/** Block analytics, mock finder APIs, serve local thumbnail fixtures. */
export async function installVisualNetworkMocks(page: Page): Promise<void> {
  const viralDemo = readJsonFixture<Record<string, unknown>>("viral-demo.json");
  const profilePreview = readJsonFixture<Record<string, unknown>>("profile-preview.json");
  const tiktokProfilePreview = readJsonFixture<Record<string, unknown>>(
    "tiktok-profile-preview.json"
  );
  const tiktokDemo = readJsonFixture<Record<string, unknown>>("tiktok-demo.json");

  const thumbMap: Record<string, string> = {
    "thumb-1.png": "thumb-1.png",
    "thumb-2.png": "thumb-2.png",
    "thumb-3.png": "thumb-3.png",
    "profile-pic.png": "profile-pic.png",
  };

  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Analytics / telemetry
    if (
      /posthog|google-analytics|googletagmanager|facebook\.net|doubleclick|hotjar|segment\.|sentry\.io|r\.wdfl\.co|rewardful/i.test(
        url
      )
    ) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    // Remote brand / CDN images (absolute spyreels.ai URLs in HTML) -> local PNG
    if (
      method === "GET" &&
      /spyreels\.ai\/.+\.(png|jpe?g|webp|gif|svg)(?:\?|$)/i.test(url)
    ) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: readFixture("thumb-1.png"),
      });
      return;
    }

    // Local fixture image host used inside mocked JSON payloads
    if (url.includes("visual-fixture.local/")) {
      const fileName = url.split("/").pop() || "";
      const mapped = thumbMap[fileName];
      if (mapped) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: readFixture(mapped),
        });
        return;
      }
    }

    if (method === "GET" && /\/features\/viral-reel-finder\/demo(?:\?|$)/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(viralDemo),
      });
      return;
    }

    if (method === "GET" && /\/free-tools\/tiktok-viral-video-finder\/demo(?:\?|$)/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(tiktokDemo),
      });
      return;
    }

    if (method === "GET" && url.includes("/api/trpc/featured.publicProfilePreview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          withRequestedUsername(profilePreview, readRequestedHandle(url))
        ),
      });
      return;
    }

    if (method === "GET" && url.includes("/api/trpc/tiktokScrape.publicProfilePreview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          withRequestedUsername(tiktokProfilePreview, readRequestedHandle(url))
        ),
      });
      return;
    }

    // Profile route on Next (if used)
    if (method === "GET" && /\/features\/viral-reel-finder\/profile(?:\?|$)/.test(url)) {
      const json = (profilePreview as { result?: { data?: { json?: unknown } } }).result?.data?.json;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(json ?? { found: false }),
      });
      return;
    }

    await route.continue();
  });
}

/** Freeze CSS motion and reset media / scroll that can change between frames. */
export async function freezeVisualMotion(page: Page): Promise<void> {
  await page.addStyleTag({ content: FREEZE_CSS });

  await page.evaluate(() => {
    document.querySelectorAll("video").forEach((video) => {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* ignore seek errors */
      }
      video.removeAttribute("autoplay");
      video.autoplay = false;
      // Force poster frame for deterministic pixels
      video.load();
      video.pause();
    });

    document.querySelectorAll<HTMLElement>("[id='stories-rail'], .stories-rail").forEach((rail) => {
      rail.scrollLeft = 0;
      rail.scrollTop = 0;
    });

    window.scrollTo(0, 0);
  });
}

export async function prepareVisualPage(page: Page, path: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installVisualNetworkMocks(page);
  // Prefer load over networkidle: the catch-all route + analytics stubs can
  // keep Chromium from ever reaching a quiet network under networkidle.
  await page.goto(path, { waitUntil: "load" });
  await page.waitForSelector("h1", { state: "visible", timeout: 20_000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await freezeVisualMotion(page);
  // Second pass after hydrate / homepage.js clones stories
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
  );
  await freezeVisualMotion(page);
  // Best-effort quiet network; do not fail the test if it never settles.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

export const visualScreenshotOptions = {
  fullPage: true as const,
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixelRatio: 0.001,
};

/** Strict component shots: pixel count is the gate (ratio disabled). */
export const visualSectionScreenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixels: 50,
  maxDiffPixelRatio: 1,
  /**
   * Catch soft color shifts (e.g. #fcfcfd → #f2f2f5).
   * pixelmatch: 0.05 still reports 0 diffs for that pair; 0.03 detects ~8k px.
   */
  threshold: 0.03,
};

/** MarketingSectionHeader root: <header> whose first <p> is the eyebrow. */
export function marketingSectionHeader(page: Page, eyebrow: string) {
  return page.locator("header").filter({
    has: page.locator(":scope > p").filter({ hasText: new RegExp(`^${eyebrow}$`, "i") }),
  });
}

/** Tool Grid: direct parent of the shared tool-* links. */
export function marketingToolGrid(page: Page) {
  return page.locator('[id^="tool-"]').first().locator("xpath=..");
}

/** Marketing FAQ section (shared MarketingFaq root). */
export function marketingFaq(page: Page) {
  return page.locator("section#faq");
}

/** Marketing Final CTA section (shared MarketingFinalCta root). */
export function marketingFinalCta(page: Page) {
  return page.locator("[data-marketing-final-cta]");
}

/** Marketing Process Steps section (numbered or icon). */
export function marketingProcessSteps(page: Page) {
  return page.locator("[data-marketing-process-steps]");
}
