import { desc } from "drizzle-orm";
import { carouselRemakes } from "../../drizzle/schema";

export const CAROUSEL_REMAKE_LIST_SORTS = ["scheduled", "newest"] as const;
export type CarouselRemakeListSort = (typeof CAROUSEL_REMAKE_LIST_SORTS)[number];

export type CarouselRemakeListQueryInput = {
  sort?: CarouselRemakeListSort;
  limit?: number;
};

export type CarouselRemakeListQueryPlan = {
  sort: CarouselRemakeListSort;
  /** SQL ORDER BY applied before LIMIT. */
  sqlOrderBy: "createdAt_desc";
  limit: number;
  applyScheduledFirstSort: boolean;
};

export const CAROUSEL_REMAKE_LIST_DEFAULT_LIMIT = 20;

/** Scheduled remakes first (soonest postDate), then newest created. */
export function compareRemakesForList(
  a: { postDate: Date | null; createdAt: Date },
  b: { postDate: Date | null; createdAt: Date }
): number {
  if (a.postDate && b.postDate) {
    return a.postDate.getTime() - b.postDate.getTime();
  }
  if (a.postDate && !b.postDate) return -1;
  if (!a.postDate && b.postDate) return 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function planCarouselRemakeListQuery(
  input?: CarouselRemakeListQueryInput
): CarouselRemakeListQueryPlan {
  const sort = input?.sort === "newest" ? "newest" : "scheduled";
  return {
    sort,
    sqlOrderBy: "createdAt_desc",
    limit: input?.limit ?? CAROUSEL_REMAKE_LIST_DEFAULT_LIMIT,
    applyScheduledFirstSort: sort !== "newest",
  };
}

/** Drizzle ORDER BY for list. Always createdAt DESC, applied before LIMIT. */
export function carouselRemakeListSqlOrderBy(
  _sort?: CarouselRemakeListSort
) {
  return desc(carouselRemakes.createdAt);
}

/**
 * In-memory stand-in for the list window: order first, then LIMIT.
 * Newest skips the scheduled-first post-sort used by default callers.
 */
export function applyCarouselRemakeListWindow<
  T extends { postDate: Date | null; createdAt: Date },
>(rows: T[], input?: CarouselRemakeListQueryInput): T[] {
  const plan = planCarouselRemakeListQuery(input);
  const ordered = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const limited = ordered.slice(0, plan.limit);
  if (plan.applyScheduledFirstSort) {
    return limited.sort(compareRemakesForList);
  }
  return limited;
}
