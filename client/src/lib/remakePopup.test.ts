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
    expect(loadRemakeDraft("library:1")).toMatchObject({ mode: "custom", angle: "restaurant menus" });
    expect(loadRemakeDraft("library:2")).toMatchObject({ mode: "same_topic", angle: "other" });
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

describe("own-winner popup choices", () => {
  it("opens on the recommended format, or Refresh when every format was used", async () => {
    const { ownWinnerDefaultDraft } = await import("./remakeIntent");
    const base = { multiple: 3.2, caption: "x", formats: [{ id: "mistake", pitch: "p" }], usedFormats: [] };
    expect(ownWinnerDefaultDraft({ ...base, recommendedFormatId: "mistake" })).toMatchObject({ mode: "prism", formatId: "mistake" });
    expect(ownWinnerDefaultDraft({ ...base, recommendedFormatId: null })).toMatchObject({ mode: "refresh" });
  });

  it("maps to the typed request", async () => {
    const { draftToIntent, remakeIntentToRequest, remakeIntentToTopic } = await import("./remakeIntent");
    const prism = draftToIntent({ mode: "prism", angle: "", formatId: "myth" })!;
    expect(remakeIntentToRequest(prism)).toEqual({ choice: "prism_format", prismFormat: "myth" });
    expect(remakeIntentToTopic(prism)).toBe("SAME_TOPIC");
    expect(remakeIntentToRequest(draftToIntent({ mode: "refresh", angle: "" })!)).toEqual({ choice: "refresh_original" });
    expect(draftToIntent({ mode: "own_idea", angle: " " })).toBeNull();
    expect(remakeIntentToRequest(draftToIntent({ mode: "own_idea", angle: "cafes" })!)).toEqual({ choice: "own_idea", idea: "cafes" });
  });

  it("the popup shows the own-winner copy and Change format from Figma", () => {
    const dialog = read("../components/RemakeIntentDialog.tsx");
    for (const text of [
      "How do you want to remake your winner?",
      "Refresh the original",
      "Keep the format. Update the hook, examples, and wording.",
      "Formats that suit this video",
      "Already used on this idea",
      "Change format",
    ]) {
      expect(dialog).toContain(text);
    }
  });
});

describe("errors before Create remake stay hidden", () => {
  it("a background failure while choosing does not show the error state", () => {
    const hook = read("../hooks/useLibraryRemakeChain.ts");
    const i = hook.indexOf('if (intentPromptRef.current.phase === "choose") {');
    expect(i).toBeGreaterThan(-1);
    const branch = hook.slice(i, hook.indexOf("return;", i));
    expect(branch).not.toContain('phase: "error"');
    expect(branch).not.toContain("toast");
  });
});
