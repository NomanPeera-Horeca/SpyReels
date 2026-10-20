import { describe, expect, it } from "vitest";
import {
  FIRST_SIGNUP_GUIDE_MS,
  decideOnboardingAccess,
  hasLegacyOnboardingProgress,
  hasSavedOnboardingProgress,
  isMarketingPath,
} from "./onboardingAccess";

const fresh = {
  isPostLaunchUser: true,
  completed: false,
  skipped: false,
  hasSavedProgress: false,
  released: false,
  progressUnreadable: false,
  pathname: "/",
  accountAgeMs: 60_000,
};

describe("decideOnboardingAccess", () => {
  it("guides a first signup that lands on Home with nothing saved", () => {
    expect(decideOnboardingAccess(fresh)).toBe("guide");
  });

  it("lets a customer who left halfway open Home and product routes", () => {
    expect(decideOnboardingAccess({ ...fresh, released: true })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, hasSavedProgress: true, pathname: "/" })).toBe(
      "allow"
    );
    expect(decideOnboardingAccess({ ...fresh, pathname: "/studio" })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/dashboard" })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/scripts" })).toBe("allow");
  });

  it("does not send a returning customer back into onboarding", () => {
    expect(
      decideOnboardingAccess({ ...fresh, accountAgeMs: FIRST_SIGNUP_GUIDE_MS + 1 })
    ).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, completed: true })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, skipped: true })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, isPostLaunchUser: false })).toBe("allow");
  });

  it("leaves marketing pages alone", () => {
    expect(isMarketingPath("/pricing")).toBe(true);
    expect(isMarketingPath("/free-tools/viral-hooks")).toBe(true);
    expect(isMarketingPath("/blog/how-to-edit")).toBe(true);
    expect(decideOnboardingAccess({ ...fresh, pathname: "/pricing" })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/free-tools/broll-generator" })).toBe(
      "allow"
    );
  });

  it("stays on onboarding when the customer is already there", () => {
    expect(decideOnboardingAccess({ ...fresh, pathname: "/onboarding" })).toBe("allow");
  });

  it("does not guide when the progress read failed", () => {
    expect(decideOnboardingAccess({ ...fresh, progressUnreadable: true })).toBe("allow");
  });
});

describe("saved progress", () => {
  it("treats a confirmed profile, answers, or items as started", () => {
    expect(
      hasSavedOnboardingProgress({
        profileConfirmed: true,
        hasAnswers: false,
        hasItems: false,
        resumeStep: "use_case",
      })
    ).toBe(true);
    expect(
      hasSavedOnboardingProgress({
        profileConfirmed: false,
        hasAnswers: false,
        hasItems: false,
        resumeStep: "platform",
      })
    ).toBe(false);
  });

  it("treats a legacy niche or description as started", () => {
    expect(
      hasLegacyOnboardingProgress({
        businessDescription: "Cafe in Austin",
        nicheCount: 0,
        hasCreator: false,
      })
    ).toBe(true);
    expect(
      hasLegacyOnboardingProgress({
        businessDescription: null,
        nicheCount: 0,
        hasCreator: false,
      })
    ).toBe(false);
  });
});
