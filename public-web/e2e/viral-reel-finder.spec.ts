import { expect, test, type Page } from "@playwright/test";

async function waitForDemoReady(page: Page) {
  await expect(page.getByText("Interactive example", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading Reel data…")).toHaveCount(0);
  await expect(page.getByTestId("reel-card").first()).toBeVisible({ timeout: 20_000 });
}

async function reelOrder(page: Page): Promise<string[]> {
  return page.getByTestId("reel-card").evaluateAll((buttons) =>
    buttons.map((button) => (button.querySelector("strong")?.textContent || "").trim())
  );
}

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && /viral-reel-finder|\/_next\//.test(response.url())) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  (page as Page & { __qa?: { consoleErrors: string[]; failedRequests: string[] } }).__qa = {
    consoleErrors,
    failedRequests,
  };
  await page.goto("/features/viral-reel-finder", { waitUntil: "networkidle" });
  await waitForDemoReady(page);
});

test("visitor can understand and interact with the Reel Finder before signup", async ({ page }) => {
  const qa = (page as Page & { __qa: { consoleErrors: string[]; failedRequests: string[] } }).__qa;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Any Instagram account's viral Reels");
  await expect(page.getByText("Free Instagram Reel Finder", { exact: true })).toBeVisible();
  await expect(page.getByText("Paste a public Instagram handle")).toBeVisible();
  await expect(page.getByLabel("Instagram username or profile link")).toBeVisible();
  await expect(page.getByText("Interactive example", { exact: true })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  const handleInput = page.getByLabel("Instagram username or profile link");
  await handleInput.fill("noman_peera");
  await expect(page.getByText("@noman_peera", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Research @noman_peera" })).toBeVisible();
  await expect(page.getByTestId("profile-found-hint")).toContainText("We found @noman_peera");
  const avatar = page.locator("article").filter({ hasText: "@noman_peera" }).locator("img").first();
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveCSS("object-fit", "cover");

  await page.getByRole("button", { name: "@humphreytalks", exact: true }).click();
  await expect(page.getByRole("button", { name: "@humphreytalks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("section[aria-label='Interactive Viral Reel Finder product example'] strong").first()).toHaveText(
    "@humphreytalks"
  );
  await waitForDemoReady(page);

  await page.getByRole("button", { name: "@garyvee", exact: true }).click();
  await expect(page.locator("section[aria-label='Interactive Viral Reel Finder product example'] strong").first()).toHaveText(
    "@garyvee"
  );
  await waitForDemoReady(page);

  const demo = await page.evaluate(async () => {
    const response = await fetch("/features/viral-reel-finder/demo?handle=garyvee");
    return (await response.json()) as { reels: Array<{ id: number }> };
  });
  expect(demo.reels.length).toBeGreaterThan(0);

  const cards = page.getByTestId("reel-card");
  const visibleBefore = await cards.count();
  expect(visibleBefore).toBeGreaterThan(0);
  expect(visibleBefore).toBeLessThanOrEqual(demo.reels.length);

  const first = cards.nth(0);
  const middle = cards.nth(Math.min(1, visibleBefore - 1));
  const last = cards.nth(visibleBefore - 1);

  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first.getByText("Selected. Explore below")).toBeVisible();
  const nextStep = page.getByRole("heading", { name: "See the path before you sign in." });
  await expect(nextStep).toBeVisible();
  await expect.poll(async () =>
    nextStep.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    })
  ).toBe(true);

  if (visibleBefore > 1) {
    await middle.click();
    await expect(middle).toHaveAttribute("aria-pressed", "true");
    await expect(middle.getByText("Selected. Explore below")).toBeVisible();
  }
  if (visibleBefore > 2) {
    await last.click();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(last.getByText("Selected. Explore below")).toBeVisible();
  }

  const stepDetail = page.getByTestId("workflow-step-detail");
  await expect(stepDetail).toHaveAttribute("data-step", "hook");
  await expect(stepDetail.getByText("Start with the actual Reel")).toBeVisible();

  await page.getByRole("button", { name: "2. Transcript", exact: true }).click();
  await expect(stepDetail).toHaveAttribute("data-step", "transcript");
  await expect(stepDetail.getByText("Turn the Reel into text you can inspect.")).toBeVisible();
  await expect(stepDetail.getByText("Start with the actual Reel")).toHaveCount(0);

  await page.getByRole("button", { name: "3. Create", exact: true }).click();
  await expect(stepDetail).toHaveAttribute("data-step", "create");
  await expect(stepDetail.getByText("Use the research as context for an original script.")).toBeVisible();

  const showAll = page.getByRole("button", { name: /Show all \d+ Reels/ });
  if (demo.reels.length > 4) {
    await expect(showAll).toBeVisible();
    await showAll.click();
    await expect(cards).toHaveCount(demo.reels.length);
  } else {
    await expect(showAll).toHaveCount(0);
    await expect(cards).toHaveCount(demo.reels.length);
  }

  const viewsOrder = await reelOrder(page);
  await page.getByRole("button", { name: "Engagement", exact: true }).click();
  await expect(page.getByRole("button", { name: "Engagement", exact: true })).toHaveAttribute("aria-pressed", "true");
  const engagementOrder = await reelOrder(page);
  await page.getByRole("button", { name: "Views", exact: true }).click();
  await expect(page.getByRole("button", { name: "Views", exact: true })).toHaveAttribute("aria-pressed", "true");
  const viewsAgain = await reelOrder(page);
  expect(viewsAgain).toEqual(viewsOrder);
  expect(engagementOrder).not.toEqual(viewsOrder);

  await expect(page.locator('a[href="https://spyreels.ai/free-tools/tiktok-viral-video-finder"]').first()).toBeVisible();
  await expect(page.locator('a[href="https://spyreels.ai/free-tools/instagram-reels-script-generator"]').first()).toBeVisible();
  await expect(page.locator('a[href="https://spyreels.ai/free-tools/viral-hooks"]').first()).toBeVisible();

  expect(qa.consoleErrors, qa.consoleErrors.join(" | ")).toEqual([]);
  expect(qa.failedRequests, qa.failedRequests.join(" | ")).toEqual([]);
});

test("research CTA hands the selected Instagram account to the real app", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Handoff URL is viewport-independent");

  await page.route("https://spyreels.ai/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>handoff</body></html>" });
  });

  const handleInput = page.getByLabel("Instagram username or profile link");
  await handleInput.fill("noman_peera");
  const researchButton = page.getByRole("button", { name: "Research @noman_peera" });
  await expect(researchButton).toBeVisible();
  await researchButton.click();

  await expect(page).toHaveURL(/https:\/\/spyreels\.ai\/\?/);
  const target = new URL(page.url());
  expect(target.searchParams.get("auth")).toBe("signup");
  expect(target.searchParams.get("returnTo")).toBe("/research");
  expect(target.searchParams.get("researchHandle")).toBe("noman_peera");
});
