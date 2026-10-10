import { expect, test } from "@playwright/test";
import { collectMarketingCopySlots } from "../lib/collectMarketingCopySlots";
import { marketingCopySpecFailures } from "../lib/marketingContentSpec";

test.describe("Marketing content-spec (Figma Decision 32)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "content-spec runs once");
  });

  test("finder configs and shared marketing copy stay within Figma limits", () => {
    const failures = marketingCopySpecFailures(collectMarketingCopySlots());
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
