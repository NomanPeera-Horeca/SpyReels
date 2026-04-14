# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: research-regression.spec.ts >> Research regression (live API — run with app + credentials) >> Instagram scraping completes with reel metrics
- Location: tests/e2e/research-regression.spec.ts:11:3

# Error details

```
Test timeout of 120000ms exceeded.
```

```
TimeoutError: page.waitForURL: Timeout 120000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - generic [ref=e6]:
      - generic [ref=e8]:
        - button "Toggle navigation" [ref=e9] [cursor=pointer]:
          - img [ref=e10]
        - generic [ref=e12]:
          - img "SpyReels" [ref=e13]
          - generic [ref=e14]: SpyReels
      - list [ref=e16]:
        - generic [ref=e17]: Overview
        - listitem [ref=e18]:
          - button "Dashboard" [ref=e19] [cursor=pointer]:
            - img [ref=e20]
            - generic [ref=e25]: Dashboard
        - generic [ref=e26]: Discover
        - listitem [ref=e27]:
          - button "Research" [ref=e28] [cursor=pointer]:
            - img [ref=e29]
            - generic [ref=e36]: Research
        - listitem [ref=e37]:
          - button "Collected Reels" [ref=e38] [cursor=pointer]:
            - img [ref=e39]
            - generic [ref=e42]: Collected Reels
        - listitem [ref=e43]:
          - button "Account Monitoring" [ref=e44] [cursor=pointer]:
            - img [ref=e45]
            - generic [ref=e48]: Account Monitoring
        - generic [ref=e49]: Create
        - listitem [ref=e50]:
          - button "My Scripts" [ref=e51] [cursor=pointer]:
            - img [ref=e52]
            - generic [ref=e55]: My Scripts
        - listitem [ref=e56]:
          - button "Idea to Script" [ref=e57] [cursor=pointer]:
            - img [ref=e58]
            - generic [ref=e60]: Idea to Script
        - listitem [ref=e61]:
          - button "My Library" [ref=e62] [cursor=pointer]:
            - img [ref=e63]
            - generic [ref=e65]: My Library
        - listitem [ref=e66]:
          - button "Saved Reels" [ref=e67] [cursor=pointer]:
            - img [ref=e68]
            - generic [ref=e70]: Saved Reels
        - listitem [ref=e71]:
          - button "Paste Script" [ref=e72] [cursor=pointer]:
            - img [ref=e73]
            - generic [ref=e77]: Paste Script
        - listitem [ref=e78]:
          - button "Light mode (beta)" [ref=e79] [cursor=pointer]:
            - img [ref=e80]
            - generic [ref=e86]: Light mode (beta)
        - generic [ref=e87]: Account
        - listitem [ref=e88]:
          - button "Settings" [ref=e89] [cursor=pointer]:
            - img [ref=e90]
            - generic [ref=e93]: Settings
        - listitem [ref=e94]:
          - button "Billing" [ref=e95] [cursor=pointer]:
            - img [ref=e96]
            - generic [ref=e98]: Billing
      - button "N Noman Peera noman.peera@thehorecastore.com" [ref=e100] [cursor=pointer]:
        - generic [ref=e102]: "N"
        - generic [ref=e103]:
          - paragraph [ref=e104]: Noman Peera
          - paragraph [ref=e105]: noman.peera@thehorecastore.com
    - main [ref=e107]:
      - main [ref=e108]:
        - generic [ref=e109]:
          - generic [ref=e110]:
            - generic [ref=e111]:
              - img [ref=e113]
              - heading "Research Viral Reels" [level=1] [ref=e115]
            - paragraph [ref=e116]: Enter a public Instagram handle and select a timeframe to collect all Reels data including views, likes, comments, and more.
          - generic [ref=e117]:
            - generic [ref=e118]:
              - generic [ref=e119]: New Research Job
              - generic [ref=e120]: Provide the account details to start collecting Reels data.
            - generic [ref=e122]:
              - generic [ref=e123]:
                - generic [ref=e124]: Instagram Handle
                - generic [ref=e125]:
                  - img [ref=e126]
                  - textbox "Instagram Handle" [ref=e129]:
                    - /placeholder: e.g. natgeo
                    - text: kyliejenner
                  - img [ref=e130]
                - paragraph [ref=e133]: Enter the username without the @ symbol. The account must be public.
              - generic [ref=e136]:
                - generic [ref=e137]:
                  - heading "kyliejenner" [level=3] [ref=e138]
                  - img [ref=e139]
                - paragraph [ref=e142]: Kylie
                - paragraph [ref=e143]: "@kyliecosmetics @khy"
                - generic [ref=e144]:
                  - generic [ref=e145]:
                    - paragraph [ref=e146]: 7.4K
                    - paragraph [ref=e147]: posts
                  - generic [ref=e148]:
                    - paragraph [ref=e149]: 390.6M
                    - paragraph [ref=e150]: followers
                  - generic [ref=e151]:
                    - paragraph [ref=e152]: "137"
                    - paragraph [ref=e153]: following
                  - link "kyliecosmetics.com/" [ref=e154] [cursor=pointer]:
                    - /url: http://kyliecosmetics.com/
                    - img [ref=e155]
                    - generic [ref=e159]: kyliecosmetics.com/
              - generic [ref=e160]:
                - generic [ref=e161]: Timeframe
                - combobox [ref=e162] [cursor=pointer]:
                  - img
                  - generic: Last 30 days
                  - img
                - combobox [ref=e163] [cursor=pointer]
                - paragraph [ref=e164]: Reels posted within this window will be collected.
              - paragraph [ref=e165]: 1/2 scrapes used this month
              - button "Start Research" [ref=e166] [cursor=pointer]:
                - text: Start Research
                - img
          - generic [ref=e167]:
            - generic [ref=e168]:
              - paragraph [ref=e169]: Research
              - paragraph [ref=e170]: Collect all Reels metadata from any public account
            - generic [ref=e171]:
              - paragraph [ref=e172]: Analyze
              - paragraph [ref=e173]: Sort by views, likes, comments, or date instantly
            - generic [ref=e174]:
              - paragraph [ref=e175]: Transcribe
              - paragraph [ref=e176]: Get full transcripts with hook analysis for any Reel
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { login } from "./helpers/auth";
  3   | 
  4   | const HANDLES = ["cristiano", "kyliejenner", "natgeo", "nasa", "nike"];
  5   | const RESEARCH_HANDLE = HANDLES[Math.floor(Math.random() * HANDLES.length)];
  6   | 
  7   | /** Set by the scraping test; reused by transcription + re-create (serial). */
  8   | let jobDashboardUrl: string;
  9   | 
  10  | test.describe.serial("Research regression (live API — run with app + credentials)", () => {
  11  |   test("Instagram scraping completes with reel metrics", async ({ page }) => {
  12  |     test.setTimeout(120_000);
  13  |     await login(page);
  14  |     await page.goto("/");
  15  |     await page.locator("#handle").fill(RESEARCH_HANDLE);
  16  |     await expect(page.getByText("followers", { exact: false })).toBeVisible({
  17  |       timeout: 25_000,
  18  |     });
  19  |     await page.getByRole("button", { name: /Start Research/i }).click();
> 20  |     await page.waitForURL(/\/dashboard\?jobId=\d+/, { timeout: 120_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 120000ms exceeded.
  21  |     jobDashboardUrl = page.url();
  22  | 
  23  |     await expect(page.locator('span').filter({ hasText: /^completed$/i }).first()).toBeVisible({
  24  |       timeout: 60_000,
  25  |     });
  26  | 
  27  |     const firstReelStats = page.locator("span.flex.items-center.gap-1").filter({
  28  |       hasText: /[\d.KM]+/,
  29  |     });
  30  |     await expect(firstReelStats.first()).toBeVisible({ timeout: 20_000 });
  31  |     const statText = await firstReelStats.first().innerText();
  32  |     expect(statText).toMatch(/[1-9]/);
  33  |   });
  34  | 
  35  |   test("Transcription: transcript appears and survives refresh", async ({ page }) => {
  36  |     test.setTimeout(120_000);
  37  |     await login(page);
  38  |     expect(jobDashboardUrl).toBeTruthy();
  39  |     await page.goto(jobDashboardUrl!);
  40  |     await page.waitForSelector('[data-sidebar]', { timeout: 15000 });
  41  |     await page.waitForLoadState('networkidle', { timeout: 30000 });
  42  |     await page.waitForSelector('button:has-text("Transcribe")', { timeout: 30000 });
  43  | 
  44  |     const transcribeBtn = page.getByRole("button", { name: /^Transcribe$/i }).first();
  45  |     if (await transcribeBtn.isVisible().catch(() => false)) {
  46  |       await transcribeBtn.click();
  47  |     }
  48  | 
  49  |     await expect(page.getByText("Transcribed").first()).toBeVisible({
  50  |       timeout: 120_000,
  51  |     });
  52  | 
  53  |     await page.getByRole("button", { name: /Transcript/i }).first().click();
  54  | 
  55  |     await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible({
  56  |       timeout: 15_000,
  57  |     });
  58  |     const transcriptPanel = page
  59  |       .locator("div.mb-4")
  60  |       .filter({ has: page.getByRole("heading", { name: "Transcript" }) })
  61  |       .locator("div.rounded-lg")
  62  |       .first();
  63  |     await expect(transcriptPanel).toBeVisible({ timeout: 15_000 });
  64  |     const transcriptText = await transcriptPanel.innerText();
  65  |     expect(transcriptText.toLowerCase().trim()).not.toBe("no speech detected");
  66  |     expect(transcriptText.replace(/\s+/g, " ").trim().length).toBeGreaterThan(10);
  67  | 
  68  |     await page.reload();
  69  |     await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({
  70  |       timeout: 30_000,
  71  |     });
  72  |     await page.getByRole("button", { name: /Transcript/i }).first().click();
  73  |     const transcriptAfter = page
  74  |       .locator("div.mb-4")
  75  |       .filter({ has: page.getByRole("heading", { name: "Transcript" }) })
  76  |       .locator("div.rounded-lg")
  77  |       .first();
  78  |     await expect(transcriptAfter).toBeVisible({ timeout: 15_000 });
  79  |     expect((await transcriptAfter.innerText()).replace(/\s+/g, " ").trim().length).toBeGreaterThan(
  80  |       10
  81  |     );
  82  |   });
  83  | 
  84  |   test("Re-Create: generated script is shown in editor", async ({ page }) => {
  85  |     test.setTimeout(120_000);
  86  |     await login(page);
  87  |     expect(jobDashboardUrl).toBeTruthy();
  88  |     await page.goto(jobDashboardUrl!);
  89  | 
  90  |     await expect(page.getByText("Transcribed").first()).toBeVisible({ timeout: 15_000 });
  91  |     await page.getByRole("button", { name: /Re-Create/i }).first().click();
  92  |     const generateBtn = page.getByRole("button", { name: /Generate Script/i });
  93  |     if (await generateBtn.isVisible().catch(() => false)) {
  94  |       await generateBtn.click();
  95  |       await expect(page.getByText("Analyzing viral structure")).toBeHidden({
  96  |         timeout: 30_000,
  97  |       });
  98  |     }
  99  |     await expect(page.getByRole("heading", { name: "Your Script" })).toBeVisible({
  100 |       timeout: 30_000,
  101 |     });
  102 |     await page
  103 |       .getByRole("heading", { name: "Your Script" })
  104 |       .locator("..")
  105 |       .getByRole("button", { name: /^Edit$/ })
  106 |       .click();
  107 |     const scriptField = page.locator('textarea[placeholder="Edit your script..."]');
  108 |     await expect(scriptField).toBeVisible({ timeout: 15_000 });
  109 |     expect((await scriptField.inputValue()).trim().length).toBeGreaterThan(20);
  110 |   });
  111 | });
  112 | 
```