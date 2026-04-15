# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: transcription.spec.ts >> transcription button is visible on a reel
- Location: tests/e2e/transcription.spec.ts:10:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Transcribe")').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("Transcribe")').first()

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
        - generic [ref=e111]:
          - img [ref=e115]
          - heading "404" [level=1] [ref=e117]
          - heading "Page Not Found" [level=2] [ref=e118]
          - paragraph [ref=e119]:
            - text: Sorry, the page you are looking for doesn't exist.
            - text: It may have been moved or deleted.
          - button "Go Home" [ref=e121] [cursor=pointer]:
            - img
            - text: Go Home
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | 
  4  | test('reels page loads', async ({ page }) => {
  5  |   await login(page);
  6  |   await page.goto('/dashboard/reels');
  7  |   await expect(page).toHaveURL(/reels/);
  8  | });
  9  | 
  10 | test('transcription button is visible on a reel', async ({ page }) => {
  11 |   await login(page);
  12 |   await page.goto('/dashboard/reels');
  13 |   await page.waitForSelector('[class*="reel"], [class*="card"]', { timeout: 10000 });
  14 |   const transcribeBtn = page.locator('button:has-text("Transcribe")').first();
> 15 |   await expect(transcribeBtn).toBeVisible({ timeout: 5000 });
     |                               ^ Error: expect(locator).toBeVisible() failed
  16 | });
  17 | 
```