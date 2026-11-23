import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.fn().mockResolvedValue(undefined);
const email = vi.fn().mockResolvedValue(undefined);

vi.mock("../telegramBot", () => ({ notifyOwnerViaTelegram: telegram }));
vi.mock("../utils/email", () => ({ sendOwnerAlertEmail: email }));

async function fresh() {
  vi.resetModules();
  return await import("./alerts");
}

/** Let the queued email sends run. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("out-of-credit alerts by email", () => {
  const saved = { ALERT_EMAIL: process.env.ALERT_EMAIL, ADMIN_EMAIL: process.env.ADMIN_EMAIL };
  beforeEach(() => {
    telegram.mockClear();
    email.mockClear();
    process.env.ALERT_EMAIL = "owner@example.com";
    delete process.env.ADMIN_EMAIL;
  });
  afterEach(() => {
    process.env.ALERT_EMAIL = saved.ALERT_EMAIL;
    process.env.ADMIN_EMAIL = saved.ADMIN_EMAIL;
    vi.useRealTimers();
  });

  it("recognises billing kinds only", async () => {
    const { isBillingAlertKind } = await fresh();
    expect(isBillingAlertKind("anthropic_out_of_credit")).toBe(true);
    expect(isBillingAlertKind("scrapecreators_out_of_credits")).toBe(true);
    expect(isBillingAlertKind("deepgram_low_balance")).toBe(true);
    expect(isBillingAlertKind("trpc")).toBe(false);
    expect(isBillingAlertKind("out_of_credit_report")).toBe(false);
  });

  it("emails a low-balance warning too", async () => {
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({ kind: "scrapecreators_low_balance", message: "ScrapeCreators balance is low." });
    await flush();
    expect(email).toHaveBeenCalledWith("owner@example.com", "scrapecreators_low_balance", "ScrapeCreators balance is low.");
  });

  it("emails ALERT_EMAIL, else ADMIN_EMAIL, else nobody", async () => {
    const { billingAlertEmail } = await fresh();
    expect(billingAlertEmail({ ALERT_EMAIL: "a@x.com", ADMIN_EMAIL: "b@x.com" })).toBe("a@x.com");
    expect(billingAlertEmail({ ADMIN_EMAIL: "b@x.com" })).toBe("b@x.com");
    expect(billingAlertEmail({ ALERT_EMAIL: " " })).toBeNull();
    expect(billingAlertEmail({})).toBeNull();
  });

  it("emails a provider running dry once per 6 hours, besides Telegram", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({ kind: "openai_out_of_credit", message: "OpenAI is out of credit." });
    await flush();
    expect(email).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledWith("owner@example.com", "openai_out_of_credit", "OpenAI is out of credit.");
    expect(telegram).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    alertOwnerThrottled({ kind: "openai_out_of_credit", message: "OpenAI is out of credit." });
    await flush();
    expect(email).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-11-23T16:01:00Z"));
    alertOwnerThrottled({ kind: "openai_out_of_credit", message: "OpenAI is out of credit." });
    await flush();
    expect(email).toHaveBeenCalledTimes(2);
  });

  it("emails each provider separately, even inside the global Telegram throttle", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({ kind: "deepgram_out_of_credit", message: "Deepgram is out of credit." });
    alertOwnerThrottled({ kind: "scrapecreators_out_of_credits", message: "ScrapeCreators is out of credits." });
    await flush();
    expect(email).toHaveBeenCalledTimes(2);
    expect(telegram).toHaveBeenCalledTimes(1); // the 1-per-minute Telegram limit still applies
  });

  it("does not email ordinary errors", async () => {
    const { alertOwnerThrottled } = await fresh();
    alertOwnerThrottled({ kind: "trpc", message: "boom" });
    await flush();
    expect(email).not.toHaveBeenCalled();
  });
});
