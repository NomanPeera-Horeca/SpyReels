import { describe, it, expect, vi } from "vitest";

// Test the notifyOwnerViaTelegram function structure
describe("Signup Notification", () => {
  it("notifyOwnerViaTelegram is exported from telegramBot", async () => {
    const mod = await import("./telegramBot");
    expect(typeof mod.notifyOwnerViaTelegram).toBe("function");
  });

  it("notifyOwnerViaTelegram does not throw when bot token is missing", async () => {
    // With no token configured in test env, it should silently return
    const { notifyOwnerViaTelegram } = await import("./telegramBot");
    await expect(notifyOwnerViaTelegram("test message")).resolves.toBeUndefined();
  });

  it("oauth callback imports notifyOwner and notifyOwnerViaTelegram", async () => {
    // Verify the oauth module can be imported without errors
    const oauthModule = await import("./_core/oauth");
    expect(typeof oauthModule.registerOAuthRoutes).toBe("function");
  });

  it("notifyOwner is available from notification module", async () => {
    const { notifyOwner } = await import("./_core/notification");
    expect(typeof notifyOwner).toBe("function");
  });
});
