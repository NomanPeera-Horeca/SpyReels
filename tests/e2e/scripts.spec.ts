import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('scripts page loads after login', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard/scripts');
  await expect(page).toHaveURL(/scripts/);
});

test('can navigate to new script page', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard/scripts');
  await page.click('a[href*="new"], button:has-text("New"), button:has-text("Create")');
  await expect(page).toHaveURL(/new|create/);
});
