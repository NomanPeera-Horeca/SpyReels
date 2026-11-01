/**
 * Shared viral library tables (migration drizzle/0108_viral_library.sql).
 *
 * The library itself is `viral_post_candidates`: every public video SpyReels
 * has fetched, from any source. These tables add, without touching that
 * table's columns (so nothing breaks before the migration runs):
 * - viral_creator_baselines: each creator's usual views (median of ~12 recent
 *   videos), used by the one viral rule in shared/viralRule.ts.
 * - viral_library_status: the rule's verdict per video (viral / rising /
 *   not_viral / unknown) and when a rising video is checked again.
 * - viral_library_ingests: which research jobs were already copied in.
 *
 * Runtime code must go through server/viralPosts/library.ts, which checks the
 * tables exist and skips quietly until the migration is applied.
 */
import {
  bigint,
  decimal,
  index,
  int,
  mysqlTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const viralCreatorBaselines = mysqlTable(
  "viral_creator_baselines",
  {
    platform: varchar("platform", { length: 16 }).notNull(),
    handle: varchar("handle", { length: 128 }).notNull(),
    usualViews: bigint("usualViews", { mode: "number" }).notNull(),
    sampleSize: int("sampleSize").notNull(),
    followers: bigint("followers", { mode: "number" }),
    source: varchar("source", { length: 32 }).notNull(),
    measuredAt: timestamp("measuredAt").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.platform, table.handle] }),
  })
);

export const viralLibraryStatus = mysqlTable(
  "viral_library_status",
  {
    candidateId: int("candidateId").primaryKey(),
    platform: varchar("platform", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    basis: varchar("basis", { length: 16 }),
    multiple: decimal("multiple", { precision: 12, scale: 2 }),
    views: bigint("views", { mode: "number" }),
    source: varchar("source", { length: 32 }).notNull(),
    checkedAt: timestamp("checkedAt").notNull(),
    nextCheckAt: timestamp("nextCheckAt"),
  },
  table => ({
    statusIdx: index("idx_viral_library_status_status").on(table.status, table.platform),
    nextCheckIdx: index("idx_viral_library_status_next_check").on(table.nextCheckAt),
  })
);

export const viralLibraryIngests = mysqlTable(
  "viral_library_ingests",
  {
    source: varchar("source", { length: 16 }).notNull(),
    jobId: int("jobId").notNull(),
    videoCount: int("videoCount").notNull(),
    ingestedAt: timestamp("ingestedAt").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.source, table.jobId] }),
  })
);
