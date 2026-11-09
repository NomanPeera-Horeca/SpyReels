import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GoalOption } from "@/design-system/GoalOption";
import {
  DEFAULT_REMAKE_DRAFT,
  draftToIntent,
  loadRemakeDraft,
  saveRemakeDraft,
} from "./remakeIntent";

// The test runner compiles TSX with the classic runtime (React.createElement).
(globalThis as { React?: typeof React }).React = React;

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("Card / Goal Option", () => {
  it("onboarding use (no badge, no content) is still one radio button", () => {
    const html = renderToStaticMarkup(
      createElement(GoalOption, { title: "Grow", description: "More views", selected: true })
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain("<div");
  });

  it("extended card shows the badge, and its content only while selected", () => {
    const content = createElement("input", { "data-x": "idea" });
    const on = renderToStaticMarkup(
      createElement(GoalOption, { title: "Use my idea", badge: "Recommended", content, selected: true })
    );
    const off = renderToStaticMarkup(
      createElement(GoalOption, { title: "Use my idea", badge: "Recommended", content, selected: false })
    );
    expect(on).toContain("Recommended");
    expect(on).toContain('data-x="idea"');
    expect(off).toContain("Recommended");
    expect(off).not.toContain('data-x="idea"');
    // The input sits next to the radio button, never inside it.
    expect(on).toMatch(/<\/button><div[^>]*><input/);
  });
});

describe("Remake popup draft (kept per video)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("external videos open on Use my idea with an empty idea", () => {
    expect(DEFAULT_REMAKE_DRAFT).toEqual({ mode: "custom", angle: "" });
  });

  it("Create remake needs an idea only for Use my idea", () => {
    expect(draftToIntent({ mode: "custom", angle: "   " })).toBeNull();
    expect(draftToIntent({ mode: "custom", angle: " menus " })).toEqual({ mode: "custom", angle: "menus" });
    expect(draftToIntent({ mode: "same_topic", angle: "" })).toEqual({ mode: "same_topic" });
    expect(draftToIntent({ mode: "niche", angle: "kept" })).toEqual({ mode: "niche" });
  });

  it("each video keeps its own choice and idea", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    saveRemakeDraft("library:1", { mode: "custom", angle: "restaurant menus" });
    saveRemakeDraft("library:2", { mode: "same_topic", angle: "other" });
    expect(loadRemakeDraft("library:1")).toEqual({ mode: "custom", angle: "restaurant menus" });
    expect(loadRemakeDraft("library:2")).toEqual({ mode: "same_topic", angle: "other" });
    expect(loadRemakeDraft("library:3")).toEqual(DEFAULT_REMAKE_DRAFT);
  });

  it("blocked storage falls back to the default", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => saveRemakeDraft("k", { mode: "niche", angle: "" })).not.toThrow();
    expect(loadRemakeDraft("k")).toEqual(DEFAULT_REMAKE_DRAFT);
  });
});

describe("Remake popup flow (generating and error stay in the popup)", () => {
  const hook = read("../hooks/useLibraryRemakeChain.ts");
  const dialog = read("../components/RemakeIntentDialog.tsx");

  it("Create remake keeps the popup open as 'Creating your remake…'", () => {
    const submit = hook.slice(hook.indexOf("const submitRemakeIntent"), hook.indexOf("const cancelRemakeIntent"));
    expect(submit).toContain('phase: "generating"');
    expect(submit).not.toContain("openWorkspaceForSource");
    expect(dialog).toContain("Creating your remake…");
  });

  it("an error shows in the popup with Try again, keeping choice and idea", () => {
    expect(hook).toContain('phase: "error", errorMessage: message');
    expect(dialog).toContain("We couldn't create this remake.");
    expect(dialog).toContain("Your choice and idea are kept. Try again.");
  });

  it("closing while generating finishes in the background", () => {
    const cancel = hook.slice(hook.indexOf("const cancelRemakeIntent"), hook.indexOf("const getDraft"));
    const generatingBranch = cancel.slice(cancel.indexOf('prompt.phase === "generating"'), cancel.indexOf('prompt.phase === "error"'));
    expect(generatingBranch).not.toContain("cancelledRef");
    expect(hook).toContain("Your remake is ready");
  });

  it("the popup is built from the design system, with no 'kept' helper text", () => {
    expect(dialog).toContain('from "@/design-system/GoalOption"');
    expect(dialog).toContain("FieldInput");
    expect(dialog).toContain("IconClose");
    expect(dialog).not.toMatch(/kept if you switch/i);
    expect(dialog).not.toContain("Suggested:");
  });
});
