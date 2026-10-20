import { describe, expect, it } from "vitest";
import { createGenerationGuard, createSubmitLock, pollWhileActive } from "./guards";

describe("recovery guards", () => {
  it("blocks a second submit until the first one releases", () => {
    const lock = createSubmitLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });

  it("treats only the latest request as current", () => {
    const guard = createGenerationGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("polls only while the saved job is still active", () => {
    const poll = pollWhileActive<{ status: string }>(
      data => data?.status === "running",
      2000
    );
    expect(poll({ state: { data: { status: "running" } } })).toBe(2000);
    expect(poll({ state: { data: { status: "succeeded" } } })).toBe(false);
    expect(poll({ state: {} })).toBe(false);
  });
});
