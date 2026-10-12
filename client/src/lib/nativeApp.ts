import { Capacitor } from "@capacitor/core";
import { appOrigin, SPYREELS_APP_ORIGIN_DEFAULT } from "@shared/spyreelsOrigins";

/** True when running inside a Capacitor iOS/Android shell. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when the site is installed as a PWA (Add to Home Screen). */
export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)");
  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mq.matches || iosStandalone;
}

/**
 * API/auth origin for request URL building.
 * Empty string means same-origin relative URLs.
 *
 * Host split (mature): marketing on spyreels.ai calls https://app.spyreels.ai
 * with credentialed CORS. Product pages already on app stay relative.
 * Native shells always use an absolute product origin.
 */
export function getAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_APP_ORIGIN?.trim().replace(/\/$/, "") || "";

  if (isNativeApp()) {
    return fromEnv || appOrigin();
  }

  if (typeof window === "undefined") return "";

  const here = window.location.origin.replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv === here ? "" : fromEnv;
  }

  const host = window.location.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "spyreels.ai") {
    return SPYREELS_APP_ORIGIN_DEFAULT;
  }

  return "";
}

export function resolveAppUrl(path: string): string {
  const origin = getAppOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
