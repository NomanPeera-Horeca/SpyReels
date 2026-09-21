import { describe, expect, it } from "vitest";
import {
  SCRAPE_JOB_PENDING_STALE_MS,
  SCRAPE_JOB_RUNNING_STALE_MS,
  SCRAPE_JOB_ZOMBIE_MESSAGE,
  SCRAPE_REFRESH_RECOVERED_MESSAGE,
  staleScrapeRecoveryForReelCount,
  stalePlatformScrapeRecoveryForItemCount,
} from "./scrapeJobSweeper";

describe("stale scrape job recovery", () => {
  it("fails interrupted new research without stored reels", () => {
    expect(staleScrapeRecoveryForReelCount(0)).toEqual({
      status: "failed",
      currentStep: "failed",
      progressPercent: 0,
      errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
      failureReason: "unknown",
    });
  });

  it("restores an interrupted refresh to its last successful dataset", () => {
    expect(staleScrapeRecoveryForReelCount(57)).toEqual({
      status: "completed",
      currentStep: "complete",
      progressPercent: 100,
      errorMessage: SCRAPE_REFRESH_RECOVERED_MESSAGE,
      failureReason: "unknown",
    });
  });

  it("preserves TikTok and YouTube refresh data after interruption", () => {
    expect(stalePlatformScrapeRecoveryForItemCount(57)).toEqual({
      status: "completed",
      currentStep: "complete",
      progressPercent: 100,
      errorMessage: SCRAPE_REFRESH_RECOVERED_MESSAGE,
    });
  });

  it("fails a new TikTok or YouTube job with no stored videos", () => {
    expect(stalePlatformScrapeRecoveryForItemCount(0)).toEqual({
      status: "failed",
      currentStep: "failed",
      progressPercent: 0,
      errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
    });
  });

  it("allows queued work longer than an active job heartbeat", () => {
    expect(SCRAPE_JOB_PENDING_STALE_MS).toBeGreaterThan(
      SCRAPE_JOB_RUNNING_STALE_MS
    );
  });
});
