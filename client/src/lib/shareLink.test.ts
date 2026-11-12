import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { canUseNativeShare, copyLink, shareNatively, shareTargetHref } from "./shareLink";

(globalThis as unknown as { React: typeof React }).React = React;

const payload = { url: "https://www.tiktok.com/@chef/video/123?x=1&y=2", title: "Good food won't save a badly run restaurant" };

describe("share links", () => {
  it("WhatsApp, Email and Text message carry the title and the original link, encoded", () => {
    const wa = shareTargetHref("whatsapp", payload);
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(wa.slice("https://wa.me/?text=".length))).toBe(`${payload.title}\n${payload.url}`);
    const mail = shareTargetHref("email", payload);
    expect(mail).toContain(`subject=${encodeURIComponent(payload.title)}`);
    expect(mail).toContain(encodeURIComponent(payload.url));
    const sms = shareTargetHref("sms", payload);
    expect(sms.startsWith("sms:?&body=")).toBe(true);
    expect(decodeURIComponent(sms.slice("sms:?&body=".length))).toContain(payload.url);
  });

  it("uses the device share sheet only when the browser has one", async () => {
    expect(canUseNativeShare({})).toBe(false);
    const share = vi.fn(async () => {});
    expect(await shareNatively(payload, { share })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: payload.title, url: payload.url });
    expect(await shareNatively(payload, {})).toBe("unavailable");
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    expect(await shareNatively(payload, { share: async () => { throw abort; } })).toBe("cancelled");
    expect(await shareNatively(payload, { share: async () => { throw new Error("NotAllowed"); } })).toBe("unavailable");
  });

  it("copies the link, and reports when the browser refuses", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyLink(payload.url, { clipboard: { writeText } as unknown as Clipboard })).toBe(true);
    expect(writeText).toHaveBeenCalledWith(payload.url);
    expect(await copyLink(payload.url, {})).toBe(false);
    const refuse = { clipboard: { writeText: async () => { throw new Error("denied"); } } as unknown as Clipboard };
    expect(await copyLink(payload.url, refuse)).toBe(false);
  });
});

describe("Result Card creator link", () => {
  const props = {
    platform: "tiktok" as const,
    platformLabel: "TikTok",
    thumbnailUrl: null,
    title: "A video",
    creator: "@chefdaddy_",
    metrics: [],
    labels: { play: "Play", expand: "Expand", remake: "Remake", save: "Save", saved: "Saved", more: "More" },
    onPlay: () => {},
    onRemake: () => {},
    saved: false,
    menu: [],
  };

  it("is a link with the approved tooltip when the creator can be opened, plain text otherwise", async () => {
    const { ResultCard } = await import("@/design-system/ResultCard");
    const linked = renderToStaticMarkup(React.createElement(ResultCard, { ...props, onOpenCreator: () => {} }));
    expect(linked).toContain('data-testid="result-card-creator-link"');
    expect(linked).toContain("See this creator&#x27;s top videos");
    const plain = renderToStaticMarkup(React.createElement(ResultCard, props));
    expect(plain).not.toContain("result-card-creator-link");
    expect(plain).toContain("@chefdaddy_");
  });
});
