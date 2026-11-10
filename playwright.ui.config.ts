import { defineConfig, devices } from "@playwright/test";

/** Browser tests for single components on the test harness page (no app server or database). */
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: { baseURL: "http://localhost:5199", trace: "off" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: a preinstalled browser when the pinned one is not downloaded.
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: {
    command: "npx vite --config tests/ui-harness/vite.config.ts",
    url: "http://localhost:5199",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
