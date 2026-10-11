export type SignupCreatorPlatform = "instagram" | "tiktok" | "youtube";

const AUTH_RETURN_TO_STORAGE_KEY = "spyreels:auth_return_to";

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
  platform: SignupCreatorPlatform | null;
} {
  if (!returnTo) return { handle: null, platform: null };
  const qIndex = returnTo.indexOf("?");
  const search = qIndex >= 0 ? returnTo.slice(qIndex + 1) : "";
  const params = new URLSearchParams(search);
  const handle = (params.get("creator") ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return { handle: null, platform: null };

  const platformRaw = params.get("platform");
  const platform: SignupCreatorPlatform =
    platformRaw === "tiktok" ? "tiktok" : platformRaw === "youtube" ? "youtube" : "instagram";

  const valid =
    platform === "tiktok"
      ? /^[a-z0-9._]{2,24}$/.test(handle)
      : platform === "youtube"
        ? /^[a-z0-9._-]{1,100}$/i.test(handle)
        : /^[a-z0-9._]{1,30}$/.test(handle);
  if (!valid) return { handle: null, platform: null };
  return { handle, platform };
}

export function signupHeadlineForCreator(
  handle: string | null | undefined,
  platform: SignupCreatorPlatform | null | undefined
): string {
  const cleaned = handle?.replace(/^@+/, "").trim();
  if (!cleaned) return "Create your free account";
  if (platform === "tiktok") {
    return `Create your free account to remake @${cleaned}'s best TikTok`;
  }
  if (platform === "youtube") {
    return `Create your free account to remake @${cleaned}'s best Short`;
  }
  return `Create your free account to remake @${cleaned}'s best Reel`;
}
