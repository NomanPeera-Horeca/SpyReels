/** Stable public-to-product handoff for a selected Instagram creator. */
export function researchReturnTo(handle: string): string {
  const normalized = handle.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(normalized)) {
    throw new Error("Invalid Instagram username");
  }
  return `/research?creator=${encodeURIComponent(normalized)}&start=1`;
}

export function parseResearchIntent(search: string): { handle: string; autostart: boolean } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const handle = (params.get("creator") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) return null;
  return { handle, autostart: params.get("start") === "1" };
}
