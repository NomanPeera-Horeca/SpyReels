/**
 * Studio Library view-model + click handlers.
 * Does not generate remakes or start downloads.
 */

export const STUDIO_NAV_ITEMS = [
  ["create", "Create"],
  ["library", "Library"],
  ["performance", "Performance"],
  ["brand", "Brand"],
] as const;

/** Newest-first in the DB before LIMIT so scheduled remakes cannot crowd out recent ones. */
export const STUDIO_LIBRARY_LIST_QUERY = {
  limit: 50,
  sort: "newest",
} as const;

export type StudioNavId = (typeof STUDIO_NAV_ITEMS)[number][0];

export type StudioLibraryRow = {
  id: number;
  title?: string | null;
  slideCount?: number | null;
  niche?: string | null;
  createdAt: Date | string;
  status: string;
  thumbnailUrl?: string | null;
  aspectRatioOverride?: string | null;
  errorMessage?: string | null;
};

export type StudioLibraryCard = {
  id: number;
  title: string;
  slideCount: number;
  createdAt: Date | string;
  status: "completed" | "failed";
  statusLabel: "Ready" | "Failed";
  thumbnailUrl: string | null;
  aspectRatio: string | null;
  errorMessage: string | null;
};

export type LibraryCardCommand =
  | { kind: "open_completed"; remakeId: number }
  | { kind: "show_failed"; remakeId: number; errorMessage: string };

export function sortStudioLibraryNewestFirst<T extends { createdAt: Date | string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}

export function mapStudioLibraryRows(rows: StudioLibraryRow[]): StudioLibraryCard[] {
  return sortStudioLibraryNewestFirst(rows).map((row) => {
    const status = row.status === "failed" ? "failed" : "completed";
    const title =
      (typeof row.title === "string" && row.title.trim()) ||
      (typeof row.niche === "string" && row.niche.trim()) ||
      "Untitled carousel";
    return {
      id: row.id,
      title,
      slideCount: typeof row.slideCount === "number" ? row.slideCount : 0,
      createdAt: row.createdAt,
      status,
      statusLabel: status === "failed" ? "Failed" : "Ready",
      thumbnailUrl: row.thumbnailUrl ?? null,
      aspectRatio: row.aspectRatioOverride ?? null,
      errorMessage: row.errorMessage?.trim() || null,
    };
  });
}

export function formatStudioLibraryDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function commandForLibraryCard(item: {
  id: number;
  status: string;
  errorMessage?: string | null;
}): LibraryCardCommand {
  if (item.status === "failed") {
    return {
      kind: "show_failed",
      remakeId: item.id,
      errorMessage: item.errorMessage?.trim() || "Carousel generation failed.",
    };
  }
  return { kind: "open_completed", remakeId: item.id };
}

/** Library clicks never start generation or charge usage. */
export function libraryOpenStartsGeneration(
  _command: LibraryCardCommand
): boolean {
  return false;
}

export function studioLibraryCardMeta(card: StudioLibraryCard): string {
  const parts = [
    card.slideCount === 1 ? "1 slide" : `${card.slideCount} slides`,
    card.statusLabel,
  ];
  if (card.aspectRatio) parts.push(card.aspectRatio);
  const date = formatStudioLibraryDate(card.createdAt);
  if (date) parts.push(date);
  return parts.join(" • ");
}
