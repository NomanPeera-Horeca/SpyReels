import { describe, expect, it } from "vitest";
import {
  MAX_RETRY_DELAY_SECONDS,
  retryDelaySeconds,
  safeJobError,
  shouldDeadLetter,
} from "./policy";

describe("durable job policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(retryDelaySeconds(1)).toBe(15);
    expect(retryDelaySeconds(2)).toBe(30);
    expect(retryDelaySeconds(20)).toBe(MAX_RETRY_DELAY_SECONDS);
  });

  it("dead-letters only after the final attempt", () => {
    expect(shouldDeadLetter(2, 3)).toBe(false);
    expect(shouldDeadLetter(3, 3)).toBe(true);
  });

  it("redacts unbounded multiline errors from persisted job state", () => {
    expect(safeJobError(new Error("one\n two"))).toBe("one two");
    expect(safeJobError("")).toBe("Unknown job error");
    expect(safeJobError("x".repeat(3000))).toHaveLength(2000);
  });
});
