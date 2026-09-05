/** Dashboard Carousels hub: paths, recent list, and editor launch URLs. */

export const CAROUSELS_PATH = "/carousels";
export const CAROUSELS_LIBRARY_PATH = "/carousels/library";
export const CAROUSELS_NEW_PATH = "/carousels/new";
export const CAROUSEL_LIBRARY_PATH = "/carousel-library";
export const CAROUSEL_STUDIO_PATH = "/carousel-studio";
export const CAROUSELS_RECENT_LIMIT = 6;
export const CAROUSELS_SIDEBAR_LABEL = "Carousels";

export function buildCarouselEditHref(remakeId: number): string {
  return `${CAROUSELS_PATH}/${remakeId}/edit`;
}

export function buildCarouselGenerateHref(content: string): string {
  const params = new URLSearchParams();
  params.set("content", content.trim());
  return `${CAROUSELS_NEW_PATH}?${params.toString()}`;
}

export function buildStudioGenerateHref(content: string): string {
  return buildCarouselGenerateHref(content);
}

export function buildStudioRemakeHref(remakeId: number): string {
  return buildCarouselEditHref(remakeId);
}

export function parseCarouselEditRemakeId(pathname: string): number | null {
  const path = pathname.split("?")[0];
  const match = path.match(/^\/carousels\/(\d+)\/edit$/);
  if (!match) return null;
  const remakeId = Number(match[1]);
  if (!Number.isInteger(remakeId) || remakeId <= 0) return null;
  return remakeId;
}

export function isCarouselsNavActive(location: string): boolean {
  const path = location.split("?")[0];
  return (
    path === CAROUSELS_PATH ||
    path === CAROUSELS_LIBRARY_PATH ||
    path === CAROUSELS_NEW_PATH ||
    path === CAROUSEL_LIBRARY_PATH ||
    path === CAROUSEL_STUDIO_PATH ||
    parseCarouselEditRemakeId(path) != null ||
    path.startsWith(`${CAROUSELS_LIBRARY_PATH}/`) ||
    path.startsWith(`${CAROUSEL_LIBRARY_PATH}/`)
  );
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

export function legacyStudioRedirectPath(search: string): string {
  const intent = parseStudioLaunchSearch(search);
  if (intent.kind === "open_remake") return buildCarouselEditHref(intent.remakeId);
  if (intent.kind === "generate") return buildCarouselGenerateHref(intent.content);
  return CAROUSELS_PATH;
}

export function pickRecentCarousels<T extends { status: string }>(
  rows: T[],
  limit = CAROUSELS_RECENT_LIMIT
): T[] {
  return rows.filter((row) => row.status === "completed").slice(0, limit);
}
