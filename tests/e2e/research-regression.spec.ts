import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

const RESEARCH_HANDLE = "corporatesurprises";

/** Set by the scraping test; reused by transcription + re-create (serial). */
let jobDashboardUrl: string;

test.describe.serial("Research regression (live API — run with app + credentials)", () => {
  test("Instagram scraping completes with reel metrics", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.goto("/");
    await page.locator("#handle").fill(RESEARCH_HANDLE);
    await expect(page.getByText("followers", { exact: false })).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("button", { name: /Start Research/i }).click();
    await page.waitForURL(/\/dashboard\?jobId=\d+/, { timeout: 120_000 });
    jobDashboardUrl = page.url();

    await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });

    const firstReelStats = page.locator("span.flex.items-center.gap-1").filter({
      hasText: /[\d.KM]+/,
    });
    await expect(firstReelStats.first()).toBeVisible({ timeout: 20_000 });
    const statText = await firstReelStats.first().innerText();
    expect(statText).toMatch(/[1-9]/);
  });

  test("Transcription: transcript appears and survives refresh", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    expect(jobDashboardUrl).toBeTruthy();
    await page.goto(jobDashboardUrl!);

    const transcribeBtn = page.getByRole("button", { name: /^Transcribe$/i }).first();
    if (await transcribeBtn.isVisible().catch(() => false)) {
      await transcribeBtn.click();
    }

    await expect(page.getByText("Transcribed").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /Transcript/i }).first().click();

    await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible({
      timeout: 15_000,
    });
    const transcriptPanel = page
      .locator("div.mb-4")
      .filter({ has: page.getByRole("heading", { name: "Transcript" }) })
      .locator("div.rounded-lg")
      .first();
    await expect(transcriptPanel).toBeVisible({ timeout: 15_000 });
    const transcriptText = await transcriptPanel.innerText();
    expect(transcriptText.toLowerCase().trim()).not.toBe("no speech detected");
    expect(transcriptText.replace(/\s+/g, " ").trim().length).toBeGreaterThan(10);

    await page.reload();
    await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Transcript/i }).first().click();
    const transcriptAfter = page
      .locator("div.mb-4")
      .filter({ has: page.getByRole("heading", { name: "Transcript" }) })
      .locator("div.rounded-lg")
      .first();
    await expect(transcriptAfter).toBeVisible({ timeout: 15_000 });
    expect((await transcriptAfter.innerText()).replace(/\s+/g, " ").trim().length).toBeGreaterThan(
      10
    );
  });

  test("Re-Create: generated script is shown in editor", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    expect(jobDashboardUrl).toBeTruthy();
    await page.goto(jobDashboardUrl!);

    await expect(page.getByText("Transcribed").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Re-Create/i }).first().click();
    const generateBtn = page.getByRole("button", { name: /Generate Script/i });
    if (await generateBtn.isVisible().catch(() => false)) {
      await generateBtn.click();
      await expect(page.getByText("Analyzing viral structure")).toBeHidden({
        timeout: 30_000,
      });
    }
    await expect(page.getByRole("heading", { name: "Your Script" })).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole("heading", { name: "Your Script" })
      .locator("..")
      .getByRole("button", { name: /^Edit$/ })
      .click();
    const scriptField = page.locator('textarea[placeholder="Edit your script..."]');
    await expect(scriptField).toBeVisible({ timeout: 15_000 });
    expect((await scriptField.inputValue()).trim().length).toBeGreaterThan(20);
  });
});
