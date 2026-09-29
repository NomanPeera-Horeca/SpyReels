/** Stable public-to-product handoff for a selected Instagram creator. */
export function researchReturnTo(handle: string, platform: "instagram" | "tiktok" = "instagram"): string {
  const normalized = handle.trim().replace(/^@+/, "").toLowerCase();
  const valid = platform === "tiktok" ? /^[a-z0-9._]{2,24}$/.test(normalized) : /^[a-z0-9._]{1,30}$/.test(normalized);
  if (!valid) {
    throw new Error("Invalid creator username");
  }
  return `/research?${platform === "tiktok" ? "platform=tiktok&" : ""}creator=${encodeURIComponent(normalized)}&start=1`;
}

export function parseResearchIntent(search: string): { handle: string; autostart: boolean; platform: "instagram" | "tiktok" } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const handle = (params.get("creator") ?? "").trim().toLowerCase();
  const platform = params.get("platform") === "tiktok" ? "tiktok" : "instagram";
  const valid = platform === "tiktok" ? /^[a-z0-9._]{2,24}$/.test(handle) : /^[a-z0-9._]{1,30}$/.test(handle);
  if (!valid) return null;
  return { handle, autostart: params.get("start") === "1", platform };
}
