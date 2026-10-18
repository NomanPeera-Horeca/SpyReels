import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveDesktopRootView,
  resolveOnboardingVariant,
} from "./homeV2FeatureFlags";
import { researchReturnTo } from "./researchIntent";

describe("resolveDesktopRootView", () => {
  const off = { homeV2Enabled: false, hasPendingResearchHandle: false };
  const on = { homeV2Enabled: true, hasPendingResearchHandle: false };

  it("flag off: '/' always renders research, whatever the URL", () => {
    for (const search of [
      "",
      "?foo=bar",
      "?creator=nike&start=1",
      "?platform=tiktok&jobId=5",
    ]) {
      expect(resolveDesktopRootView({ ...off, search })).toBe("research");
      expect(
        resolveDesktopRootView({
          ...off,
          search,
          hasPendingResearchHandle: true,
        })
      ).toBe("research");
    }
  });

  it("flag on: plain '/' renders Home v2", () => {
    expect(resolveDesktopRootView({ ...on, search: "" })).toBe("home-v2");
    expect(resolveDesktopRootView({ ...on, search: "?utm_source=email" })).toBe(
      "home-v2"
    );
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
    expect(
      resolveDesktopRootView({
        ...on,
        search: "",
        hasPendingResearchHandle: true,
      })
    ).toBe("research");
  });
});

describe("resolveOnboardingVariant", () => {
  it("flag off keeps the current onboarding", () => {
    expect(resolveOnboardingVariant({ onboardingV2Enabled: false })).toBe(
      "legacy"
    );
  });
  it("flag on selects the new onboarding", () => {
    expect(resolveOnboardingVariant({ onboardingV2Enabled: true })).toBe("v2");
  });
});

describe("routing guards in App.tsx", () => {
  const app = readFileSync(
    path.resolve(__dirname, "../client/src/App.tsx"),
    "utf8"
  );

  it("/research always renders the research page directly (never behind a flag)", () => {
    expect(app).toContain('<Route path="/research" component={Home} />');
  });

  it("mobile '/' is Home v2 for Home v2 users, Today otherwise; '/research' redirects by flag", () => {
    expect(app).toContain('<Route path="/" component={MobileRootRoute} />');
    expect(app).toContain(
      '<Route path="/research" component={MobileHomeRedirect} />'
    );
  });

  it("desktop '/' and '/onboarding' go through the flag switch points", () => {
    expect(app).toContain('<Route path="/" component={DesktopRootRoute} />');
    expect(
      app.match(/<Route path="\/onboarding" component=\{OnboardingRoute\} \/>/g)
    ).toHaveLength(2);
  });
});

describe("Phase 1 placeholders cannot change behavior", () => {
  const pages = path.resolve(__dirname, "../client/src/pages");

  it("HomeV2 page renders the Home v2 implementation", () => {
    expect(readFileSync(path.join(pages, "HomeV2.tsx"), "utf8")).toMatch(
      /export \{ default \} from "@\/components\/home-v2\/HomeV2Page";/
    );
  });

  it("OnboardingV2 page renders the Onboarding v2 implementation", () => {
    expect(readFileSync(path.join(pages, "OnboardingV2.tsx"), "utf8")).toMatch(
      /export \{ default \} from "@\/components\/onboarding-v2\/OnboardingV2Flow";/
    );
  });
});
