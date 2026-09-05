export type PublicWebEvent =
  | "viral_finder_profile_searched"
  | "viral_finder_demo_handle_selected"
  | "viral_finder_reel_selected"
  | "viral_finder_sort_changed"
  | "viral_finder_research_cta_clicked"
  | "viral_finder_app_handoff";

export function trackPublicWeb(
  event: PublicWebEvent,
  properties: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim()) return;

  void import("posthog-js").then(({ default: posthog }) => {
    if (typeof posthog.capture !== "function") return;
    posthog.capture(event, {
      ...properties,
      public_web_renderer: "next",
      public_web_path: window.location.pathname,
    });
  });
}
