/** Session keys for landing → Research handle handoff after sign-in. */
export const RESEARCH_PENDING_HANDLE_KEY = "spyreels:research_pending_handle";
export const RESEARCH_AUTOSTART_KEY = "spyreels:research_autostart";
export const RESEARCH_PENDING_PLATFORM_KEY = "spyreels:research_pending_platform";

export type ResearchPendingPlatform = "instagram" | "tiktok" | "youtube";

export function safeAuthReturnTo(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  return trimmed;
}

export function parseLandingAuthQuery(search: string): {
  auth: "login" | "signup" | null;
  returnTo?: string;
  researchHandle?: string;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const authRaw = params.get("auth");
  const auth = authRaw === "login" || authRaw === "signup" ? authRaw : null;
  const handle = params.get("researchHandle")?.trim().replace(/^@+/, "").toLowerCase() ?? "";
  return {
    auth,
    returnTo: safeAuthReturnTo(params.get("returnTo")),
    researchHandle: handle && /^[a-z0-9._]{1,30}$/i.test(handle) ? handle : undefined,
  };
}

export function applyLandingAuthHandoff(search: string): ReturnType<typeof parseLandingAuthQuery> {
  const parsed = parseLandingAuthQuery(search);
  if (parsed.researchHandle) {
    stashResearchHandleForAfterAuth(parsed.researchHandle, true, "instagram");
  }
  return parsed;
}

export function stashResearchHandleForAfterAuth(
  handle: string,
  autostart = true,
  platform: ResearchPendingPlatform = "instagram"
): void {
  const cleaned = handle.replace(/^@/, "").trim().toLowerCase();
  if (!cleaned) return;
  try {
    sessionStorage.setItem(RESEARCH_PENDING_HANDLE_KEY, cleaned);
    sessionStorage.setItem(RESEARCH_AUTOSTART_KEY, autostart ? "1" : "0");
    sessionStorage.setItem(RESEARCH_PENDING_PLATFORM_KEY, platform);
  } catch {
    /* ignore */
  }
}

export function consumeResearchPendingHandle(): {
  handle: string | null;
  autostart: boolean;
  platform: ResearchPendingPlatform;
} {
  try {
    const handle = sessionStorage.getItem(RESEARCH_PENDING_HANDLE_KEY)?.trim() || null;
    const autostart = sessionStorage.getItem(RESEARCH_AUTOSTART_KEY) === "1";
    const platformRaw = sessionStorage.getItem(RESEARCH_PENDING_PLATFORM_KEY);
    const platform: ResearchPendingPlatform =
      platformRaw === "tiktok" || platformRaw === "youtube" || platformRaw === "instagram"
        ? platformRaw
        : "instagram";
    sessionStorage.removeItem(RESEARCH_PENDING_HANDLE_KEY);
    sessionStorage.removeItem(RESEARCH_AUTOSTART_KEY);
    sessionStorage.removeItem(RESEARCH_PENDING_PLATFORM_KEY);
    return { handle, autostart, platform };
  } catch {
    return { handle: null, autostart: false, platform: "instagram" };
  }
}
