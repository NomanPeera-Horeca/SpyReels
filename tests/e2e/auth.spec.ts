import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'tests/e2e/.env.test' });

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('login with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
});

test('login fails with wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  await page.fill('input[type="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/dashboard/);
});
