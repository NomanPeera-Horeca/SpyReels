import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDefaultOffFlag,
  resolveDesktopRootView,
  resolveHomeV2Flags,
  resolveOnboardingVariant,
} from "./homeV2FeatureFlags";
import { researchReturnTo } from "./researchIntent";

describe("parseDefaultOffFlag", () => {
  it("is off when unset, empty or unknown, in every environment", () => {
    for (const raw of [undefined, null, "", "  ", "false", "0", "no", "on", "enabled", "TRUEISH"]) {
      expect(parseDefaultOffFlag(raw)).toBe(false);
    }
  });

  it("is on only for explicit true values", () => {
    for (const raw of ["true", "TRUE", " 1 ", "yes", "Yes"]) {
      expect(parseDefaultOffFlag(raw)).toBe(true);
    }
  });
});

describe("resolveHomeV2Flags", () => {
  it("defaults both flags off", () => {
    expect(resolveHomeV2Flags({ homeV2Raw: undefined, onboardingV2Raw: undefined })).toEqual({
      homeV2Enabled: false,
      onboardingV2Enabled: false,
    });
  });

  it("never enables Home v2 without the new onboarding", () => {
    expect(resolveHomeV2Flags({ homeV2Raw: "true", onboardingV2Raw: undefined }).homeV2Enabled).toBe(
      false
    );
    expect(resolveHomeV2Flags({ homeV2Raw: "true", onboardingV2Raw: "false" }).homeV2Enabled).toBe(
      false
    );
  });

  it("allows the new onboarding on its own", () => {
    expect(resolveHomeV2Flags({ homeV2Raw: undefined, onboardingV2Raw: "true" })).toEqual({
      homeV2Enabled: false,
      onboardingV2Enabled: true,
    });
  });

  it("enables Home v2 only when both are on", () => {
    expect(resolveHomeV2Flags({ homeV2Raw: "1", onboardingV2Raw: "yes" }).homeV2Enabled).toBe(true);
  });
});

describe("resolveDesktopRootView", () => {
  const off = { homeV2Enabled: false, hasPendingResearchHandle: false };
  const on = { homeV2Enabled: true, hasPendingResearchHandle: false };

  it("flag off: '/' always renders research, whatever the URL", () => {
    for (const search of ["", "?foo=bar", "?creator=nike&start=1", "?platform=tiktok&jobId=5"]) {
      expect(resolveDesktopRootView({ ...off, search })).toBe("research");
      expect(resolveDesktopRootView({ ...off, search, hasPendingResearchHandle: true })).toBe(
        "research"
      );
    }
  });

  it("flag on: plain '/' renders Home v2", () => {
    expect(resolveDesktopRootView({ ...on, search: "" })).toBe("home-v2");
    expect(resolveDesktopRootView({ ...on, search: "?utm_source=email" })).toBe("home-v2");
  });

  it("flag on: saved-search hand-off links keep opening research", () => {
    const links = [
      researchReturnTo("nike"),
      researchReturnTo("@Some.Creator"),
      researchReturnTo("khaby.lame", "tiktok"),
    ];
    for (const link of links) {
      const search = link.slice(link.indexOf("?"));
      expect(resolveDesktopRootView({ ...on, search })).toBe("research");
    }
  });

  it("flag on: job deep links and platform params keep opening research", () => {
    for (const search of [
      "?platform=tiktok&jobId=42&from=history",
      "?platform=youtube&jobId=7&from=research",
      "?platform=youtube",
      "?jobId=9",
      "?creator=INVALID HANDLE!",
    ]) {
      expect(resolveDesktopRootView({ ...on, search })).toBe("research");
    }
  });

  it("flag on: a handle stashed before sign-in keeps opening research", () => {
    expect(resolveDesktopRootView({ ...on, search: "", hasPendingResearchHandle: true })).toBe(
      "research"
    );
  });
});

describe("resolveOnboardingVariant", () => {
  it("flag off keeps the current onboarding", () => {
    expect(resolveOnboardingVariant({ onboardingV2Enabled: false })).toBe("legacy");
  });
  it("flag on selects the new onboarding", () => {
    expect(resolveOnboardingVariant({ onboardingV2Enabled: true })).toBe("v2");
  });
});

describe("routing guards in App.tsx", () => {
  const app = readFileSync(path.resolve(__dirname, "../client/src/App.tsx"), "utf8");

  it("/research always renders the research page directly (never behind a flag)", () => {
    expect(app).toContain('<Route path="/research" component={Home} />');
  });

  it("mobile '/' and '/research' still redirect to /plan", () => {
    expect(app).toContain('<Route path="/" component={MobileHomeRedirect} />');
    expect(app).toContain('<Route path="/research" component={MobileHomeRedirect} />');
  });

  it("desktop '/' and '/onboarding' go through the flag switch points", () => {
    expect(app).toContain('<Route path="/" component={DesktopRootRoute} />');
    expect(app.match(/<Route path="\/onboarding" component=\{OnboardingRoute\} \/>/g)).toHaveLength(2);
  });
});

describe("Phase 1 placeholders cannot change behavior", () => {
  const pages = path.resolve(__dirname, "../client/src/pages");

  it("HomeV2 re-exports the research page until Home v2 UI ships", () => {
    expect(readFileSync(path.join(pages, "HomeV2.tsx"), "utf8")).toMatch(
      /export \{ default \} from "\.\/Home";/
    );
  });

  it("OnboardingV2 re-exports the current onboarding until the new flow ships", () => {
    expect(readFileSync(path.join(pages, "OnboardingV2.tsx"), "utf8")).toMatch(
      /export \{ default \} from "\.\/onboarding";/
    );
  });
});
