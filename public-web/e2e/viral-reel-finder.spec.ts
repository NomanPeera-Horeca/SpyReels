import { expect, test, type Page } from "@playwright/test";

const tinyImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='480'%3E%3Crect width='100%25' height='100%25' fill='%23201d2b'/%3E%3C/svg%3E";

const demoReels = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  reelShortcode: `reel-${index + 1}`,
  caption: `Hook ${index + 1}: This is a real example opening line for the browser QA flow.`,
  viewCount: 900_000 - index * 75_000,
  likeCount: 20_000 + index * 1_000,
  commentCount: 500 + index * 50,
  engagementRate: index === 7 ? 12.5 : 2 + index * 0.4,
  thumbnailUrl: tinyImage,
}));

async function mockPublicFinderApis(page: Page) {
  await page.route("**/features/viral-reel-finder/profile?handle=noman_peera", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        found: true,
        username: "noman_peera",
        fullName: "Noman Peera",
        biography: "Restaurant operator and creator",
        profilePicUrl: tinyImage,
        followerCount: 10_400,
        followingCount: 164,
        postCount: 12,
        isVerified: true,
        isPrivate: false,
        category: "Entrepreneur",
      }),
    });
  });

  await page.route("**/features/viral-reel-finder/demo?handle=*", async route => {
    const requestUrl = new URL(route.request().url());
    const handle = requestUrl.searchParams.get("handle") || "garyvee";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        handle,
        totalReelCount: 21,
        medianViewCount: 742_000,
        reels: demoReels,
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockPublicFinderApis(page);
  await page.goto("/features/viral-reel-finder");
});

test("visitor can understand and interact with the Reel Finder before signup", async ({ page }, testInfo) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Any Instagram account's viral Reels");
  await expect(page.getByText("Free Instagram Reel Finder", { exact: true })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);

  const handleInput = page.getByLabel("Instagram username or profile link");
  await handleInput.fill("noman_peera");
  await expect(page.getByText("@noman_peera", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Research @noman_peera" })).toBeVisible();

  const firstReel = page.getByRole("button", { name: /See what SpyReels does next/ }).first();
  await expect(firstReel).toBeVisible();
  await firstReel.click();

  const nextStepHeading = page.getByRole("heading", { name: "See the path before you sign in." });
  await expect(nextStepHeading).toBeVisible();
  await expect(page.getByText("Selected — explore below ↓")).toBeVisible();
  await expect.poll(async () =>
    nextStepHeading.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    })
  ).toBe(true);

  await page.getByRole("button", { name: "2. Transcript" }).click();
  await expect(page.getByText("Turn the Reel into text you can inspect.")).toBeVisible();

  await page.getByRole("button", { name: "3. Create" }).click();
  await expect(page.getByText("Use the research as context for an original script.")).toBeVisible();

  await page.getByRole("button", { name: /Show all 8 Reels/ }).click();
  await expect(page.locator("button[aria-pressed]")).toHaveCount(8);

  await page.getByRole("button", { name: "Engagement" }).click();
  await expect(page.getByText("12.5% engagement")).toBeVisible();

  await expect(page.getByRole("link", { name: /TikTok Viral Video Finder/ })).toHaveAttribute(
    "href",
    "https://spyreels.ai/free-tools/tiktok-viral-video-finder"
  );
  await expect(page.getByRole("link", { name: /Instagram Reels Script Generator/ })).toHaveAttribute(
    "href",
    "https://spyreels.ai/free-tools/instagram-reels-script-generator"
  );
  await expect(page.getByRole("link", { name: /Viral Hook Generator/ })).toHaveAttribute(
    "href",
    "https://spyreels.ai/free-tools/viral-hooks"
  );

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await testInfo.attach("final-page", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("research CTA hands the selected Instagram account to the real app", async ({ page }) => {
  await page.route("https://spyreels.ai/**", async route => {
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
