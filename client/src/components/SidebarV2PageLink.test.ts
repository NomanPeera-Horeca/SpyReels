import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClipboardPaste } from "lucide-react";
import { Router } from "wouter";

let sidebar: "legacy" | "v2" = "legacy";
vi.mock("@/lib/experienceAccess", () => ({
  useExperienceAccess: () => ({ ready: true, access: { onboarding: "v2", home: "v2", sidebar, research: "legacy", saved: "legacy", exploreLibrary: false, internal: false }, retry: () => {} }),
}));

import { SidebarV2PageLink } from "./SidebarV2PageLink";

// The test runner compiles JSX to React.createElement (classic runtime).
(globalThis as { React?: typeof React }).React = React;

const html = () =>
  renderToStaticMarkup(
    createElement(Router, { ssrPath: "/scripts" }, createElement(SidebarV2PageLink, { href: "/paste", label: "Paste a script", icon: ClipboardPaste, testId: "x" }))
  );

describe("SidebarV2PageLink", () => {
  it("is hidden for users on today's sidebar (the page is still in their menu)", () => {
    sidebar = "legacy";
    expect(html()).toBe("");
  });

  it("links to the page for users on the new sidebar", () => {
    sidebar = "v2";
    const out = html();
    expect(out).toContain('href="/paste"');
    expect(out).toContain("Paste a script");
  });
});
