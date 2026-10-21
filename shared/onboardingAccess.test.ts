import { describe, expect, it } from "vitest";
import { PUBLIC_AUTH_DEFAULT_RETURN_TO } from "./publicAuthHandoff";
import {
  decideOnboardingAccess,
  hasLegacyOnboardingProgress,
  hasSavedOnboardingProgress,
  isDefaultAppEntry,
  isMarketingPath,
  resolveOnboardingLifecycle,
} from "./onboardingAccess";

const fresh = {
  isPostLaunchUser: true,
  completed: false,
  skipped: false,
  hasSavedProgress: false,
  entered: false,
  progressUnreadable: false,
  pathname: "/",
};

describe("resolveOnboardingLifecycle", () => {
  it("distinguishes first signup, interrupted, completed, and skipped from server records", () => {
    const base = { completed: false, skipped: false, hasSavedProgress: false, entered: false };
    expect(resolveOnboardingLifecycle(base)).toBe("first_signup");
    expect(resolveOnboardingLifecycle({ ...base, entered: true })).toBe("interrupted");
    expect(resolveOnboardingLifecycle({ ...base, hasSavedProgress: true })).toBe("interrupted");
    expect(
      resolveOnboardingLifecycle({ ...base, completed: true, entered: true, hasSavedProgress: true })
    ).toBe("completed");
    expect(resolveOnboardingLifecycle({ ...base, skipped: true, entered: true })).toBe("skipped");
  });
});

describe("decideOnboardingAccess", () => {
  it("guides a first signup off the real signup landing and other default entries", () => {
    expect(PUBLIC_AUTH_DEFAULT_RETURN_TO).toBe("/research");
    expect(decideOnboardingAccess({ ...fresh, pathname: PUBLIC_AUTH_DEFAULT_RETURN_TO })).toBe(
      "guide"
    );
    expect(decideOnboardingAccess(fresh)).toBe("guide");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/dashboard" })).toBe("guide");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/plan" })).toBe("guide");
    expect(isDefaultAppEntry("/research?creator=noman_peera&start=1")).toBe(true);
    expect(
      decideOnboardingAccess({
        ...fresh,
        pathname: "/research?creator=noman_peera&start=1",
      })
    ).toBe("guide");
  });

  it("does not force a customer who already started back into onboarding", () => {
    for (const pathname of ["/", "/research", "/studio", "/dashboard", "/scripts"]) {
      expect(decideOnboardingAccess({ ...fresh, entered: true, pathname })).toBe("allow");
      expect(decideOnboardingAccess({ ...fresh, hasSavedProgress: true, pathname })).toBe("allow");
    }
  });

  it("leaves a returning customer's deep link on the product", () => {
    expect(
      decideOnboardingAccess({
        ...fresh,
        entered: true,
        pathname: "/research?creator=noman_peera&start=1",
      })
    ).toBe("allow");
    expect(
      decideOnboardingAccess({
        ...fresh,
        hasSavedProgress: true,
        pathname: "/scripts/42",
      })
    ).toBe("allow");
    expect(
      decideOnboardingAccess({ ...fresh, completed: true, pathname: "/research?jobId=9" })
    ).toBe("allow");
  });

  it("does not take a first signup off a specific feature deep link", () => {
    expect(decideOnboardingAccess({ ...fresh, pathname: "/studio" })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/scripts/42" })).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/scraping" })).toBe("allow");
    expect(isDefaultAppEntry("/studio")).toBe(false);
  });

  it("lets an interrupted customer stay on onboarding to finish setup", () => {
    expect(decideOnboardingAccess({ ...fresh, entered: true, pathname: "/onboarding" })).toBe(
      "allow"
    );
    expect(
      decideOnboardingAccess({ ...fresh, hasSavedProgress: true, pathname: "/onboarding" })
    ).toBe("allow");
    expect(decideOnboardingAccess({ ...fresh, pathname: "/onboarding" })).toBe("allow");
  });

  it("leaves completed, skipped, and pre-launch customers on the product", () => {
    expect(decideOnboardingAccess({ ...fresh, completed: true, pathname: "/research" })).toBe(
      "allow"
    );
    expect(decideOnboardingAccess({ ...fresh, skipped: true, pathname: "/" })).toBe("allow");
    expect(
      decideOnboardingAccess({ ...fresh, isPostLaunchUser: false, pathname: "/research" })
    ).toBe("allow");
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

  it("does not guide when the progress read failed", () => {
    expect(
      decideOnboardingAccess({ ...fresh, progressUnreadable: true, pathname: "/research" })
    ).toBe("allow");
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
