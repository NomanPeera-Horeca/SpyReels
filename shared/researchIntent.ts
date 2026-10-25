import {
  isValidInstagramHandleNormalized,
  isValidTikTokHandleNormalized,
  normalizeInstagramHandle,
  normalizeTikTokHandle,
} from "./socialHandles";

function validResearchHandle(handle: string, platform: "instagram" | "tiktok"): boolean {
  return platform === "tiktok"
    ? isValidTikTokHandleNormalized(handle)
    : isValidInstagramHandleNormalized(handle);
}

/** Stable public-to-product handoff for a selected Instagram creator. */
export function researchReturnTo(handle: string, platform: "instagram" | "tiktok" = "instagram"): string {
  const normalized = platform === "tiktok" ? normalizeTikTokHandle(handle) : normalizeInstagramHandle(handle);
  if (!validResearchHandle(normalized, platform)) {
    throw new Error("Invalid creator username");
  }
  return `/research?${platform === "tiktok" ? "platform=tiktok&" : ""}creator=${encodeURIComponent(normalized)}&start=1`;
}

export function parseResearchIntent(search: string): { handle: string; autostart: boolean; platform: "instagram" | "tiktok" } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const platform = params.get("platform") === "tiktok" ? "tiktok" : "instagram";
  const handle = platform === "tiktok"
    ? normalizeTikTokHandle(params.get("creator") ?? "")
    : normalizeInstagramHandle(params.get("creator") ?? "");
  if (!validResearchHandle(handle, platform)) return null;
  return { handle, autostart: params.get("start") === "1", platform };
}
