import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_JOB_STALE_MS,
  OPERATIONAL_JOB_ZOMBIE_MESSAGE,
  STALE_CAROUSEL_STATUSES,
  STALE_DISCOVERY_STATUSES,
  STALE_RECREATED_SCRIPT_STATUSES,
  STALE_SCRIPT_IDEA_STATUSES,
  staleOperationalJobRecovery,
  isMissingTableError,
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

  it("covers every persisted non-terminal AI workflow", () => {
    expect(STALE_SCRIPT_IDEA_STATUSES).toEqual([
      "queued",
      "validating",
      "processing",
    ]);
    expect(STALE_RECREATED_SCRIPT_STATUSES).toEqual([
      "pending",
      "processing",
    ]);
    expect(STALE_DISCOVERY_STATUSES).toEqual(["pending", "running"]);
    expect(STALE_CAROUSEL_STATUSES).toEqual(["pending", "processing"]);
  });

  it("recognizes nested missing-table errors without hiding unrelated failures", () => {
    expect(
      isMissingTableError({
        message: "query failed",
        cause: { code: "ER_NO_SUCH_TABLE", message: "Table doesn't exist" },
      })
    ).toBe(true);
    expect(isMissingTableError(new Error("connection reset"))).toBe(false);
  });
});
