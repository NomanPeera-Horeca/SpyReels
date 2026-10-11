export type PublicWebEvent =
  | "viral_finder_profile_searched"
  | "viral_finder_demo_handle_selected"
  | "viral_finder_reel_selected"
  | "viral_finder_sort_changed"
  | "viral_finder_research_cta_clicked"
  | "viral_finder_app_handoff"
  | "cta_clicked"
  | "auth_dialog_opened"
  | "auth_dialog_dismissed";

export type CtaPlacement = "hero" | "search" | "final_cta" | "header";

export type AuthDialogDismissReason = "x" | "backdrop" | "esc";

type PostHogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
};

let posthogModule: PostHogLike | null = null;
let posthogLoad: Promise<PostHogLike | null> | null = null;

function loadPostHog(): Promise<PostHogLike | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim()) return Promise.resolve(null);
  if (posthogModule) return Promise.resolve(posthogModule);
  if (!posthogLoad) {
    posthogLoad = import("posthog-js")
      .then(({ default: posthog }) => {
        if (typeof posthog.capture !== "function") return null;
        posthogModule = posthog;
        return posthog;
      })
      .catch(() => null);
  }
  return posthogLoad;
}

/** Prefetch posthog-js so CTA clicks can capture before navigation. */
export function warmPublicWebAnalytics(): void {
  void loadPostHog();
}

/** Bind the already-initialized PostHog client from PublicAnalytics. */
export function bindPublicWebPostHog(client: PostHogLike): void {
  posthogModule = client;
}

export function trackPublicWeb(
  event: PublicWebEvent,
  properties: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim()) return;

  const payload = {
    ...properties,
    public_web_renderer: "next" as const,
    public_web_path: window.location.pathname,
  };

  if (posthogModule) {
    posthogModule.capture(event, payload);
    return;
  }

  void loadPostHog().then((posthog) => {
    posthog?.capture(event, payload);
  });
}

export function trackCtaClicked(
  placement: CtaPlacement,
  properties: Record<string, unknown> = {}
): void {
  trackPublicWeb("cta_clicked", { placement, ...properties });
}

export function placementFromMarketingButton(
  kind: string | null | undefined
): CtaPlacement | null {
  if (kind === "hero") return "hero";
  if (kind === "final-cta") return "final_cta";
  if (kind === "finder-search") return "search";
  return null;
}
