/** Session keys for landing → Research handle handoff after sign-in. */
export const RESEARCH_PENDING_HANDLE_KEY = "spyreels:research_pending_handle";
export const RESEARCH_AUTOSTART_KEY = "spyreels:research_autostart";

export function stashResearchHandleForAfterAuth(handle: string, autostart = true): void {
  const cleaned = handle.replace(/^@/, "").trim().toLowerCase();
  if (!cleaned) return;
  try {
    sessionStorage.setItem(RESEARCH_PENDING_HANDLE_KEY, cleaned);
    sessionStorage.setItem(RESEARCH_AUTOSTART_KEY, autostart ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function consumeResearchPendingHandle(): {
  handle: string | null;
  autostart: boolean;
} {
  try {
    const handle = sessionStorage.getItem(RESEARCH_PENDING_HANDLE_KEY)?.trim() || null;
    const autostart = sessionStorage.getItem(RESEARCH_AUTOSTART_KEY) === "1";
    sessionStorage.removeItem(RESEARCH_PENDING_HANDLE_KEY);
    sessionStorage.removeItem(RESEARCH_AUTOSTART_KEY);
    return { handle, autostart };
  } catch {
    return { handle: null, autostart: false };
  }
}
