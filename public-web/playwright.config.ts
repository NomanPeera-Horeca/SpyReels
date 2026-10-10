import { defineConfig } from "@playwright/test";

// Visual baselines: Linux (*-linux.png) via Playwright Docker / CI is the
// source of truth. Optional local macOS Chrome runs write *-darwin.png.
const runVisual = process.env.PLAYWRIGHT_VISUAL === "1";
// Local macOS: system Chrome (historical *-darwin.png). CI/Docker set
// PLAYWRIGHT_USE_SYSTEM_CHROME=0 and use bundled Chromium (*-linux.png).
const useSystemChrome =
  runVisual &&
  process.platform === "darwin" &&
  process.env.PLAYWRIGHT_USE_SYSTEM_CHROME !== "0";

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
    // Local macOS convenience only. CI / Docker use bundled Chromium.
    ...(useSystemChrome ? { channel: "chrome" as const } : {}),
  },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "laptop-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
