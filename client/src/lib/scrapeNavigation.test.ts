import { describe, expect, it, vi } from "vitest";
import { navigateAfterScrapeStart } from "./scrapeNavigation";

describe("navigateAfterScrapeStart", () => {
  it("opens the results straight away when the job was filled from saved research", () => {
    const go = vi.fn();
    navigateAfterScrapeStart({ jobId: 7, seededFromRecent: true }, go, "research");
    expect(go.mock.calls[0]![0]).not.toContain("/scraping?");
  });

  it("opens the results straight away for featured creators, as before", () => {
    const go = vi.fn();
    navigateAfterScrapeStart({ jobId: 7, seededFromFeatured: true }, go, "research");
    expect(go.mock.calls[0]![0]).not.toContain("/scraping?");
  });

  it("shows the progress page for a brand-new creator", () => {
    const go = vi.fn();
    navigateAfterScrapeStart({ jobId: 7 }, go, "research");
    expect(go).toHaveBeenCalledWith("/scraping?jobId=7&from=research");
  });
});
