"use client";

import { useEffect } from "react";
import {
  bindPublicWebPostHog,
  placementFromMarketingButton,
  trackCtaClicked,
  warmPublicWebAnalytics,
} from "../lib/trackPublicWeb";

function bindMarketingCtaClicks(): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const dark = target.closest<HTMLElement>("[data-marketing-dark-button='start-free']");
    if (dark) {
      trackCtaClicked("header", { label: "Start free" });
      return;
    }

    const primary = target.closest<HTMLElement>("[data-marketing-primary-button]");
    if (!primary) return;
    const kind = primary.getAttribute("data-marketing-primary-button");
    // finder-search submits the demo form; signup handoff fires cta_clicked separately.
    if (kind === "finder-search") return;
    const placement = placementFromMarketingButton(kind);
    if (!placement) return;
    trackCtaClicked(placement, { button_kind: kind });
  };

  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

export default function PublicAnalytics() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim();
    if (!token) return;

    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

    void import("posthog-js").then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: host,
        defaults: "2026-01-30",
        capture_exceptions: true,
        capture_pageview: false,
      });
      bindPublicWebPostHog(posthog);
      warmPublicWebAnalytics();
      posthog.capture("$pageview", {
        public_web_renderer: "next",
        public_web_path: window.location.pathname,
      });
    });

    return bindMarketingCtaClicks();
  }, []);

  return null;
}
