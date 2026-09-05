/** Dashboard Carousels hub: paths, recent list, and Studio launch URLs. */

export const CAROUSELS_PATH = "/carousels";
export const CAROUSEL_LIBRARY_PATH = "/carousel-library";
export const CAROUSEL_STUDIO_PATH = "/carousel-studio";
export const CAROUSELS_RECENT_LIMIT = 6;
export const CAROUSELS_SIDEBAR_LABEL = "Carousels";

export function isCarouselsNavActive(location: string): boolean {
  const path = location.split("?")[0];
  return (
    path === CAROUSELS_PATH ||
    path === CAROUSEL_LIBRARY_PATH ||
    path.startsWith(`${CAROUSEL_LIBRARY_PATH}/`)
  );
}

export function buildStudioGenerateHref(content: string): string {
  const params = new URLSearchParams();
  params.set("content", content.trim());
  return `${CAROUSEL_STUDIO_PATH}?${params.toString()}`;
}

export function buildStudioRemakeHref(remakeId: number): string {
  return `${CAROUSEL_STUDIO_PATH}?remakeId=${remakeId}`;
}

export type StudioLaunchIntent =
  | { kind: "open_remake"; remakeId: number }
  | { kind: "generate"; content: string }
  | { kind: "none" };

export function parseStudioLaunchSearch(search: string): StudioLaunchIntent {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const remakeRaw = params.get("remakeId");
  if (remakeRaw) {
    const remakeId = Number(remakeRaw);
    if (Number.isInteger(remakeId) && remakeId > 0) {
      return { kind: "open_remake", remakeId };
    }
  }
  const content = params.get("content")?.trim() ?? "";
  if (content) return { kind: "generate", content };
  return { kind: "none" };
}

export function pickRecentCarousels<T extends { status: string }>(
  rows: T[],
  limit = CAROUSELS_RECENT_LIMIT
): T[] {
  return rows.filter((row) => row.status === "completed").slice(0, limit);
}
