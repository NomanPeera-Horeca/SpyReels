import { describe, expect, it } from "vitest";
import { readExperienceConfig, resolveExperienceAccess } from "./onboardingV2Access";

const cutoff = "2026-11-01T00:00:00Z";
const customer = { role: "user", email: "old@x.com", createdAt: "2025-05-01T00:00:00Z" };
const newSignup = { role: "user", email: "new@x.com", createdAt: "2026-11-02T00:00:00Z" };
const admin = { role: "admin", email: "boss@x.com", createdAt: "2024-01-01T00:00:00Z" };
const tester = { role: "user", email: "Tester@SpyReels.ai", createdAt: "2024-01-01T00:00:00Z" };

const cfg = (env: Record<string, string>) => readExperienceConfig(env);

describe("resolveExperienceAccess", () => {
  it("defaults to off for everyone, admins included", () => {
    for (const u of [customer, newSignup, admin, tester]) {
      expect(resolveExperienceAccess(u, cfg({}))).toMatchObject({
        onboarding: "legacy",
        home: "research",
      });
    }
  });

  it("unknown mode values fail closed", () => {
    expect(
      resolveExperienceAccess(admin, cfg({ ONBOARDING_V2_MODE: "on" })).onboarding
    ).toBe("legacy");
  });

  it("internal: only admins and allowlisted emails (case-insensitive)", () => {
    const c = cfg({
      ONBOARDING_V2_MODE: "internal",
      EXPERIENCE_V2_INTERNAL_EMAILS: "tester@spyreels.ai, nope",
      EXPERIENCE_V2_NEW_SIGNUPS_FROM: cutoff,
    });
    expect(resolveExperienceAccess(admin, c).onboarding).toBe("v2");
    expect(resolveExperienceAccess(tester, c)).toMatchObject({ onboarding: "v2", internal: true });
    expect(resolveExperienceAccess(newSignup, c).onboarding).toBe("legacy");
    expect(resolveExperienceAccess(customer, c).onboarding).toBe("legacy");
  });

  it("new_signups: 100% of accounts created at/after the cutoff; existing customers never", () => {
    const c = cfg({ ONBOARDING_V2_MODE: "new_signups", EXPERIENCE_V2_NEW_SIGNUPS_FROM: cutoff });
    expect(resolveExperienceAccess(newSignup, c).onboarding).toBe("v2");
    expect(
      resolveExperienceAccess({ ...newSignup, createdAt: cutoff }, c).onboarding
    ).toBe("v2");
    expect(resolveExperienceAccess(customer, c).onboarding).toBe("legacy");
    expect(resolveExperienceAccess(admin, c).onboarding).toBe("v2");
  });

  it("new_signups without a valid cutoff only lets internal users in", () => {
    for (const from of [undefined, "", "not-a-date"]) {
      const env: Record<string, string> = { ONBOARDING_V2_MODE: "new_signups" };
      if (from !== undefined) env.EXPERIENCE_V2_NEW_SIGNUPS_FROM = from;
      expect(resolveExperienceAccess(newSignup, cfg(env)).onboarding).toBe("legacy");
      expect(resolveExperienceAccess(admin, cfg(env)).onboarding).toBe("v2");
    }
  });

  it("Home v2 never turns on without onboarding v2 for the same user", () => {
    const c = cfg({ HOME_V2_MODE: "internal", ONBOARDING_V2_MODE: "off" });
    expect(resolveExperienceAccess(admin, c).home).toBe("research");
    const both = cfg({ HOME_V2_MODE: "internal", ONBOARDING_V2_MODE: "new_signups", EXPERIENCE_V2_NEW_SIGNUPS_FROM: cutoff });
    expect(resolveExperienceAccess(admin, both).home).toBe("v2");
    expect(resolveExperienceAccess(newSignup, both)).toMatchObject({ onboarding: "v2", home: "research" });
  });

  it("rollback: switching the mode to off removes access immediately", () => {
    const on = cfg({ ONBOARDING_V2_MODE: "new_signups", HOME_V2_MODE: "new_signups", EXPERIENCE_V2_NEW_SIGNUPS_FROM: cutoff });
    expect(resolveExperienceAccess(newSignup, on)).toMatchObject({ onboarding: "v2", home: "v2" });
    const off = cfg({ ONBOARDING_V2_MODE: "off", HOME_V2_MODE: "new_signups", EXPERIENCE_V2_NEW_SIGNUPS_FROM: cutoff });
    expect(resolveExperienceAccess(newSignup, off)).toMatchObject({ onboarding: "legacy", home: "research" });
  });

  it("signed-out visitors get the legacy experience", () => {
    expect(resolveExperienceAccess(null, cfg({ ONBOARDING_V2_MODE: "internal" }))).toEqual({
      onboarding: "legacy",
      home: "research",
      internal: false,
    });
  });
});
