const STORAGE_KEY = "spyreels_utm_v1";

export type StoredUtms = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
};

function readParamsFromSearch(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
}

/** Persist first-touch UTMs from the current URL into sessionStorage. */
export function captureUtmsFromLocation(): void {
  if (typeof window === "undefined") return;
  const params = readParamsFromSearch(window.location.search);
  const next: StoredUtms = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ] as const) {
    const v = params.get(key)?.trim();
    if (v) next[key] = v;
  }
  if (Object.keys(next).length === 0) return;

  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY);
    const existing: StoredUtms = existingRaw ? JSON.parse(existingRaw) : {};
    const merged = { ...next, ...existing };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore quota / private mode
  }
}

export function readStoredUtms(): StoredUtms {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredUtms;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

/** Payload embedded in Google OAuth `state` (base64 JSON). */
export type GoogleOAuthStatePayload = {
  v: 1;
  utm: StoredUtms;
  returnTo: string | null;
  firstReferrer?: string | null;
};

export function encodeGoogleOAuthState(payload: GoogleOAuthStatePayload): string {
  const json = JSON.stringify(payload);
  if (typeof window === "undefined") {
    return Buffer.from(json, "utf8").toString("base64");
  }
  return btoa(json);
}

export function buildGoogleAuthUrlWithAttribution(
  basePath = "/api/auth/google",
  opts?: { returnTo?: string }
): string {
  const payload: GoogleOAuthStatePayload = {
    v: 1,
    utm: readStoredUtms(),
    returnTo: opts?.returnTo && opts.returnTo.startsWith("/") ? opts.returnTo : null,
    firstReferrer:
      typeof document !== "undefined" && document.referrer
        ? document.referrer
        : null,
  };
  const state = encodeGoogleOAuthState(payload);
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}state=${encodeURIComponent(state)}`;
}

export function signupAttributionBody(): {
  attribution: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;
    firstReferrer: string | null;
  };
} {
  const utm = readStoredUtms();
  return {
    attribution: {
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmTerm: utm.utm_term ?? null,
      utmContent: utm.utm_content ?? null,
      firstReferrer:
        typeof document !== "undefined" && document.referrer
          ? document.referrer
          : null,
    },
  };
}
