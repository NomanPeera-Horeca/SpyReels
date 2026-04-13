import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('pricing page loads with plans', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.locator('text=Starter').or(page.locator('text=Pro'))).toBeVisible({ timeout: 5000 });
});

test('can access billing settings', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard/settings');
  await expect(page).toHaveURL(/settings/);
});
