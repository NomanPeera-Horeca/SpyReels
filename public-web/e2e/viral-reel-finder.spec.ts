import { expect, test, type Page } from "@playwright/test";

async function waitForDemoReady(page: Page) {
  await expect(page.getByText("Interactive example", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading results…")).toHaveCount(0);
  await expect(page.getByTestId("reel-card").first()).toBeVisible({ timeout: 20_000 });
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Find viral Instagram Reels in your niche"
  );
  await expect(page.getByText("Free Instagram Reel Finder", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Instagram username or profile link")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find viral Reels", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "@garyvee", exact: true })).toBeVisible();
  await expect(page.getByTestId("reel-card")).toHaveCount(0);
  await expect(page.getByText("Interactive example", { exact: true })).toHaveCount(0);
});

test("empty Finder submission visibly identifies the field and error", async ({ page }) => {
  await page.getByRole("button", { name: "Find viral Reels", exact: true }).click();
  const input = page.getByLabel("Instagram username or profile link");
  const error = page.getByRole("alert");

  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", "viral-finder-error");
  await expect(error).toHaveText("Enter a valid Instagram username or profile link.");

  await input.fill("hormozi");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(input).toHaveAttribute("aria-invalid", "false");
});

test("final CTA returns visitors to the visible Finder input", async ({ page }) => {
  await page.getByRole("link", { name: "Find viral Reels", exact: true }).click();
  await expect(page).toHaveURL(/#live-demo$/);
  await expect.poll(async () =>
    page.evaluate(() => {
      const input = document.querySelector("#viral-finder-handle");
      const header = document.querySelector("header");
      if (!input || !header) return false;
      const top = input.getBoundingClientRect().top;
      return top >= header.getBoundingClientRect().bottom + 12 && top < window.innerHeight * 0.65;
    })
  ).toBe(true);
});

test("approved Finder Results Preview matches the locked desktop/mobile pattern", async ({ page }, testInfo) => {
  const qa = (page as Page & { __qa: { consoleErrors: string[]; failedRequests: string[] } }).__qa;

  await page.getByRole("button", { name: "@garyvee", exact: true }).click();
  await waitForDemoReady(page);

  const preview = page.getByTestId("finder-results-preview");
  const row = page.getByTestId("finder-results-row");
  const cards = page.getByTestId("reel-card");

  await expect(preview.getByText("Interactive example", { exact: true })).toBeVisible();
  await expect(preview.getByText("@garyvee", { exact: true })).toBeVisible();

  await expect(preview.getByText("21 Reels available")).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "Views", exact: true })).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "Engagement", exact: true })).toHaveCount(0);
  await expect(preview.getByRole("button", { name: /Show all/ })).toHaveCount(0);

  const demo = await page.evaluate(async () => {
    const response = await fetch("/features/viral-reel-finder/demo?handle=garyvee");
    return (await response.json()) as { reels: Array<{ id: number }> };
  });
  await expect(cards).toHaveCount(Math.min(4, demo.reels.length));

  for (let index = 0; index < (await cards.count()); index += 1) {
    await expect(cards.nth(index).getByRole("button", { name: "Remake →", exact: true })).toBeVisible();
  }

  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, right: rect.right };
    })
  );

  if (testInfo.project.name.startsWith("mobile-")) {
    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes[0].width).toBeLessThan(190);
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(2);
    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    if (previewBox && boxes.length > 2) {
      expect(boxes[2].x).toBeLessThan(previewBox.x + previewBox.width + boxes[2].width);
    }
  } else {
    expect(boxes.length).toBeGreaterThan(1);
    const firstY = boxes[0].y;
    expect(boxes.every((box) => Math.abs(box.y - firstY) <= 2)).toBe(true);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await preview.screenshot({ path: testInfo.outputPath("finder-results-preview.png") });

  expect(qa.consoleErrors, qa.consoleErrors.join(" | ")).toEqual([]);
  expect(qa.failedRequests, qa.failedRequests.join(" | ")).toEqual([]);
});

test("Remake preserves the selected creator through signup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Auth handoff is viewport-independent");

  await page.getByRole("button", { name: "@garyvee", exact: true }).click();
  await waitForDemoReady(page);

  await page.getByTestId("reel-card").first().getByRole("button", { name: "Remake →", exact: true }).click();

  await expect(page).toHaveURL(/\/features\/viral-reel-finder\?auth=signup/);
  await expect(page.getByRole("dialog", { name: "Join SpyReels" })).toBeVisible();

  const target = new URL(page.url());
  expect(target.searchParams.get("auth")).toBe("signup");
  expect(target.searchParams.get("returnTo")).toBe("/research?creator=garyvee&start=1");
});

test("research CTA hands a confirmed Instagram account to the real app", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Handoff URL is viewport-independent");

  await page.route("**/api/trpc/featured.publicProfilePreview?input=*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          data: {
            json: {
              found: true,
              username: "noman_peera",
              fullName: "Noman Peera",
              biography: "Creator",
              profilePicUrl: "",
              followerCount: 1200,
              followingCount: 150,
              postCount: 40,
              isVerified: false,
              isPrivate: false,
              category: "",
            },
          },
        },
      }),
    })
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
