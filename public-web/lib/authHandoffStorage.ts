import {
  AUTH_RETURN_TO_STORAGE_KEY,
  parseResearchIntent,
  type ResearchIntentPlatform,
} from "../../shared/researchIntent";

export function stashAuthReturnTo(returnTo: string): void {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return;
  try {
    sessionStorage.setItem(AUTH_RETURN_TO_STORAGE_KEY, returnTo);
  } catch {
    /* ignore */
  }
}

export function readStashedAuthReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(AUTH_RETURN_TO_STORAGE_KEY)?.trim() || null;
    if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
    return value;
  } catch {
    return null;
  }
}

export function creatorContextFromReturnTo(returnTo: string | null | undefined): {
  handle: string | null;
  platform: ResearchIntentPlatform | null;
} {
  if (!returnTo) return { handle: null, platform: null };
  const qIndex = returnTo.indexOf("?");
  const search = qIndex >= 0 ? returnTo.slice(qIndex) : "";
  const intent = parseResearchIntent(search);
  if (!intent) return { handle: null, platform: null };
  return { handle: intent.handle, platform: intent.platform };
}
