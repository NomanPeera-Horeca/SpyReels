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

/** API/auth origin for bundled native builds. Empty string means same-origin relative URLs. */
export function getAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_APP_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (isNativeApp()) return appOrigin();
  return "";
}

export function resolveAppUrl(path: string): string {
  const origin = getAppOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
