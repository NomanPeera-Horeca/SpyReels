import { SPYREELS_SITE_ORIGIN } from "@shared/spyreelsOrigins";

/** Marketing homepage origin (apex). Override with VITE_SITE_ORIGIN if needed. */
export function getMarketingOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return SPYREELS_SITE_ORIGIN;
}

export function getMarketingHomeUrl(): string {
  return `${getMarketingOrigin()}/`;
}

/** Product host should not show the retired Vite marketing shell. */
export function isProductAppHost(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .replace(/^www\./, "")
    .toLowerCase();
  return host === "app.spyreels.ai";
}

/** Send signed-out users on the app host to the live Next homepage. */
export function redirectSignedOutToMarketing(): boolean {
  if (typeof window === "undefined") return false;
  if (!isProductAppHost(window.location.hostname)) return false;
  window.location.replace(getMarketingHomeUrl());
  return true;
}
