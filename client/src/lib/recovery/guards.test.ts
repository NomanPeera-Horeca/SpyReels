import { describe, expect, it, vi } from "vitest";
import {
  createGenerationGuard,
  createSubmitLock,
  pollWhileActive,
  retryRead,
  shouldApplyServerSnapshot,
} from "./guards";

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

  it("drops a snapshot from an older request or an older version", () => {
    expect(
      shouldApplyServerSnapshot({
        requestId: 1,
        currentId: 2,
        snapshotVersion: 3,
        appliedVersion: null,
      })
    ).toBe(false);
    expect(
      shouldApplyServerSnapshot({
        requestId: 2,
        currentId: 2,
        snapshotVersion: 1,
        appliedVersion: 2,
      })
    ).toBe(false);
    expect(
      shouldApplyServerSnapshot({
        requestId: 2,
        currentId: 2,
        snapshotVersion: 2,
        appliedVersion: 2,
      })
    ).toBe(true);
  });

  it("retries by cancelling the previous read and ignoring a stale result", async () => {
    const cancel = vi.fn(async () => undefined);
    const refetch = vi.fn(async () => "saved");
    await expect(
      retryRead({ cancel, refetch, isCurrent: () => false })
    ).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(refetch).not.toHaveBeenCalled();

    await expect(
      retryRead({ cancel, refetch, isCurrent: () => true })
    ).resolves.toBe("saved");
    expect(refetch).toHaveBeenCalledOnce();
  });
});
