/** Event names and props for Carousel create / loading. No PostHog import. */

export const CAROUSEL_CREATE_EVENT = {
  submit: "carousel_create_submit",
  launch: "carousel_create_launch",
  launchDeduped: "carousel_create_launch_deduped",
  generateStarted: "carousel_create_generate_started",
  remakeBound: "carousel_create_remake_bound",
  resumed: "carousel_create_resumed",
  cancelled: "carousel_create_cancelled",
  failed: "carousel_create_failed",
  editorOpened: "carousel_create_editor_opened",
  stageChanged: "carousel_create_stage_changed",
} as const;

export type CarouselCreateEventName =
  (typeof CAROUSEL_CREATE_EVENT)[keyof typeof CAROUSEL_CREATE_EVENT];

export type CarouselCreateEventProps = {
  source_kind?: string;
  remake_id?: number | null;
  launch_id?: string | null;
  surface?: "hub" | "studio";
  reason?: string;
  step_id?: string;
  error_code?: string;
};
