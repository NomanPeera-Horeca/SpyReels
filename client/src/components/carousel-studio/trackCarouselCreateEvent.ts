import posthog from "posthog-js";
import type {
  CarouselCreateEventName,
  CarouselCreateEventProps,
} from "@shared/carouselCreateAnalytics";

/** Capture a carousel create event. No-ops if PostHog is unavailable. */
export function trackCarouselCreateEvent(
  event: CarouselCreateEventName,
  props?: CarouselCreateEventProps
): void {
  try {
    if (typeof posthog?.capture !== "function") return;
    posthog.capture(event, props);
  } catch {
    /* analytics must never break create */
  }
}
