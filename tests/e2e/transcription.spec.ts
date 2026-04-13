import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('reels page loads', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard/reels');
  await expect(page).toHaveURL(/reels/);
});

test('transcription button is visible on a reel', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard/reels');
  await page.waitForSelector('[class*="reel"], [class*="card"]', { timeout: 10000 });
  const transcribeBtn = page.locator('button:has-text("Transcribe")').first();
  await expect(transcribeBtn).toBeVisible({ timeout: 5000 });
});
