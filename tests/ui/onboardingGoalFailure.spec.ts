/**
 * Goal step double failure, in a real browser: both goal attempts fail, the
 * UI receives that outcome through the real wait-state logic, a useful
 * question or suggestion appears, and the creator's existing edits stay.
 * Run: npx playwright test -c playwright.ui.config.ts
 */
import { expect, test, type Page } from "@playwright/test";

const QUESTION = "In one sentence, why do you create content?";
const NICHE = "Houston weekend events (my words)";

async function open(page: Page, kase: string) {
  await page.goto(`/?case=${kase}`);
  // The job is running first, then the case's final status arrives.
  await expect(page.getByTestId("harness-ai-state")).not.toHaveText("running");
}

async function answerAndKeepEdits(page: Page) {
  const field = page.getByRole("textbox", { name: QUESTION, exact: false });
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await field.fill("Help people in Houston find free things to do on weekends.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Help people in Houston find free things to do on weekends.")).toBeVisible();
  // The creator's confirmed niche edit is untouched, and nothing but the goal was written.
  await expect(page.getByText(NICHE)).toBeVisible();
  const writes = await page.evaluate(() => (window as unknown as { __writes: { kind: string }[] }).__writes);
  expect(writes.map(w => w.kind)).toEqual(["goal"]);
  // The question goes away once there is a goal.
  await expect(page.getByTestId("onboarding-goal-question")).toHaveCount(0);
}

test("job failed: the failure message, Try again, and an open field; edits stay", async ({ page }) => {
  await open(page, "failed");
  await expect(page.getByRole("status").filter({ hasText: "We couldn't write a suggestion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  const field = page.getByRole("textbox").first();
  await expect(field).toBeVisible();
  await expect(page.getByText(NICHE)).toBeVisible();
});

test("both drafts rejected (unverified): the question is shown and the field is open; edits stay", async ({ page }) => {
  await open(page, "unverified");
  await expect(page.getByTestId("onboarding-goal-question")).toContainText(QUESTION);
  await answerAndKeepEdits(page);
});

test("status fell back to done with no goal (suspected cause of the missing message): still asks", async ({ page }) => {
  await open(page, "doneNoGoal");
  await expect(page.getByTestId("harness-ai-state")).toHaveText("idle");
  await expect(page.getByTestId("onboarding-goal-question")).toContainText(QUESTION);
  await answerAndKeepEdits(page);
});

test("thin profile: a starter suggestion is labelled as a starting point", async ({ page }) => {
  await open(page, "starter");
  await expect(page.getByText("Share fitness tips and motivation.")).toBeVisible();
  await expect(page.getByTestId("onboarding-goal-starter-note")).toHaveText(
    "A starting point from your topic. Edit it to say why you create."
  );
  await expect(page.getByTestId("onboarding-goal-question")).toHaveCount(0);
  await expect(page.getByText(NICHE)).toBeVisible();
});
