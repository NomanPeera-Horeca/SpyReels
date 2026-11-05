import { afterEach, describe, expect, it } from "vitest";
import { firstSearchEnabled, planRefreshJobs } from "../topicFill";

type Pool = { poolKey: string; lastRefreshedAt: Date | null; id: number };
const keyOf = (s: { platform: string; niche: string; pillar: string }) => `${s.platform}:${s.niche}:${s.pillar}`.toLowerCase();
const spec = (platform: string, pillar: string) => ({ platform, niche: "N", pillar });
const day = new Date("2026-11-01T00:00:00Z");

function base(over: Partial<Parameters<typeof planRefreshJobs<Pool>>[0]> = {}) {
  const plan = [spec("tiktok", "Dubai rental laws"), spec("youtube", "Dubai rental laws"), spec("tiktok", "camping"), spec("tiktok", "gym workouts")];
  const existing: Pool[] = [
    { poolKey: keyOf(spec("tiktok", "gym workouts")), lastRefreshedAt: day, id: 1 },
    // A pool that was created but never searched counts as never searched.
    { poolKey: keyOf(spec("youtube", "Dubai rental laws")), lastRefreshedAt: null, id: 2 },
  ];
  return {
    plan,
    keyOf,
    existing,
    due: [{ pool: existing[0]!, creators: 5 }],
    creatorsByKey: new Map([
      [keyOf(spec("tiktok", "Dubai rental laws")), 1],
      [keyOf(spec("youtube", "Dubai rental laws")), 1],
      [keyOf(spec("tiktok", "gym workouts")), 5],
    ]),
    held: new Set<string>(),
    firstSearch: true,
    max: 10,
    ...over,
  };
}

describe("first searches for never-searched topics", () => {
  it("puts never-searched topics with creators first, then due refreshes, then topics without creators", () => {
    const jobs = planRefreshJobs(base());
    expect(jobs.map(j => (j.kind === "first" ? `first:${j.key}` : `refresh:${j.pool.poolKey}`))).toEqual([
      "first:tiktok:n:dubai rental laws",
      "first:youtube:n:dubai rental laws",
      "refresh:tiktok:n:gym workouts",
      "first:tiktok:n:camping",
    ]);
  });

  it("never schedules an already-searched pool as a first search", () => {
    const jobs = planRefreshJobs(base({ due: [] }));
    expect(jobs.some(j => j.kind === "first" && j.key === "tiktok:n:gym workouts")).toBe(false);
  });

  it("never schedules the same pool twice in one tick, even if the plan repeats it", () => {
    const b = base();
    const jobs = planRefreshJobs({ ...b, plan: [...b.plan, ...b.plan] });
    const keys = jobs.map(j => (j.kind === "first" ? j.key : j.pool.poolKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("respects the per-tick limit", () => {
    expect(planRefreshJobs(base({ max: 2 }))).toHaveLength(2);
  });

  it("skips topics held by a running experiment", () => {
    const jobs = planRefreshJobs(base({ held: new Set(["dubai rental laws"]) }));
    expect(jobs.some(j => j.kind === "first" && j.key.includes("dubai"))).toBe(false);
  });

  it("does exactly what it did before when switched off: only due refreshes", () => {
    const jobs = planRefreshJobs(base({ firstSearch: false }));
    expect(jobs.map(j => j.kind)).toEqual(["refresh"]);
  });
});

describe("switch", () => {
  const before = process.env.VIRAL_TOPIC_FIRST_SEARCH;
  afterEach(() => {
    if (before === undefined) delete process.env.VIRAL_TOPIC_FIRST_SEARCH;
    else process.env.VIRAL_TOPIC_FIRST_SEARCH = before;
  });
  it("is off unless VIRAL_TOPIC_FIRST_SEARCH=on", () => {
    delete process.env.VIRAL_TOPIC_FIRST_SEARCH;
    expect(firstSearchEnabled()).toBe(false);
    process.env.VIRAL_TOPIC_FIRST_SEARCH = "true";
    expect(firstSearchEnabled()).toBe(false);
    process.env.VIRAL_TOPIC_FIRST_SEARCH = "on";
    expect(firstSearchEnabled()).toBe(true);
  });
});
