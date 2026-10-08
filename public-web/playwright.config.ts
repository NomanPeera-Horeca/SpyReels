import { defineConfig } from "@playwright/test";

// Visual baselines are macOS-local only (pnpm test:visual). Keep them out of
// default pnpm test:e2e so Linux CI (public-web-pilot) never runs them.
const runVisual = process.env.PLAYWRIGHT_VISUAL === "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: runVisual ? [] : ["**/visual.spec.ts"],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
    },
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
    // Visual runs compare toHaveScreenshot only. Trace/video artifacts have
    // been racing on teardown (ENOENT under test-results/.playwright-artifacts).
    trace: runVisual ? "off" : "retain-on-failure",
    screenshot: runVisual ? "off" : "only-on-failure",
    video: runVisual ? "off" : "retain-on-failure",
    // Cursor Electron often resolves Playwright's bundled browser as mac-x64
    // on Apple Silicon (missing/SEGV). Visual runs use system Chrome instead.
    ...(runVisual ? { channel: "chrome" as const } : {}),
  },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "laptop-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
