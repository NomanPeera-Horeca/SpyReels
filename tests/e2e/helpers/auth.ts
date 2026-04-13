import { Page } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'tests/e2e/.env.test' });

export async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
}
