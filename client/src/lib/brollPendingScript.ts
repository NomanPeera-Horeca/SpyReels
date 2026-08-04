/** Session keys for public B-roll funnel → authenticated library handoff after sign-in. */
export const BROLL_PENDING_SCRIPT_KEY = "spyreels:broll_pending_script";
export const BROLL_AUTOSTART_KEY = "spyreels:broll_autostart";

export function stashBrollScriptForAfterAuth(content: string, autostart = true): void {
  const trimmed = content.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(BROLL_PENDING_SCRIPT_KEY, trimmed.slice(0, 12000));
    sessionStorage.setItem(BROLL_AUTOSTART_KEY, autostart ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function consumeBrollPendingScript(): {
  content: string | null;
  autostart: boolean;
} {
  try {
    const content = sessionStorage.getItem(BROLL_PENDING_SCRIPT_KEY)?.trim() || null;
    const autostart = sessionStorage.getItem(BROLL_AUTOSTART_KEY) === "1";
    sessionStorage.removeItem(BROLL_PENDING_SCRIPT_KEY);
    sessionStorage.removeItem(BROLL_AUTOSTART_KEY);
    return { content, autostart };
  } catch {
    return { content: null, autostart: false };
  }
}
