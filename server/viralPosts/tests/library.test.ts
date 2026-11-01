import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../db", () => ({ getDb: async () => dbState.db }));

import {
  classifyLibraryRows,
  ingestResearchJobs,
  libraryHandle,
  researchJobToCandidates,
  resetLibraryReadyCacheForTests,
} from "../library";

const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("library before migration 0108", () => {
  beforeEach(() => resetLibraryReadyCacheForTests());

  it("skips quietly when the tables do not exist yet", async () => {
    const execute = vi.fn(async () => [[{ n: 0 }]]);
    const insert = vi.fn();
    dbState.db = { execute, insert };
    expect(await ingestResearchJobs()).toMatchObject({ jobs: 0, skipped: "migration_missing" });
    expect(
      await classifyLibraryRows({ rows: [{ id: 1, platform: "tiktok" } as never], source: "pool" })
    ).toEqual({ classified: 0, byStatus: {} });
    expect(insert).not.toHaveBeenCalled();
  });

  it("skips when the database is unavailable", async () => {
    dbState.db = null;
    expect(await ingestResearchJobs()).toMatchObject({ skipped: "db_unavailable" });
  });
});

describe("researchJobToCandidates", () => {
  const job = {
    source: "tiktok" as const,
    jobId: 7,
    handle: "@ChefMike",
    followers: 20_000,
    avatarUrl: "https://a/x.jpg",
    videos: [
      {
        sourceId: "111",
        sourceUrl: "https://www.tiktok.com/@chefmike/video/111",
        caption: "Menu pricing trick #restaurant",
        views: 250_000,
        likes: 9_000,
        comments: 300,
        thumbnailUrl: null,
        videoUrl: null,
        postedAt: daysAgo(3),
        ownerHandle: "chefmike",
      },
      { ...emptyVideo(), sourceId: "222", postedAt: daysAgo(400) }, // too old for the library
      { ...emptyVideo(), sourceId: "", postedAt: daysAgo(1) }, // no id
    ],
  };

  it("keeps recent videos with ids, viral or not, under the creator's handle", () => {
    const out = researchJobToCandidates(job, NOW);
    expect(out.map(c => c.sourceId)).toEqual(["111"]);
    expect(out[0]).toMatchObject({
      platform: "tiktok",
      creatorHandle: "@chefmike",
      creatorFollowers: 20_000,
      views: 250_000,
    });
  });

  it("normalizes handles", () => {
    expect(libraryHandle("@@ChefMike ")).toBe("chefmike");
    expect(libraryHandle("")).toBeNull();
  });
});

describe("migration 0108", () => {
  const sql = readFileSync("drizzle/0108_viral_library.sql", "utf8");
  it("only creates new tables and is safe to re-run", () => {
    const code = sql
      .split("\n")
      .filter(l => !l.trim().startsWith("--"))
      .join("\n");
    expect(code.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(3);
    expect(code).not.toMatch(/\bALTER\b|\bDROP\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b/i);
    for (const t of ["viral_creator_baselines", "viral_library_status", "viral_library_ingests"]) {
      expect(code).toContain(t);
    }
  });
});

function emptyVideo() {
  return {
    sourceId: "x",
    sourceUrl: "https://example.com/v",
    caption: null,
    views: 100,
    likes: 1,
    comments: 0,
    thumbnailUrl: null,
    videoUrl: null,
    postedAt: null as Date | null,
    ownerHandle: null,
  };
}
