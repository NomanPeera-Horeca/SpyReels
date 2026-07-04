import { describe, expect, it } from "vitest";
import {
  SCRAPE_EARLY_DASHBOARD_MIN_REELS,
  scrapeDashboardPath,
  scrapeDisplayPercent,
  scrapePhaseLabel,
  scrapeProgressDetail,
  shouldOpenDashboardEarly,
} from "@shared/scrapeProgressUi";

describe("scrapeProgressUi", () => {
  it("opens dashboard early once enough reels exist", () => {
    expect(SCRAPE_EARLY_DASHBOARD_MIN_REELS).toBe(5);
    expect(shouldOpenDashboardEarly(4)).toBe(false);
    expect(shouldOpenDashboardEarly(5)).toBe(true);
  });

  it("builds dashboard paths", () => {
    expect(scrapeDashboardPath(626, "research")).toBe("/dashboard?jobId=626&from=research");
  });

  it("caps in-flight progress below 100", () => {
    expect(scrapeDisplayPercent("running", 88)).toBe(88);
    expect(scrapeDisplayPercent("running", 100)).toBe(95);
    expect(scrapeDisplayPercent("completed", 100)).toBe(100);
  });

  it("labels scrape phases", () => {
    expect(scrapePhaseLabel("pulling_reels", "running")).toBe("Pulling reels");
    expect(scrapePhaseLabel("ranking", "running")).toBe("Ranking and saving");
  });

  it("formats progress detail with percent and reels", () => {
    const detail = scrapeProgressDetail({
      jobId: 1,
      handle: "mikecesaroni",
      status: "running",
      progressPercent: 72,
      reelsFound: 97,
      currentStep: "pulling_reels",
    });
    expect(detail).toContain("72%");
    expect(detail).toContain("97 reels");
    expect(detail).toContain("Pulling reels");
  });
});
