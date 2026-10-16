/**
 * New onboarding + personalization tables (DRAFT, NOT YET MIGRATED).
 *
 * MIGRATION GATE: these tables do not exist in any database yet.
 * - Not listed in drizzle.config.ts, so drizzle-kit cannot generate a migration.
 * - No runtime code may import this file until the migration is applied.
 *   (Guarded by shared/personalization/schemaGuard.test.ts.)
 * - The SQL lives in docs/architecture/drafts/onboarding_v2_personalization.sql
 *   and gets its real number only after the CEO confirms it against production.
 *   It is tested on real MySQL 8 by shared/personalization/schema.mysql.test.ts.
 *
 * Design: all new tables, no ALTER on users or workspace_members. Those tables
 * are read on every request; adding columns before the migration runs would
 * break every query on them. Rollback = drop these tables.
 *
 * Isolation is enforced by the database: social_profiles has UNIQUE
 * (id, workspaceId) and every child references (socialProfileId, workspaceId)
 * together, so no row can point at another workspace's profile.
 *
 * History is protected by the database: every FK between history tables is
 * ON DELETE RESTRICT, so deleting or cleaning up an analysis run can never
 * delete confirmed personalization. Only active selections cascade.
 */
import {
  bigint,
  check,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { users, workspaceMembers, workspaces } from "./schema";
import {
  ANALYSIS_REQUEST_KINDS,
  ANALYSIS_RUN_STATUSES,
  ANALYSIS_STAGES,
  ANALYSIS_STAGE_STATUSES,
  ATTRIBUTION_SOURCES,
  ITEM_EVIDENCE,
  ITEM_SOURCES,
  ITEM_STATUSES,
  PERSONALIZATION_ITEM_KINDS,
  PRIMARY_USE_CASES,
  SOCIAL_PLATFORMS,
  SOCIAL_PROFILE_AUTHORIZATION,
  SOCIAL_PROFILE_STATUSES,
  STEP_STATUSES,
  SUGGESTION_CONFIDENCE,
  type GenerationMeta,
  type ProviderAttemptRecord,
  type AnalysisSourceSnapshot,
  type ItemPayloadByKind,
} from "../shared/personalization/model";

/**
 * Instagram, TikTok and YouTube profiles of a workspace (public data only),
 * or an "I don't post yet" placeholder (no platform/handle yet).
 */
export const socialProfiles = mysqlTable(
  "social_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    platform: mysqlEnum("platform", SOCIAL_PLATFORMS),
    /** Stable platform id when the provider returns one (handles can change). */
    platformAccountId: varchar("platformAccountId", { length: 128 }),
    normalizedHandle: varchar("normalizedHandle", { length: 64 }),
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
    createdByUserId: int("createdByUserId"),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    /** Soft delete. Refused by the DB while any member still has it selected. */
    deletedAt: timestamp("deletedAt"),
    /** workspaceId while live, NULL once soft deleted. Target of active selections. */
    liveWorkspaceId: varchar("liveWorkspaceId", {
      length: 36,
    }).generatedAlwaysAs(
      sql`IF(\`deletedAt\` IS NULL, \`workspaceId\`, NULL)`,
      { mode: "stored" }
    ),
  },
  t => [
    unique("uniq_social_profiles_id_workspace").on(t.id, t.workspaceId),
    unique("uniq_social_profiles_id_live_workspace").on(
      t.id,
      t.liveWorkspaceId
    ),
    uniqueIndex("uniq_social_profiles_ws_platform_handle").on(
      t.workspaceId,
      t.platform,
      t.normalizedHandle
    ),
    index("idx_social_profiles_workspace").on(t.workspaceId, t.deletedAt),
    foreignKey({
      name: "fk_social_profiles_workspace",
      columns: [t.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_social_profiles_created_by",
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    check(
      "chk_social_profiles_identity",
      sql`(${t.status} IN ('not_posting_yet','unlinked') AND ${t.normalizedHandle} IS NULL) OR (${t.status} NOT IN ('not_posting_yet','unlinked') AND ${t.platform} IS NOT NULL AND ${t.normalizedHandle} IS NOT NULL)`
    ),
  ]
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
  t => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("idx_member_active_profile_profile").on(
      t.socialProfileId,
      t.workspaceId
    ),
    foreignKey({
      name: "fk_member_active_profile_member",
      columns: [t.workspaceId, t.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "fk_member_active_profile_profile",
      columns: [t.socialProfileId, t.workspaceId],
      foreignColumns: [socialProfiles.id, socialProfiles.liveWorkspaceId],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  ]
);

/** Account-level answers (steps 3a and 3b). A skip stays null, never "other". */
export const userOnboardingAnswers = mysqlTable(
  "user_onboarding_answers",
  {
    userId: int("userId").primaryKey(),
    primaryUseCase: mysqlEnum("primaryUseCase", PRIMARY_USE_CASES),
    primaryUseCaseAnsweredAt: timestamp("primaryUseCaseAnsweredAt"),
    attributionSource: mysqlEnum("attributionSource", ATTRIBUTION_SOURCES),
    attributionAnsweredAt: timestamp("attributionAnsweredAt"),
    attributionSkippedAt: timestamp("attributionSkippedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    foreignKey({
      name: "fk_user_onboarding_answers_user",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    check(
      "chk_user_onboarding_attribution",
      sql`${t.attributionSource} IS NULL OR ${t.attributionSkippedAt} IS NULL`
    ),
  ]
);

/** One row per analysis of a profile. Never deleted on its own (history). Runs on durable_jobs. */
export const profileAnalysisRuns = mysqlTable(
  "profile_analysis_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 }).notNull(),
    socialProfileId: varchar("socialProfileId", { length: 36 }).notNull(),
    inputHash: varchar("inputHash", { length: 64 }).notNull(),
    /** Same value as durable_jobs.idempotencyKey. */
    idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull(),
    requestKind: mysqlEnum("requestKind", ANALYSIS_REQUEST_KINDS).notNull(),
    /** user_refresh only: 1, 2, 3... (two simultaneous taps share the same number). */
    refreshSequence: int("refreshSequence"),
    durableJobId: bigint("durableJobId", { mode: "number", unsigned: true }),
    status: mysqlEnum("status", ANALYSIS_RUN_STATUSES)
      .default("queued")
      .notNull(),
    postsInWindow: int("postsInWindow"),
    /**
     * Normalized posts fetched in stage 1 (published_content). Lets a retry or
     * a restarted worker resume later stages WITHOUT paying the provider again.
     */
    sourceSnapshot: json("sourceSnapshot").$type<AnalysisSourceSnapshot>(),
    sourceFetchedAt: timestamp("sourceFetchedAt"),
    /** Paid provider requests made for this run (cost accounting). */
    providerCallCount: int("providerCallCount"),
    /** One entry per provider attempt: outcome, requests, statuses, estimated cost. */
    providerAttempts: json("providerAttempts").$type<ProviderAttemptRecord[]>(),
    windowStart: timestamp("windowStart"),
    windowEnd: timestamp("windowEnd"),
    errorCode: varchar("errorCode", { length: 64 }),
    requestedByUserId: int("requestedByUserId"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    /** socialProfileId while queued or running, else NULL. UNIQUE = one active analysis per profile. */
    activeProfileSlot: varchar("activeProfileSlot", {
      length: 36,
    }).generatedAlwaysAs(
      sql`IF(\`status\` IN ('queued','running'), \`socialProfileId\`, NULL)`,
      { mode: "stored" }
    ),
  },
  t => [
    uniqueIndex("uniq_profile_analysis_runs_idempotency").on(t.idempotencyKey),
    uniqueIndex("uniq_profile_analysis_runs_active_slot").on(
      t.activeProfileSlot
    ),
    unique("uniq_profile_analysis_runs_id_profile").on(t.id, t.socialProfileId),
    index("idx_profile_analysis_runs_profile").on(
      t.socialProfileId,
      t.workspaceId,
      t.createdAt
    ),
    index("idx_profile_analysis_runs_workspace").on(t.workspaceId),
    foreignKey({
      name: "fk_profile_analysis_runs_profile",
      columns: [t.socialProfileId, t.workspaceId],
      foreignColumns: [socialProfiles.id, socialProfiles.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_profile_analysis_runs_requested_by",
      columns: [t.requestedByUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    check(
      "chk_profile_analysis_runs_provider_calls",
      sql`${t.providerCallCount} IS NULL OR ${t.providerCallCount} >= 0`
    ),
    check(
      "chk_profile_analysis_runs_posts",
      sql`${t.postsInWindow} IS NULL OR ${t.postsInWindow} >= 0`
    ),
    check(
      "chk_profile_analysis_runs_refresh_sequence",
      sql`(${t.requestKind} = 'user_refresh' AND ${t.refreshSequence} IS NOT NULL AND ${t.refreshSequence} >= 1) OR (${t.requestKind} <> 'user_refresh' AND ${t.refreshSequence} IS NULL)`
    ),
  ]
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
  t => [
    primaryKey({ columns: [t.runId, t.stage] }),
    foreignKey({
      name: "fk_profile_analysis_stages_run",
      columns: [t.runId],
      foreignColumns: [profileAnalysisRuns.id],
    }).onDelete("restrict"),
  ]
);

/**
 * Goals, audiences, pillars, niche, language. One row per value.
 * Edits never update payload in place: the old row becomes "superseded" and a
 * new row points back to it via supersedesItemId.
 *
 * supersedesItemId has no DB foreign key on purpose: MySQL stops cascading a
 * self-referencing delete after 15 levels, so a long edit history would make a
 * profile undeletable. Same-profile is enforced by the server (the superseded
 * item is loaded through the profile's authorization check).
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
    evidence: mysqlEnum("evidence", ITEM_EVIDENCE).notNull(),
    basedOnVersion: int("basedOnVersion").notNull(),
    dismissedAtVersion: int("dismissedAtVersion"),
    supersedesItemId: varchar("supersedesItemId", { length: 36 }),
    analysisRunId: varchar("analysisRunId", { length: 36 }),
    /** AI rows: fingerprint of the confirmed inputs used (upstreamInputsHash). */
    basedOnInputsHash: varchar("basedOnInputsHash", { length: 64 }),
    confidence: mysqlEnum("confidence", SUGGESTION_CONFIDENCE),
    /** AI rows: model, prompt version, tokens, estimated cost, evidence basis. */
    generationMeta: json("generationMeta").$type<GenerationMeta>(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("idx_personalization_items_profile_kind_status").on(
      t.socialProfileId,
      t.workspaceId,
      t.kind,
      t.status
    ),
    index("idx_personalization_items_workspace").on(t.workspaceId),
    index("idx_personalization_items_run").on(
      t.analysisRunId,
      t.socialProfileId
    ),
    index("idx_personalization_items_supersedes").on(t.supersedesItemId),
    foreignKey({
      name: "fk_personalization_items_profile",
      columns: [t.socialProfileId, t.workspaceId],
      foreignColumns: [socialProfiles.id, socialProfiles.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_personalization_items_run",
      columns: [t.analysisRunId, t.socialProfileId],
      foreignColumns: [
        profileAnalysisRuns.id,
        profileAnalysisRuns.socialProfileId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_personalization_items_created_by",
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    check(
      "chk_personalization_items_performance_run",
      sql`${t.evidence} <> 'performance_backed' OR ${t.analysisRunId} IS NOT NULL`
    ),
    check(
      "chk_personalization_items_no_invented_numbers",
      sql`${t.kind} <> 'pillar' OR ${t.evidence} = 'performance_backed' OR JSON_TYPE(JSON_EXTRACT(${t.payload}, '$.viewSharePercent')) IS NULL OR JSON_TYPE(JSON_EXTRACT(${t.payload}, '$.viewSharePercent')) = 'NULL'`
    ),
    check(
      "chk_personalization_items_dismissed",
      sql`(${t.status} = 'dismissed') = (${t.dismissedAtVersion} IS NOT NULL)`
    ),
    check(
      "chk_personalization_items_confidence",
      sql`${t.confidence} IS NULL OR ${t.source} = 'ai_suggested'`
    ),
  ]
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
  t => [
    index("idx_personalization_progress_workspace").on(t.workspaceId),
    index("idx_personalization_progress_profile_ws").on(
      t.socialProfileId,
      t.workspaceId
    ),
    foreignKey({
      name: "fk_personalization_progress_profile",
      columns: [t.socialProfileId, t.workspaceId],
      foreignColumns: [socialProfiles.id, socialProfiles.workspaceId],
    }).onDelete("restrict"),
    check(
      "chk_personalization_progress_version",
      sql`${t.personalizationVersion} >= 1`
    ),
  ]
);

export type SocialProfile = typeof socialProfiles.$inferSelect;
export type PersonalizationItemRow = typeof personalizationItems.$inferSelect;
export type PersonalizationProgressRow =
  typeof personalizationProgress.$inferSelect;
export type ProfileAnalysisRun = typeof profileAnalysisRuns.$inferSelect;
export type UserOnboardingAnswers = typeof userOnboardingAnswers.$inferSelect;
