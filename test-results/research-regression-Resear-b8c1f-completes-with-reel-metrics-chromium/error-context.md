# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: research-regression.spec.ts >> Research regression (live API — run with app + credentials) >> Instagram scraping completes with reel metrics
- Location: tests/e2e/research-regression.spec.ts:10:3

# Error details

```
Error: page.fill: Target page, context or browser has been closed
Call log:
  - waiting for locator('input[type="email"]')

```

```
Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open '/Users/nomanpeera/Desktop/reels-dashboard/test-results/.playwright-artifacts-0/traces/6ebcf295932422b33342-8132f691aafc4975140c.trace'
```