export type ResearchIntentPlatform = "instagram" | "tiktok" | "youtube";

/** Stable public-to-product handoff for a selected creator. */
export function researchReturnTo(
  handle: string,
  platform: "instagram" | "tiktok" = "instagram"
): string {
  const normalized = handle.trim().replace(/^@+/, "").toLowerCase();
  const valid =
    platform === "tiktok"
      ? /^[a-z0-9._]{2,24}$/.test(normalized)
      : /^[a-z0-9._]{1,30}$/.test(normalized);
  if (!valid) {
    throw new Error("Invalid creator username");
  }
  return `/research?${platform === "tiktok" ? "platform=tiktok&" : ""}creator=${encodeURIComponent(normalized)}&start=1`;
}

function isValidHandle(handle: string, platform: ResearchIntentPlatform): boolean {
  if (platform === "tiktok") return /^[a-z0-9._]{2,24}$/.test(handle);
  if (platform === "youtube") return /^[a-z0-9._-]{1,100}$/i.test(handle);
  return /^[a-z0-9._]{1,30}$/.test(handle);
}

export function parseResearchIntent(search: string): {
  handle: string;
  autostart: boolean;
  platform: ResearchIntentPlatform;
} | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const handle = (params.get("creator") ?? "").trim().toLowerCase();
  const platformRaw = params.get("platform");
  const platform: ResearchIntentPlatform =
    platformRaw === "tiktok" ? "tiktok" : platformRaw === "youtube" ? "youtube" : "instagram";
  if (!isValidHandle(handle, platform)) return null;
  return { handle, autostart: params.get("start") === "1", platform };
}

/** Session flag: finish first research result before forcing /onboarding. */
export const DEFER_ONBOARDING_FOR_RESEARCH_KEY = "spyreels:defer_onboarding_for_research";

export const AUTH_RETURN_TO_STORAGE_KEY = "spyreels:auth_return_to";

export function signupHeadlineForCreator(
  handle: string | null | undefined,
  platform: ResearchIntentPlatform | null | undefined
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
