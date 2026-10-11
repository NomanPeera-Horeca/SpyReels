import { Capacitor } from "@capacitor/core";
import { appOrigin } from "@shared/spyreelsOrigins";

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
 * Web/PWA must stay relative so marketing pages on spyreels.ai hit apex
 * public APIs (blog, finder preview). VITE_APP_ORIGIN is only for native
 * Capacitor shells; applying it to the web build forces app.spyreels.ai
 * fetches that fail CORS from the apex host.
 */
export function getAppOrigin(): string {
  if (!isNativeApp()) return "";

  const fromEnv = import.meta.env.VITE_APP_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return appOrigin();
}

export function resolveAppUrl(path: string): string {
  const origin = getAppOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
