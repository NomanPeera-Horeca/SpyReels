import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./monitoring/alerts", () => ({ alertOwnerThrottled: vi.fn() }));

import { alertOwnerThrottled } from "./monitoring/alerts";
import {
  SCRAPECREATORS_CREDIT_PAUSE_MS,
  noteScrapeCreatorsStatus,
  resetScrapeCreatorsCreditStateForTests,
  scrapeCreatorsOutOfCredits,
  scrapeCreatorsOutOfCreditsSince,
} from "./scrapeCreatorsMeter";

describe("ScrapeCreators out-of-credits safety stop", () => {
  afterEach(() => {
    resetScrapeCreatorsCreditStateForTests();
    vi.mocked(alertOwnerThrottled).mockClear();
  });

  it("pauses after a 402 for 30 minutes, then lets work try again", () => {
    expect(scrapeCreatorsOutOfCredits(1_000)).toBe(false);
    noteScrapeCreatorsStatus(402, 1_000);
    expect(scrapeCreatorsOutOfCredits(1_001)).toBe(true);
    expect(scrapeCreatorsOutOfCredits(1_000 + SCRAPECREATORS_CREDIT_PAUSE_MS)).toBe(false);
  });

  it("a successful answer ends the pause at once", () => {
    noteScrapeCreatorsStatus(402, 1_000);
    noteScrapeCreatorsStatus(200, 2_000);
    expect(scrapeCreatorsOutOfCredits(2_001)).toBe(false);
  });

  it("other errors do not pause anything", () => {
    noteScrapeCreatorsStatus(429, 1_000);
    noteScrapeCreatorsStatus(500, 1_000);
    expect(scrapeCreatorsOutOfCredits(1_001)).toBe(false);
  });

  it("tells whether a 402 happened during a piece of work", () => {
    noteScrapeCreatorsStatus(402, 5_000);
    expect(scrapeCreatorsOutOfCreditsSince(4_000)).toBe(true);
    expect(scrapeCreatorsOutOfCreditsSince(6_000)).toBe(false);
  });

  it("alerts the owner once per outage", () => {
    noteScrapeCreatorsStatus(402, 1_000);
    noteScrapeCreatorsStatus(402, 2_000);
    expect(alertOwnerThrottled).toHaveBeenCalledTimes(1);
    noteScrapeCreatorsStatus(200, 3_000);
    noteScrapeCreatorsStatus(402, 4_000);
    expect(alertOwnerThrottled).toHaveBeenCalledTimes(2);
  });
});
