import { Page } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config({ path: "tests/e2e/.env.test" });

/**
 * Email/password login via LandingPage modal (client/src/pages/LandingPage.tsx):
 * - Nav opens modal: <Button variant="outline" onClick={handleGetStarted}>Log In</Button>
 * - Modal: <DialogTitle>Welcome to SpyReels</DialogTitle>
 * - <input type="email" placeholder="Email address" ... />
 * - <input type="password" placeholder="Password" ... /> (or type="text" when shown)
 * - Submit: <button ...>{authMode === "login" ? "Log In" : "Create Account"}</button>
 * On success: window.location.href = "/" (may not include the string "dashboard" in the path).
 */
export async function login(page: Page) {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Log In", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Welcome to SpyReels" })
    .waitFor({ state: "visible" });
  await page
    .locator('input[type="email"][placeholder="Email address"]')
    .fill(process.env.TEST_EMAIL!);
  await page.locator('input[placeholder="Password"]').fill(process.env.TEST_PASSWORD!);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log In", exact: true })
    .last()
    .click();
  await page.waitForSelector('[data-sidebar], nav.sidebar, #dashboard, [class*="sidebar"]', { timeout: 15000 });
}
