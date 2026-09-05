"use client";

import { useEffect } from "react";

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
      posthog.capture("$pageview", {
        public_web_renderer: "next",
        public_web_path: window.location.pathname,
      });
    });
  }, []);

  return null;
}
