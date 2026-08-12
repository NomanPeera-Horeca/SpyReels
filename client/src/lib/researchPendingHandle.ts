/** Session keys for landing → Research handle handoff after sign-in. */
export const RESEARCH_PENDING_HANDLE_KEY = "spyreels:research_pending_handle";
export const RESEARCH_AUTOSTART_KEY = "spyreels:research_autostart";
export const RESEARCH_PENDING_PLATFORM_KEY = "spyreels:research_pending_platform";

export type ResearchPendingPlatform = "instagram" | "tiktok" | "youtube";

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
