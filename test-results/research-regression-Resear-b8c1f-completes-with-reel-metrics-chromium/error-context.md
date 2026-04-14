# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: research-regression.spec.ts >> Research regression (live API — run with app + credentials) >> Instagram scraping completes with reel metrics
- Location: tests/e2e/research-regression.spec.ts:10:3

# Error details

```
Error: locator.fill: Test ended.
Call log:
  - waiting for locator('#handle')

```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { login } from "./helpers/auth";
  3   | 
  4   | const RESEARCH_HANDLE = "corporatesurprises";
  5   | 
  6   | /** Set by the scraping test; reused by transcription + re-create (serial). */
  7   | let jobDashboardUrl: string;
  8   | 
  9   | test.describe.serial("Research regression (live API — run with app + credentials)", () => {
  10  |   test("Instagram scraping completes with reel metrics", async ({ page }) => {
  11  |     test.setTimeout(120_000);
  12  |     await login(page);
  13  |     await page.goto("/");
> 14  |     await page.locator("#handle").fill(RESEARCH_HANDLE);
      |                                   ^ Error: locator.fill: Test ended.
  15  |     await expect(page.getByText("followers", { exact: false })).toBeVisible({
  16  |       timeout: 25_000,
  17  |     });
  18  |     await page.getByRole("button", { name: /Start Research/i }).click();
  19  |     await page.waitForURL(/\/dashboard\?jobId=\d+/, { timeout: 120_000 });
  20  |     jobDashboardUrl = page.url();
  21  | 
  22  |     await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({
  23  |       timeout: 60_000,
  24  |     });
  25  | 
  26  |     const firstReelStats = page.locator("span.flex.items-center.gap-1").filter({
  27  |       hasText: /[\d.KM]+/,
  28  |     });
  29  |     await expect(firstReelStats.first()).toBeVisible({ timeout: 20_000 });
  30  |     const statText = await firstReelStats.first().innerText();
  31  |     expect(statText).toMatch(/[1-9]/);
  32  |   });
  33  | 
  34  |   test("Transcription: transcript appears and survives refresh", async ({ page }) => {
  35  |     test.setTimeout(120_000);
  36  |     await login(page);
  37  |     expect(jobDashboardUrl).toBeTruthy();
  38  |     await page.goto(jobDashboardUrl!);
  39  | 
  40  |     const transcribeBtn = page.getByRole("button", { name: /^Transcribe$/i }).first();
  41  |     if (await transcribeBtn.isVisible().catch(() => false)) {
  42  |       await transcribeBtn.click();
  43  |     }
  44  | 
  45  |     await expect(page.getByText("Transcribed").first()).toBeVisible({
  46  |       timeout: 30_000,
  47  |     });
  48  | 
  49  |     await page.getByRole("button", { name: /Transcript/i }).first().click();
  50  | 
  51  |     await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible({
  52  |       timeout: 15_000,
  53  |     });
  54  |     const transcriptPanel = page
  55  |       .locator("div.mb-4")
  56  |       .filter({ has: page.getByRole("heading", { name: "Transcript" }) })
  57  |       .locator("div.rounded-lg")
  58  |       .first();
  59  |     await expect(transcriptPanel).toBeVisible({ timeout: 15_000 });
  60  |     const transcriptText = await transcriptPanel.innerText();
  61  |     expect(transcriptText.toLowerCase().trim()).not.toBe("no speech detected");
  62  |     expect(transcriptText.replace(/\s+/g, " ").trim().length).toBeGreaterThan(10);
  63  | 
  64  |     await page.reload();
  65  |     await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({
  66  |       timeout: 30_000,
  67  |     });
  68  |     await page.getByRole("button", { name: /Transcript/i }).first().click();
  69  |     const transcriptAfter = page
  70  |       .locator("div.mb-4")
  71  |       .filter({ has: page.getByRole("heading", { name: "Transcript" }) })
  72  |       .locator("div.rounded-lg")
  73  |       .first();
  74  |     await expect(transcriptAfter).toBeVisible({ timeout: 15_000 });
  75  |     expect((await transcriptAfter.innerText()).replace(/\s+/g, " ").trim().length).toBeGreaterThan(
  76  |       10
  77  |     );
  78  |   });
  79  | 
  80  |   test("Re-Create: generated script is shown in editor", async ({ page }) => {
  81  |     test.setTimeout(120_000);
  82  |     await login(page);
  83  |     expect(jobDashboardUrl).toBeTruthy();
  84  |     await page.goto(jobDashboardUrl!);
  85  | 
  86  |     await expect(page.getByText("Transcribed").first()).toBeVisible({ timeout: 15_000 });
  87  |     await page.getByRole("button", { name: /Re-Create/i }).first().click();
  88  |     const generateBtn = page.getByRole("button", { name: /Generate Script/i });
  89  |     if (await generateBtn.isVisible().catch(() => false)) {
  90  |       await generateBtn.click();
  91  |       await expect(page.getByText("Analyzing viral structure")).toBeHidden({
  92  |         timeout: 30_000,
  93  |       });
  94  |     }
  95  |     await expect(page.getByRole("heading", { name: "Your Script" })).toBeVisible({
  96  |       timeout: 30_000,
  97  |     });
  98  |     await page
  99  |       .getByRole("heading", { name: "Your Script" })
  100 |       .locator("..")
  101 |       .getByRole("button", { name: /^Edit$/ })
  102 |       .click();
  103 |     const scriptField = page.locator('textarea[placeholder="Edit your script..."]');
  104 |     await expect(scriptField).toBeVisible({ timeout: 15_000 });
  105 |     expect((await scriptField.inputValue()).trim().length).toBeGreaterThan(20);
  106 |   });
  107 | });
  108 | 
```