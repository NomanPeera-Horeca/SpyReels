import { describe, expect, it } from "vitest";
import { pickPoolsForRefresh, type PoolQueueRow } from "../poolRefreshQueue";

const NOW = Date.parse("2026-11-01T15:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000);
const ALL = new Set(["instagram", "tiktok", "youtube"]);

let nextId = 1;
function pool(p: Partial<PoolQueueRow> & { platform: string }): PoolQueueRow {
  return {
    id: nextId++,
    priority: 100,
    minFreshCandidates: 40,
    lastRefreshedAt: hoursAgo(4),
    lastRefreshStatus: "refreshed",
    lastRefreshCandidateCount: 10,
    freshCandidates: 0,
    ...p,
  };
}

describe("pickPoolsForRefresh", () => {
  it("gives Instagram and YouTube a turn even when many TikTok seed pools are waiting", () => {
    const tiktokSeeds = Array.from({ length: 50 }, () =>
      pool({ platform: "tiktok", priority: 80, lastRefreshedAt: hoursAgo(4) })
    );
    const igRestaurant = pool({ platform: "instagram", lastRefreshedAt: new Date("2026-08-28") });
    const ytRestaurant = pool({ platform: "youtube", lastRefreshedAt: new Date("2026-09-14") });
    const picked = pickPoolsForRefresh({
      rows: [...tiktokSeeds, igRestaurant, ytRestaurant],
      enabledPlatforms: ALL,
      limit: 2,
      now: NOW,
    });
    expect(picked.map(p => p.platform)).toEqual(["instagram", "youtube"]);
  });

  it("takes platforms in turns", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => pool({ platform: "tiktok", lastRefreshedAt: hoursAgo(5) })),
      ...Array.from({ length: 3 }, () => pool({ platform: "instagram", lastRefreshedAt: hoursAgo(6) })),
    ];
    const picked = pickPoolsForRefresh({ rows, enabledPlatforms: ALL, limit: 4, now: NOW });
    expect(picked.map(p => p.platform)).toEqual(["instagram", "tiktok", "instagram", "tiktok"]);
  });

  it("skips pools that are already full, attempted recently, or switched off", () => {
    const full = pool({ platform: "instagram", freshCandidates: 40, lastRefreshedAt: hoursAgo(10) });
    const recent = pool({ platform: "instagram", lastRefreshedAt: hoursAgo(1) });
    const off = pool({ platform: "youtube", lastRefreshedAt: null });
    const picked = pickPoolsForRefresh({
      rows: [full, recent, off],
      enabledPlatforms: new Set(["instagram", "tiktok"]),
      limit: 4,
      now: NOW,
    });
    expect(picked).toEqual([]);
  });

  it("waits a day before retrying a pool whose last run found nothing", () => {
    const empty = pool({ platform: "tiktok", lastRefreshCandidateCount: 0, lastRefreshedAt: hoursAgo(5) });
    const failed = pool({ platform: "tiktok", lastRefreshStatus: "error", lastRefreshedAt: hoursAgo(5) });
    const emptyLongAgo = pool({ platform: "tiktok", lastRefreshCandidateCount: 0, lastRefreshedAt: hoursAgo(25) });
    const picked = pickPoolsForRefresh({
      rows: [empty, failed, emptyLongAgo],
      enabledPlatforms: ALL,
      limit: 4,
      now: NOW,
    });
    expect(picked.map(p => p.id)).toEqual([emptyLongAgo.id]);
  });

  it("refreshes never-refreshed pools first", () => {
    const old = pool({ platform: "tiktok", lastRefreshedAt: hoursAgo(48) });
    const never = pool({ platform: "tiktok", lastRefreshedAt: null });
    const picked = pickPoolsForRefresh({ rows: [old, never], enabledPlatforms: ALL, limit: 1, now: NOW });
    expect(picked[0].id).toBe(never.id);
  });
});
