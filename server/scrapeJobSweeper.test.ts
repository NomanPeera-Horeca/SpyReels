import { describe, expect, it } from "vitest";
import {
  SCRAPE_JOB_PENDING_STALE_MS,
  SCRAPE_JOB_RUNNING_STALE_MS,
  SCRAPE_JOB_ZOMBIE_MESSAGE,
  SCRAPE_REFRESH_RECOVERED_MESSAGE,
  staleScrapeRecoveryForReelCount,
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

  it("allows queued work longer than an active job heartbeat", () => {
    expect(SCRAPE_JOB_PENDING_STALE_MS).toBeGreaterThan(
      SCRAPE_JOB_RUNNING_STALE_MS
    );
  });
});
