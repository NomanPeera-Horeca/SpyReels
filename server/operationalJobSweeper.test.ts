import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_JOB_STALE_MS,
  OPERATIONAL_JOB_ZOMBIE_MESSAGE,
  staleOperationalJobRecovery,
} from "./operationalJobSweeper";

describe("operational background job recovery", () => {
  it("uses a bounded stale threshold", () => {
    expect(OPERATIONAL_JOB_STALE_MS).toBe(20 * 60 * 1000);
  });

  it("returns a retryable terminal state", () => {
    expect(staleOperationalJobRecovery()).toEqual({
      status: "failed",
      errorMessage: OPERATIONAL_JOB_ZOMBIE_MESSAGE,
    });
  });
});
