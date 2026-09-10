import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn().mockResolvedValue(undefined);

vi.mock("../telegramBot", () => ({
  notifyOwnerViaTelegram: send,
}));

async function fresh() {
  vi.resetModules();
  return await import("./alerts");
}

describe("alertOwnerThrottled", () => {
  beforeEach(() => {
    send.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a Telegram alert on the first failure", async () => {
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({
      kind: "trpc",
      message: "boom",
      error: new Error("db connection lost"),
    });
    expect(send).toHaveBeenCalledTimes(1);
    const text = send.mock.calls[0][0] as string;
    expect(text).toContain("[SpyReels Alert]");
    expect(text).toContain("trpc");
    expect(text).toContain("db connection lost");
  });

  it("dedupes the same kind+message within the window", async () => {
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({ kind: "sweeper", message: "scrape crashed" });
    vi.advanceTimersByTime(20_000);
    alertOwnerThrottled({ kind: "sweeper", message: "scrape crashed" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("globally throttles a different kind within one minute", async () => {
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({ kind: "trpc", message: "alpha" });
    vi.advanceTimersByTime(10_000);
    alertOwnerThrottled({ kind: "sweeper", message: "beta" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports suppressed occurrences on the next allowed send", async () => {
    const { alertOwnerThrottled, getAlertTelemetry } = await fresh();
    alertOwnerThrottled({ kind: "trpc", message: "loop" });
    vi.advanceTimersByTime(20_000);
    alertOwnerThrottled({ kind: "trpc", message: "loop" });
    vi.advanceTimersByTime(11 * 60_000);
    alertOwnerThrottled({ kind: "trpc", message: "loop" });
    expect(send).toHaveBeenCalledTimes(2);
    const text = send.mock.calls[1][0] as string;
    expect(text).toContain("1 more suppressed since last");
    expect(getAlertTelemetry().totalSuppressed).toBe(1);
    expect(getAlertTelemetry().totalSent).toBe(2);
  });

  it("never throws if the messenger fails", async () => {
    send.mockRejectedValueOnce(new Error("telegram unreachable"));
    const { alertOwnerThrottled } = await fresh();
    expect(() =>
      alertOwnerThrottled({ kind: "boot", error: new Error("startup died") })
    ).not.toThrow();
  });
});