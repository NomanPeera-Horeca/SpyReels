/**
 * New onboarding + personalization tables (DRAFT, NOT YET MIGRATED).
 *
 * MIGRATION GATE: these tables do not exist in any database yet.
 * - Not listed in drizzle.config.ts, so drizzle-kit cannot generate a migration.
 * - No runtime code may import this file until the migration is applied.
 *   (Guarded by shared/personalization/schemaGuard.test.ts.)
 * - The SQL lives in docs/architecture/drafts/onboarding_v2_personalization.sql
 *   and gets its real number only after the CEO confirms it against production.
 *
 * Design: all new tables, no ALTER on users or workspace_members. Those tables
 * are read on every request; adding columns before the migration runs would
 * break every query on them. Rollback = drop these tables.
 *
 * Ownership: workspace owns social profiles; a social profile owns its
 * analysis runs, items and progress. Every table carries workspaceId so every
 * query can filter by workspace (isolation).
 */
import {
  bigint,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import {
  ANALYSIS_RUN_STATUSES,
  ANALYSIS_STAGES,
  ANALYSIS_STAGE_STATUSES,
  ATTRIBUTION_SOURCES,
  ITEM_SOURCES,
  ITEM_STATUSES,
  PERSONALIZATION_ITEM_KINDS,
  PRIMARY_USE_CASES,
  SOCIAL_PLATFORMS,
  SOCIAL_PROFILE_AUTHORIZATION,
  SOCIAL_PROFILE_STATUSES,
  STEP_STATUSES,
  type ItemPayloadByKind,
} from "../shared/personalization/model";

/** Instagram, TikTok and YouTube profiles connected to a workspace (public data only). */
export const socialProfiles = mysqlTable(
  "social_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    platform: mysqlEnum("platform", SOCIAL_PLATFORMS).notNull(),
    /** Stable platform id when the provider returns one (handles can change). */
    platformAccountId: varchar("platformAccountId", { length: 128 }),
    normalizedHandle: varchar("normalizedHandle", { length: 64 }).notNull(),
    displayName: varchar("displayName", { length: 255 }),
    avatarUrl: varchar("avatarUrl", { length: 1000 }),
    bio: text("bio"),
    followerCount: bigint("followerCount", { mode: "number", unsigned: true }),
    followingCount: bigint("followingCount", {
      mode: "number",
      unsigned: true,
    }),
    postCount: bigint("postCount", { mode: "number", unsigned: true }),
    publicFactsFetchedAt: timestamp("publicFactsFetchedAt"),
    status: mysqlEnum("status", SOCIAL_PROFILE_STATUSES)
      .default("pending_confirmation")
      .notNull(),
    authorization: mysqlEnum("authorization", SOCIAL_PROFILE_AUTHORIZATION)
      .default("none")
      .notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    /** Soft delete. Re-adding the same handle restores this row (unique key below). */
    deletedAt: timestamp("deletedAt"),
  },
  t => ({
    workspacePlatformHandleUnique: uniqueIndex(
      "uniq_social_profiles_ws_platform_handle"
    ).on(t.workspaceId, t.platform, t.normalizedHandle),
    workspaceIdx: index("idx_social_profiles_workspace").on(
      t.workspaceId,
      t.deletedAt
    ),
  })
);

/** Which profile each member is working on in a workspace. */
export const workspaceMemberActiveProfiles = mysqlTable(
  "workspace_member_active_profiles",
  {
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    userId: int("userId").notNull(),
    socialProfileId: varchar("socialProfileId", { length: 36 }).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
    profileIdx: index("idx_member_active_profile_profile").on(
      t.socialProfileId
    ),
  })
);

/** Account-level answers (steps 3a and 3b). A skip stays null, never "other". */
export const userOnboardingAnswers = mysqlTable("user_onboarding_answers", {
  userId: int("userId").primaryKey(),
  primaryUseCase: mysqlEnum("primaryUseCase", PRIMARY_USE_CASES),
  primaryUseCaseAnsweredAt: timestamp("primaryUseCaseAnsweredAt"),
  attributionSource: mysqlEnum("attributionSource", ATTRIBUTION_SOURCES),
  attributionAnsweredAt: timestamp("attributionAnsweredAt"),
  attributionSkippedAt: timestamp("attributionSkippedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One row per analysis of a profile. Never deleted (history). Runs on durable_jobs. */
export const profileAnalysisRuns = mysqlTable(
  "profile_analysis_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    socialProfileId: varchar("socialProfileId", { length: 36 }).notNull(),
    inputHash: varchar("inputHash", { length: 64 }).notNull(),
    /** Same value as durable_jobs.idempotencyKey. */
    idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull(),
    durableJobId: bigint("durableJobId", { mode: "number", unsigned: true }),
    status: mysqlEnum("status", ANALYSIS_RUN_STATUSES)
      .default("queued")
      .notNull(),
    postsInWindow: int("postsInWindow"),
    windowStart: timestamp("windowStart"),
    windowEnd: timestamp("windowEnd"),
    errorCode: varchar("errorCode", { length: 64 }),
    requestedByUserId: int("requestedByUserId").notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idempotencyUnique: uniqueIndex("uniq_profile_analysis_runs_idempotency").on(
      t.idempotencyKey
    ),
    profileIdx: index("idx_profile_analysis_runs_profile").on(
      t.socialProfileId,
      t.createdAt
    ),
    workspaceIdx: index("idx_profile_analysis_runs_workspace").on(
      t.workspaceId
    ),
  })
);

/** Per-stage status behind the onboarding checklist. */
export const profileAnalysisStages = mysqlTable(
  "profile_analysis_stages",
  {
    runId: varchar("runId", { length: 36 }).notNull(),
    stage: mysqlEnum("stage", ANALYSIS_STAGES).notNull(),
    status: mysqlEnum("status", ANALYSIS_STAGE_STATUSES)
      .default("waiting")
      .notNull(),
    errorCode: varchar("errorCode", { length: 64 }),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    pk: primaryKey({ columns: [t.runId, t.stage] }),
  })
);

/**
 * Goals, audiences, pillars, niche, language. One row per value.
 * Edits never update payload in place: the old row becomes "superseded" and a
 * new row points back to it via supersedesItemId.
 */
export const personalizationItems = mysqlTable(
  "personalization_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    socialProfileId: varchar("socialProfileId", { length: 36 }).notNull(),
    kind: mysqlEnum("kind", PERSONALIZATION_ITEM_KINDS).notNull(),
    payload: json("payload")
      .$type<ItemPayloadByKind[keyof ItemPayloadByKind]>()
      .notNull(),
    source: mysqlEnum("source", ITEM_SOURCES).notNull(),
    status: mysqlEnum("status", ITEM_STATUSES).notNull(),
    basedOnVersion: int("basedOnVersion").notNull(),
    supersedesItemId: varchar("supersedesItemId", { length: 36 }),
    analysisRunId: varchar("analysisRunId", { length: 36 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    profileKindStatusIdx: index(
      "idx_personalization_items_profile_kind_status"
    ).on(t.socialProfileId, t.kind, t.status),
    workspaceIdx: index("idx_personalization_items_workspace").on(
      t.workspaceId
    ),
  })
);

/** One row per profile: stepper state, version and completion. Resume step is derived, not stored. */
export const personalizationProgress = mysqlTable(
  "personalization_progress",
  {
    socialProfileId: varchar("socialProfileId", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    personalizationVersion: int("personalizationVersion").default(1).notNull(),
    goalStatus: mysqlEnum("goalStatus", STEP_STATUSES)
      .default("pending")
      .notNull(),
    audienceStatus: mysqlEnum("audienceStatus", STEP_STATUSES)
      .default("pending")
      .notNull(),
    pillarsStatus: mysqlEnum("pillarsStatus", STEP_STATUSES)
      .default("pending")
      .notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    workspaceIdx: index("idx_personalization_progress_workspace").on(
      t.workspaceId
    ),
  })
);

export type SocialProfile = typeof socialProfiles.$inferSelect;
export type PersonalizationItemRow = typeof personalizationItems.$inferSelect;
export type PersonalizationProgressRow =
  typeof personalizationProgress.$inferSelect;
export type ProfileAnalysisRun = typeof profileAnalysisRuns.$inferSelect;
export type UserOnboardingAnswers = typeof userOnboardingAnswers.$inferSelect;
