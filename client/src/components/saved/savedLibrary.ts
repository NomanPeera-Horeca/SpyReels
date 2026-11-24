/**
 * Combined Saved page (Figma "19 — Saved (Saved + Collected)", approved
 * 2026-11-24): pure rules shared by the page and the two embedded libraries.
 *
 * The page shows starred videos (saved.list) and videos added by link or the
 * Telegram bot (collected.list) in ONE grid. Each library keeps its own cards,
 * remake flow and dialogs; the page tells them what to show and in what order
 * (CSS `order` on each grid item), so the two lists sort together.
 */
import type { MutableRefObject } from "react";

export type SavedTab = "all" | "starred" | "links";
export type SavedSort = "newest" | "views" | "likes" | "engagement";

export const SAVED_SORT_LABELS: Record<SavedSort, string> = {
  newest: "Newest first",
  views: "Most views",
  likes: "Most likes",
  engagement: "Best engagement",
};

/** What the page passes to an embedded library (Saved or Collected). */
export type LibraryEmbed = {
  sort: SavedSort;
  /** Hide every card (the other tab is showing). Dialogs stay mounted. */
  hidden: boolean;
  /** Grid position for a card key ("s:<savedId>" or "c:<collectedId>"). */
  order: (key: string) => number;
  /** Cards to leave out (a starred link video is shown once, as its link card). */
  exclude?: (key: string) => boolean;
  /** Filled in by the Saved library so the page's ··· menu can run it. */
  actionsRef?: MutableRefObject<{ transcribeAll?: () => Promise<void> } | null>;
};

export type SortFields = { key: string; added: number; views: number; likes: number; engagement: number };

const time = (d: Date | string | null | undefined) => {
  const t = d ? new Date(d).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
};

/** Sort fields for a starred item (same numbers the Saved page sorts by). Pure. */
export function savedItemSortFields(item: {
  id: number;
  createdAt: Date | string;
  source: string;
  reel: { viewCount?: number | null; likeCount?: number | null; commentCount?: number | null };
  job: { followerCount?: number | null };
}): SortFields {
  const fc = item.source === "discover" ? 0 : item.job.followerCount || 0;
  const likes = item.reel.likeCount || 0;
  return {
    key: `s:${item.id}`,
    added: time(item.createdAt),
    views: item.reel.viewCount || 0,
    likes,
    engagement: fc ? ((likes + (item.reel.commentCount || 0)) / fc) * 100 : 0,
  };
}

/** Sort fields for a video added by link (same numbers the Collected page sorts by). Pure. */
export function collectedRowSortFields(row: {
  id: number;
  createdAt: Date | string;
  viewCount?: number | null;
  monitoredViewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  monitoredFollowerCount?: number | null;
  ownerFollowerCount?: number | null;
}): SortFields {
  const followers = row.monitoredFollowerCount || row.ownerFollowerCount || 0;
  const likes = row.likeCount || 0;
  return {
    key: `c:${row.id}`,
    added: time(row.createdAt),
    views: row.monitoredViewCount && row.monitoredViewCount > 0 ? row.monitoredViewCount : row.viewCount || 0,
    likes,
    engagement: followers ? ((likes + (row.commentCount || 0)) / followers) * 100 : 0,
  };
}

/** One order for both lists: key -> position (0 = first). Ties keep newest first. Pure. */
export function mergedOrder(fields: SortFields[], sort: SavedSort): Map<string, number> {
  const by: Record<SavedSort, (f: SortFields) => number> = {
    newest: f => f.added,
    views: f => f.views,
    likes: f => f.likes,
    engagement: f => f.engagement,
  };
  const value = by[sort];
  const sorted = [...fields].sort((a, b) => value(b) - value(a) || b.added - a.added || a.key.localeCompare(b.key));
  return new Map(sorted.map((f, i) => [f.key, i]));
}

/** Tab from the address: ?tab=starred|links (Collected forwards to links). Pure. */
export function savedTabFromSearch(search: string): SavedTab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "starred" || tab === "links" ? tab : "all";
}

/** Map the page's sort to the Saved library's own sort value. Pure. */
export function savedLibrarySort(sort: SavedSort): string {
  return sort === "newest" ? "date" : sort;
}

/** Map the page's sort to the Collected library's own sort value. Pure. */
export function collectedLibrarySort(sort: SavedSort): string {
  return sort === "newest" ? "added_newest" : sort;
}
