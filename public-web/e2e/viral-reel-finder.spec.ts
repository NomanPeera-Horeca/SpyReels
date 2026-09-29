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
});

test("first paint asks for one account before showing Reels", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find viral Instagram Reels in your niche");
  await expect(page.getByText("Viral Reel Finder", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Instagram username or profile link")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find viral Reels", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "@garyvee", exact: true })).toBeVisible();
  await expect(page.getByTestId("reel-card")).toHaveCount(0);
  await expect(page.getByText("Interactive example", { exact: true })).toHaveCount(0);
  await expect(page.getByText("This file shows the design.")).toHaveCount(0);
});

test("visitor can understand and interact with the Reel Finder before signup", async ({ page }) => {
  const qa = (page as Page & { __qa: { consoleErrors: string[]; failedRequests: string[] } }).__qa;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find viral Instagram Reels in your niche");
  await expect(page.getByText("Viral Reel Finder", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Paste a public handle")).toBeVisible();
  await expect(page.getByLabel("Instagram username or profile link")).toBeVisible();
  await expect(page.getByTestId("reel-card")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await page.route("**/api/trpc/featured.publicProfilePreview?input=*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { data: { json: {
      found: true, username: "noman_peera", fullName: "Noman Peera",
      biography: "Creator", profilePicUrl: "", followerCount: 1200,
      followingCount: 150, postCount: 40, isVerified: false, isPrivate: false, category: "",
    } } } }) })
  );
  await page.getByLabel("Instagram username or profile link").fill("noman_peera");
  await expect(page.getByTestId("confirmed-instagram-profile")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("confirmed-instagram-profile")).not.toContainText("40 posts");
  await expect(page.getByTestId("reel-card")).toHaveCount(0);

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
  await expect(first.getByText("Selected", { exact: true })).toBeVisible();
  const nextStep = page.getByRole("region", { name: "Selected Reel" });
  await expect(nextStep).toBeVisible();
  await expect(nextStep.getByText("This Reel")).toBeVisible();
  await expect(nextStep.getByRole("button", { name: "What SpyReels can do next" })).toBeVisible();
  await expect(nextStep.getByRole("button", { name: /Continue @|Research @/ })).toHaveCount(0);
  await expect.poll(async () =>
    nextStep.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    })
  ).toBe(true);

  if (visibleBefore > 1) {
    await middle.click();
    await expect(middle).toHaveAttribute("aria-pressed", "true");
    await expect(middle.getByText("Selected", { exact: true })).toBeVisible();
    await expect(nextStep.getByRole("button", { name: "What SpyReels can do next" })).toBeVisible();
  }
  if (visibleBefore > 2) {
    await last.click();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(last.getByText("Selected", { exact: true })).toBeVisible();
  }

  await page.getByTestId("reveal-spyreels-next").click();
  const stepDetail = page.getByTestId("workflow-step-detail");
  await expect(stepDetail).toHaveAttribute("data-step", "next");
  await expect(stepDetail.getByText("Transcribe this Reel, then write your own version.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue @/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "What SpyReels can do next" })).toHaveCount(0);

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

  await expect(page.locator('a[href="/free-tools/tiktok-viral-video-finder"]').first()).toBeVisible();
  await expect(page.locator('a[href="/free-tools/ai-script-generator"]').first()).toBeVisible();
  await expect(page.locator('a[href="/free-tools/viral-hooks"]').first()).toBeVisible();

  expect(qa.consoleErrors, qa.consoleErrors.join(" | ")).toEqual([]);
  expect(qa.failedRequests, qa.failedRequests.join(" | ")).toEqual([]);
});

test("research CTA hands the selected Instagram account to the real app", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Handoff URL is viewport-independent");

  await page.route("**/api/trpc/featured.publicProfilePreview?input=*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { data: { json: {
      found: true, username: "noman_peera", fullName: "Noman Peera",
      biography: "Creator", profilePicUrl: "", followerCount: 1200,
      followingCount: 150, postCount: 40, isVerified: false, isPrivate: false, category: "",
    } } } }) })
  );
  await page.getByLabel("Instagram username or profile link").fill("noman_peera");
  const researchButton = page.getByTestId("confirmed-instagram-profile");
  await expect(researchButton).toBeVisible();
  await researchButton.click();

  await expect(page).toHaveURL(/\/features\/viral-reel-finder\?auth=signup/);
  await expect(page.getByRole("dialog", { name: "Join SpyReels" })).toBeVisible();
  const target = new URL(page.url());
  expect(target.searchParams.get("auth")).toBe("signup");
  expect(target.searchParams.get("returnTo")).toBe("/research?creator=noman_peera&start=1");
  expect(target.searchParams.has("researchHandle")).toBe(false);
});
