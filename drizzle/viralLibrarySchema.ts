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
  json,
  mediumtext,
  mysqlTable,
  primaryKey,
  timestamp,
  tinyint,
  uniqueIndex,
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

/* ---------- understanding (migration drizzle/0109_viral_understanding.sql) ---------- */

/** Topic list: the approved starter topics plus topics added for creators' pillars. */
export const viralTopics = mysqlTable("viral_topics", {
  slug: varchar("slug", { length: 80 }).primaryKey(),
  label: varchar("label", { length: 120 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  source: varchar("source", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

/** 1-3 topics per processed viral or rising library video. */
export const viralVideoTopics = mysqlTable(
  "viral_video_topics",
  {
    candidateId: int("candidateId").notNull(),
    topicSlug: varchar("topicSlug", { length: 80 }).notNull(),
    taggedAt: timestamp("taggedAt").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.candidateId, table.topicSlug] }),
    topicIdx: index("idx_viral_video_topics_topic").on(table.topicSlug),
  })
);

/**
 * What each viral or rising video is really about, from its transcript,
 * frames, the creator's usual topics and how we found it. One row per video;
 * a video is processed once ("processing" rows are claims).
 */
export const viralVideoInsights = mysqlTable(
  "viral_video_insights",
  {
    candidateId: int("candidateId").primaryKey(),
    status: varchar("status", { length: 16 }).notNull(),
    summary: varchar("summary", { length: 300 }),
    format: varchar("format", { length: 32 }),
    transcriptSource: varchar("transcriptSource", { length: 24 }),
    frameCount: int("frameCount").notNull(),
    signals: varchar("signals", { length: 255 }),
    embedding: json("embedding").$type<number[]>(),
    embeddingModel: varchar("embeddingModel", { length: 64 }),
    costUsd: decimal("costUsd", { precision: 10, scale: 5 }),
    attempts: int("attempts").notNull(),
    error: varchar("error", { length: 200 }),
    claimedAt: timestamp("claimedAt").notNull(),
    processedAt: timestamp("processedAt"),
  },
  table => ({
    statusIdx: index("idx_viral_video_insights_status").on(table.status),
  })
);

/** A creator's usual topics, worked out once from their videos and reused for all of them. */
export const viralCreatorTopics = mysqlTable(
  "viral_creator_topics",
  {
    platform: varchar("platform", { length: 16 }).notNull(),
    handle: varchar("handle", { length: 128 }).notNull(),
    topicSlugs: json("topicSlugs").$type<string[]>().notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    computedAt: timestamp("computedAt").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.platform, table.handle] }),
  })
);

/** Topics matched to a creator's confirmed niche, pillars and sub-topics. */
export const viralProfileTopics = mysqlTable(
  "viral_profile_topics",
  {
    socialProfileId: varchar("socialProfileId", { length: 36 }).notNull(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    topicSlug: varchar("topicSlug", { length: 80 }).notNull(),
    matchedAt: timestamp("matchedAt").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.socialProfileId, table.topicSlug] }),
    topicIdx: index("idx_viral_profile_topics_topic").on(table.topicSlug),
  })
);

/** Strategy version each profile was matched on, plus its meaning embedding. */
export const viralProfileTopicRuns = mysqlTable("viral_profile_topic_runs", {
  socialProfileId: varchar("socialProfileId", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
  strategyHash: varchar("strategyHash", { length: 64 }).notNull(),
  embedding: json("embedding").$type<number[]>(),
  embeddingModel: varchar("embeddingModel", { length: 64 }),
  matchedAt: timestamp("matchedAt").notNull(),
});

/** One transcript per public video, shared by remake, Collected, research and the library. */
export const sharedTranscripts = mysqlTable(
  "shared_transcripts",
  {
    platform: varchar("platform", { length: 16 }).notNull(),
    sourceId: varchar("sourceId", { length: 128 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    transcript: mediumtext("transcript"),
    segments: json("segments"),
    durationSec: int("durationSec"),
    source: varchar("source", { length: 24 }).notNull(),
    partial: tinyint("partial").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.platform, table.sourceId] }),
  })
);

/** Daily spend on video understanding, so a cap can stop it. */
export const viralProcessingSpend = mysqlTable("viral_processing_spend", {
  day: varchar("day", { length: 10 }).primaryKey(),
  usd: decimal("usd", { precision: 10, scale: 4 }).notNull(),
  videos: int("videos").notNull(),
});

/**
 * Creators shown on Home, queued for background research (migration
 * drizzle/0110_research_prefetch.sql). Runtime code: server/research/prefetch.ts.
 */
export const researchPrefetch = mysqlTable(
  "research_prefetch",
  {
    platform: varchar("platform", { length: 16 }).notNull(),
    handle: varchar("handle", { length: 128 }).notNull(),
    /** pending | running | done | failed */
    status: varchar("status", { length: 16 }).notNull(),
    requestedAt: timestamp("requestedAt").notNull(),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    jobId: int("jobId"),
    attempts: int("attempts").notNull().default(0),
    error: varchar("error", { length: 255 }),
  },
  table => ({
    pk: primaryKey({ columns: [table.platform, table.handle] }),
    statusIdx: index("idx_research_prefetch_status").on(table.status, table.requestedAt),
  })
);

/**
 * Keyword bank (migration drizzle/0111_viral_keywords.sql): real search
 * phrases per topic and platform, with how well each finds on-topic viral
 * videos and creators. Runtime code: server/viralPosts/keywords.ts.
 */
export const viralKeywords = mysqlTable(
  "viral_keywords",
  {
    id: int("id").autoincrement().primaryKey(),
    topicSlug: varchar("topicSlug", { length: 80 }).notNull(),
    /** youtube | tiktok | instagram */
    platform: varchar("platform", { length: 16 }).notNull(),
    phrase: varchar("phrase", { length: 160 }).notNull(),
    /** youtube_autocomplete | google_autocomplete | viral_hashtag | ai */
    source: varchar("source", { length: 24 }).notNull(),
    /** 0-100: how strongly real searches suggest this phrase. */
    demand: int("demand").notNull().default(0),
    runs: int("runs").notNull().default(0),
    found: int("found").notNull().default(0),
    passed: int("passed").notNull().default(0),
    viral: int("viral").notNull().default(0),
    creatorsFound: int("creatorsFound").notNull().default(0),
    goodCreators: int("goodCreators").notNull().default(0),
    retired: tinyint("retired").notNull().default(0),
    lastUsedAt: timestamp("lastUsedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    uniq: uniqueIndex("uniq_viral_keywords_topic_platform_phrase").on(table.topicSlug, table.platform, table.phrase),
    byTopic: index("idx_viral_keywords_topic_platform").on(table.topicSlug, table.platform, table.retired),
  })
);

/**
 * Which videos (platform + sourceId) and creators (sourceId '') each phrase
 * found, so viral videos and good creators can be counted per phrase later.
 */
export const viralKeywordHits = mysqlTable(
  "viral_keyword_hits",
  {
    keywordId: int("keywordId").notNull(),
    platform: varchar("platform", { length: 16 }).notNull(),
    sourceId: varchar("sourceId", { length: 64 }).notNull().default(""),
    creatorHandle: varchar("creatorHandle", { length: 128 }).notNull().default(""),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.keywordId, table.sourceId, table.creatorHandle] }),
    byVideo: index("idx_viral_keyword_hits_video").on(table.platform, table.sourceId),
  })
);
