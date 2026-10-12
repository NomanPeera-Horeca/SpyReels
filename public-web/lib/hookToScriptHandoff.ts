import {
  HOOK_TO_SCRIPT_PENDING_KEY,
  type HookToScriptPending,
} from "../../shared/hookGenerator";

/** Query key for cross-origin handoff to the app SPA Aha screen. */
export const HOOK_TO_SCRIPT_HANDOFF_QUERY = "hts";

function isPending(value: unknown): value is HookToScriptPending {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.hook === "string" &&
    typeof p.onScreenText === "string" &&
    typeof p.reelContent === "string" &&
    typeof p.hookIndex === "number"
  );
}

export function encodeHookToScriptHandoff(pending: HookToScriptPending): string {
  const json = JSON.stringify(pending);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeHookToScriptHandoff(
  encoded: string | null | undefined
): HookToScriptPending | null {
  if (!encoded) return null;
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    return isPending(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function stashHookToScriptPending(pending: HookToScriptPending): void {
  try {
    sessionStorage.setItem(HOOK_TO_SCRIPT_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Ignore quota / private mode.
  }
}

export function peekHookToScriptPending(): HookToScriptPending | null {
  try {
    const raw = sessionStorage.getItem(HOOK_TO_SCRIPT_PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPending(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearHookToScriptPending(): void {
  try {
    sessionStorage.removeItem(HOOK_TO_SCRIPT_PENDING_KEY);
  } catch {
    // Ignore.
  }
}

/** Path for auth returnTo / app navigation, including encoded pending payload. */
export function hookToScriptReturnPath(pending: HookToScriptPending): string {
  const encoded = encodeHookToScriptHandoff(pending);
  return `/free-tools/viral-hooks?${HOOK_TO_SCRIPT_HANDOFF_QUERY}=${encodeURIComponent(encoded)}`;
}
