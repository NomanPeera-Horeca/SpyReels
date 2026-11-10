import {
  isValidInstagramHandleNormalized,
  isValidTikTokHandleNormalized,
  isValidYouTubeHandleNormalized,
  normalizeInstagramHandle,
  normalizeTikTokHandle,
  normalizeYouTubeHandle,
} from "./socialHandles";

export type ResearchIntentPlatform = "instagram" | "tiktok" | "youtube";

function normalizeResearchHandle(handle: string, platform: ResearchIntentPlatform): string {
  if (platform === "tiktok") return normalizeTikTokHandle(handle);
  if (platform === "youtube") return normalizeYouTubeHandle(handle);
  return normalizeInstagramHandle(handle);
}

function validResearchHandle(handle: string, platform: ResearchIntentPlatform): boolean {
  if (platform === "tiktok") return isValidTikTokHandleNormalized(handle);
  if (platform === "youtube") return isValidYouTubeHandleNormalized(handle);
  return isValidInstagramHandleNormalized(handle);
}

/**
 * Link that opens Research for one creator and starts it (which adds the
 * creator to Creator Radar). Used by the public site and Home's creator list.
 */
export function researchReturnTo(handle: string, platform: ResearchIntentPlatform = "instagram"): string {
  const normalized = normalizeResearchHandle(handle, platform);
  if (!validResearchHandle(normalized, platform)) {
    throw new Error("Invalid creator username");
  }
  const platformParam = platform === "instagram" ? "" : `platform=${platform}&`;
  return `/research?${platformParam}creator=${encodeURIComponent(normalized)}&start=1`;
}

export function parseResearchIntent(
  search: string
): { handle: string; autostart: boolean; platform: ResearchIntentPlatform } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("platform");
  const platform: ResearchIntentPlatform = raw === "tiktok" || raw === "youtube" ? raw : "instagram";
  const handle = normalizeResearchHandle(params.get("creator") ?? "", platform);
  if (!validResearchHandle(handle, platform)) return null;
  return { handle, autostart: params.get("start") === "1", platform };
}
