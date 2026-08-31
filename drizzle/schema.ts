import {
  bigint,
  boolean,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** Last authenticated request or client heartbeat. */
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  /** IANA timezone from Viral Posts client (e.g. America/Chicago). */
  timezone: varchar("timezone", { length: 64 }),
  /** Distinct calendar days (UTC) with at least one authenticated visit. */
  visitCount: int("visitCount").default(0).notNull(),
  /** YYYY-MM-DD (UTC) of the last day that incremented visitCount. */
  lastVisitCountedOn: varchar("lastVisitCountedOn", { length: 10 }),
  /** Cumulative foreground time reported by the client heartbeat. */
  totalActiveSeconds: int("totalActiveSeconds").default(0).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  // Onboarding state — first-run experience flags (welcome modal,
  // 3-step hint card, completed first spy, demo banner). `demoSeededAt`
  // is set once on signup if we pre-populate a demo scrape job so the
  // dashboard isn't empty on arrival (spec §3). `hasCompletedFirstSpy`
  // is flipped server-side when a scrape job completes (deferred to
  // Section 3 — not pre-wired here).
  hasSeenWelcome: boolean("hasSeenWelcome").default(false).notNull(),
  hasDismissedHintCard: boolean("hasDismissedHintCard").default(false).notNull(),
  hasCompletedFirstSpy: boolean("hasCompletedFirstSpy").default(false).notNull(),
  hasDismissedDemoBanner: boolean("hasDismissedDemoBanner").default(false).notNull(),
  demoSeededAt: datetime("demoSeededAt", { mode: "date" }),
  // Onboarding flow state (Section 3). `selectedNicheSlugs` stores the
  // niches picked on /onboarding Step 1 as a JSON array of slugs; it
  // feeds future recommendation surfaces. `onboardingCompletedAt` and
  // `onboardingSkippedAt` are mutually exclusive in practice — the
  // OnboardingGate component uses either being non-null as the signal
  // to bypass the /onboarding redirect.
  selectedNicheSlugs: json("selectedNicheSlugs").$type<string[]>(),
  /** Up to 5 creator handles (Step 2 multi-select) for personalization; demo job seeds the first only. */
  selectedCreatorHandles: json("selectedCreatorHandles").$type<string[] | null>(),
  businessDescription: varchar("businessDescription", { length: 1000 }),
  targetAudience: varchar("targetAudience", { length: 1000 }),
  /** Optional Instagram @handle for carousel slide watermark overlays. */
  instagramHandle: varchar("instagramHandle", { length: 64 }),
  onboardingCompletedAt: datetime("onboardingCompletedAt", { mode: "date" }),
  onboardingSkippedAt: datetime("onboardingSkippedAt", { mode: "date" }),
  /** First-touch marketing attribution (set once on signup). */
  utmSource: varchar("utmSource", { length: 255 }),
  utmMedium: varchar("utmMedium", { length: 255 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  utmTerm: varchar("utmTerm", { length: 255 }),
  utmContent: varchar("utmContent", { length: 255 }),
  firstReferrer: text("firstReferrer"),
  /** Heuristic + manual: QA fixtures, disposable domains, etc. */
  isTestAccount: boolean("isTestAccount").default(false).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Per-user daily visits and foreground time (UTC date keys). */
export const userActivityDaily = mysqlTable(
  "user_activity_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    activityDate: varchar("activityDate", { length: 10 }).notNull(),
    visitDay: int("visitDay").default(0).notNull(),
    activeSeconds: int("activeSeconds").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userDateUnique: uniqueIndex("user_activity_daily_user_date").on(
      table.userId,
      table.activityDate
    ),
    dateIdx: index("user_activity_daily_date").on(table.activityDate),
  })
);

export type UserActivityDaily = typeof userActivityDaily.$inferSelect;

/**
 * Scrape jobs track each scraping request for an Instagram handle.
 */
export const scrapeJobs = mysqlTable(
  "scrape_jobs",
  {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  handle: varchar("handle", { length: 128 }).notNull(),
  timeframeDays: int("timeframeDays").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  totalReels: int("totalReels").default(0).notNull(),
  /** Reels posted inside the user-selected spy window (excludes older backfill). */
  reelsInWindow: int("reelsInWindow"),
  followerCount: int("followerCount").default(0).notNull(),
  profilePicUrl: text("profilePicUrl"),
  errorMessage: text("errorMessage"),
  // Set on terminal failure; cleared on success or when a retry starts.
  failureReason: mysqlEnum("failureReason", [
    "handle_not_found",
    "account_private",
    "instagram_rate_limited",
    "account_too_large",
    "unknown",
  ]),
  // Fine-grained progress for the dedicated scraping UI. Values map to the
  // 5 stages of the pipeline: pending → connecting → fetching_profile →
  // pulling_reels → ranking → complete, with `failed` as a terminal error.
  currentStep: varchar("currentStep", { length: 32 }).default("pending").notNull(),
  reelsFound: int("reelsFound").default(0).notNull(),
  estimatedTotal: int("estimatedTotal").default(30).notNull(),
  progressPercent: int("progressPercent").default(0).notNull(),
  // Classification cache — populated by featured.classifyHandle for
  // arbitrary (non-featured) handles so the dashboard can show the
  // "AI ✦" niche badge and pull related creators without re-spending
  // an LLM call on every page load. All three are NULL until the
  // classification runs for this job.
  classifiedNicheSlug: varchar("classifiedNicheSlug", { length: 64 }),
  classifiedConfidence: mysqlEnum("classifiedConfidence", ["high", "medium", "low"]),
  classifiedAt: datetime("classifiedAt", { mode: "date" }),
  // True when this scrape_jobs row was created by the signup demo-seed
  // path (Section 3). Used by the dashboard's demo banner visibility
  // check (spec §7.4) and the hasCompletedFirstSpy auto-flip guard.
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_scrape_jobs_workspace").on(table.workspaceId),
  })
);

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = typeof scrapeJobs.$inferInsert;

/**
 * Scrape jobs track each scraping request for a TikTok handle.
 */
export const tiktokScrapeJobs = mysqlTable(
  "tiktok_scrape_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    handle: varchar("handle", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    timeframeDays: int("timeframeDays"),
    totalVideos: int("totalVideos").default(0).notNull(),
    followerCount: int("followerCount").default(0).notNull(),
    profilePicUrl: text("profilePicUrl"),
    errorMessage: text("errorMessage"),
    currentStep: varchar("currentStep", { length: 32 }).default("pending").notNull(),
    videosFound: int("videosFound").default(0).notNull(),
    estimatedTotal: int("estimatedTotal").default(30).notNull(),
    progressPercent: int("progressPercent").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_tiktok_scrape_jobs_workspace").on(table.workspaceId),
  })
);

export type TikTokScrapeJob = typeof tiktokScrapeJobs.$inferSelect;
export type InsertTikTokScrapeJob = typeof tiktokScrapeJobs.$inferInsert;

/**
 * Individual TikTok videos collected from a scrape job.
 */
export const tiktokVideos = mysqlTable(
  "tiktok_videos",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    awemeId: varchar("awemeId", { length: 64 }).notNull(),
    caption: text("caption"),
    viewCount: bigint("viewCount", { mode: "number" }).default(0).notNull(),
    likeCount: int("likeCount").default(0).notNull(),
    commentCount: int("commentCount").default(0).notNull(),
    shareCount: int("shareCount").default(0).notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    videoUrl: text("videoUrl"),
    videoPageUrl: varchar("videoPageUrl", { length: 512 }).notNull(),
    durationSec: int("durationSec"),
    postedAt: timestamp("postedAt").notNull(),
    ownerUsername: varchar("ownerUsername", { length: 128 }),
    /** True when row is older than the spy window (min-sample backfill). */
    outsideSpyWindow: boolean("outsideSpyWindow"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_tiktok_videos_workspace").on(table.workspaceId),
    jobIdx: index("idx_tiktok_videos_job").on(table.jobId),
  })
);

export type TikTokVideo = typeof tiktokVideos.$inferSelect;
export type InsertTikTokVideo = typeof tiktokVideos.$inferInsert;

/**
 * Scrape jobs track each scraping request for a YouTube channel handle.
 */
export const youtubeScrapeJobs = mysqlTable(
  "youtube_scrape_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    handle: varchar("handle", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    timeframeDays: int("timeframeDays"),
    totalVideos: int("totalVideos").default(0).notNull(),
    subscriberCount: int("subscriberCount").default(0).notNull(),
    profilePicUrl: text("profilePicUrl"),
    errorMessage: text("errorMessage"),
    currentStep: varchar("currentStep", { length: 32 }).default("pending").notNull(),
    videosFound: int("videosFound").default(0).notNull(),
    estimatedTotal: int("estimatedTotal").default(30).notNull(),
    progressPercent: int("progressPercent").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_youtube_scrape_jobs_workspace").on(table.workspaceId),
  })
);

export type YouTubeScrapeJob = typeof youtubeScrapeJobs.$inferSelect;
export type InsertYouTubeScrapeJob = typeof youtubeScrapeJobs.$inferInsert;

/**
 * Individual YouTube Shorts collected from a scrape job.
 * Thumbnails are permanent public URLs; no R2 mirroring.
 */
export const youtubeVideos = mysqlTable(
  "youtube_videos",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    videoId: varchar("videoId", { length: 32 }).notNull(),
    title: text("title"),
    description: text("description"),
    viewCount: bigint("viewCount", { mode: "number" }).default(0).notNull(),
    likeCount: int("likeCount").default(0).notNull(),
    commentCount: int("commentCount").default(0).notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    videoPageUrl: varchar("videoPageUrl", { length: 512 }).notNull(),
    durationSec: int("durationSec"),
    postedAt: timestamp("postedAt").notNull(),
    ownerHandle: varchar("ownerHandle", { length: 128 }),
    /** True when row is older than the spy window (min-sample backfill). */
    outsideSpyWindow: boolean("outsideSpyWindow"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_youtube_videos_workspace").on(table.workspaceId),
    jobIdx: index("idx_youtube_videos_job").on(table.jobId),
  })
);

export type YouTubeVideo = typeof youtubeVideos.$inferSelect;
export type InsertYouTubeVideo = typeof youtubeVideos.$inferInsert;

/**
 * Background Excel export jobs for a scrape session. Files are cached on R2
 * so users can re-download without re-running transcription or export credits.
 */
export const exportJobs = mysqlTable(
  "export_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scrapeJobId: int("scrapeJobId").notNull(),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"])
      .default("pending")
      .notNull(),
    currentStep: mysqlEnum("currentStep", [
      "pending",
      "transcribing",
      "analyzing",
      "building_excel",
      "complete",
      "failed",
    ])
      .default("pending")
      .notNull(),
    progressPercent: int("progressPercent").default(0).notNull(),
    stepDone: int("stepDone").default(0).notNull(),
    stepTotal: int("stepTotal").default(0).notNull(),
    progressLabel: varchar("progressLabel", { length: 255 }),
    fileR2Key: text("fileR2Key"),
    filename: varchar("filename", { length: 255 }),
    fileSizeBytes: int("fileSizeBytes"),
    reelCountAtExport: int("reelCountAtExport"),
    exportScope: mysqlEnum("exportScope", ["all", "top_viral_30"])
      .default("all")
      .notNull(),
    errorMessage: text("errorMessage"),
    expiresAt: timestamp("expiresAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scrapeJobIdx: index("idx_export_jobs_scrape_job").on(table.scrapeJobId),
    workspaceIdx: index("idx_export_jobs_workspace").on(table.workspaceId),
  })
);

export type ExportJob = typeof exportJobs.$inferSelect;
export type InsertExportJob = typeof exportJobs.$inferInsert;

/**
 * Individual reels collected from a scrape job.
 */
export const reels = mysqlTable(
  "reels",
  {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  shortcode: varchar("shortcode", { length: 64 }).notNull(),
  caption: text("caption"),
  viewCount: bigint("viewCount", { mode: "number" }).default(0).notNull(),
  likeCount: int("likeCount").default(0).notNull(),
  commentCount: int("commentCount").default(0).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  videoUrl: text("videoUrl"),
  reelUrl: varchar("reelUrl", { length: 512 }).notNull(),
  duration: int("duration"),
  postedAt: timestamp("postedAt").notNull(),
  ownerUsername: varchar("ownerUsername", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Bug #57 Tier 2: AI classification cache (nullable until classifier runs). */
  contentType: mysqlEnum("contentType", [
    "educational",
    "story",
    "opinion",
    "personal",
    "reaction",
    "skit",
    "music",
    "other",
  ]),
  remakeabilityScore: tinyint("remakeabilityScore"),
  confidence: tinyint("confidence", { unsigned: true }),
  suggestedAction: mysqlEnum("suggestedAction", ["make_version", "save_inspiration", "view_only"]),
  classificationReason: varchar("classificationReason", { length: 255 }),
  classifiedAt: timestamp("classifiedAt"),
  niche: mysqlEnum("niche", [
    "real_estate",
    "fitness",
    "food",
    "beauty",
    "business",
    "finance",
    "marketing",
    "parenting",
    "travel",
    "fashion",
    "tech",
    "education",
    "lifestyle",
    "spirituality",
    "hospitality",
  ]),
  secondaryNiche: mysqlEnum("secondaryNiche", [
    "real_estate",
    "fitness",
    "food",
    "beauty",
    "business",
    "finance",
    "marketing",
    "parenting",
    "travel",
    "fashion",
    "tech",
    "education",
    "lifestyle",
    "spirituality",
    "hospitality",
  ]),
  hookPattern: mysqlEnum("hookPattern", [
    "question",
    "stat",
    "contrarian",
    "story",
    "direct_promise",
    "pov",
    "confession",
    "listicle",
    "comparison",
    "mistake_reveal",
  ]),
  retentionTactics: json("retentionTactics").$type<string[] | null>(),
  threeSecondHoldRate: decimal("threeSecondHoldRate", { precision: 5, scale: 2 }),
  completionRate: decimal("completionRate", { precision: 5, scale: 2 }),
  engagementRate: decimal("engagementRate", { precision: 5, scale: 4 }),
  viralFlag: boolean("viralFlag").default(false).notNull(),
  /** How the reel was filmed (talking head, b-roll, etc.). Set by classifier. */
  productionFormat: mysqlEnum("productionFormat", [
    "talking_head",
    "b_roll_voiceover",
    "text_on_screen",
    "screen_recording",
    "montage",
    "skit_multi_person",
    "music_dance",
    "other",
  ]),
  /** Visible text on the cover thumbnail (vision/OCR). */
  thumbnailText: varchar("thumbnailText", { length: 512 }),
  },
  (table) => ({
    workspaceIdx: index("idx_reels_workspace").on(table.workspaceId),
  })
);

export type Reel = typeof reels.$inferSelect;
export type InsertReel = typeof reels.$inferInsert;

/**
 * Transcriptions generated on-demand for individual reels.
 *
 * Exactly one of (`reelId`, `featuredReelId`, `tiktokVideoId`, `youtubeVideoId`)
 * must be non-null. This is enforced at the application layer (see `transcribe.*`
 * handlers) since MySQL can't express a cheap "xor" CHECK on nullable columns
 * without function dependencies. `reelId` points at `reels.id` (user-scraped),
 * `featuredReelId` at `featured_reels.id` (catalog), `tiktokVideoId` at
 * `tiktok_videos.id`, and `youtubeVideoId` at `youtube_videos.id`.
 *
 * `workspaceId` stays nullable forever: backfill copies reels.workspaceId
 * when reelId IS NOT NULL; featured-only rows keep workspaceId NULL.
 */
export const transcriptions = mysqlTable(
  "transcriptions",
  {
  id: int("id").autoincrement().primaryKey(),
  reelId: int("reelId"),
  featuredReelId: int("featuredReelId"),
  tiktokVideoId: int("tiktokVideoId"),
  youtubeVideoId: int("youtubeVideoId"),
  workspaceId: varchar("workspaceId", { length: 36 }).references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  transcript: text("transcript"),
  segments: json("segments"),
  hookAnalysis: text("hookAnalysis"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  /** Set when the user requested transcription. `startedAt` is set when the worker run begins (after the concurrency wait). */
  queuedAt: timestamp("queuedAt"),
  startedAt: timestamp("startedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_transcriptions_workspace").on(table.workspaceId),
  })
);

export type Transcription = typeof transcriptions.$inferSelect;
export type InsertTranscription = typeof transcriptions.$inferInsert;

/**
 * Re-created scripts generated from viral reel structures.
 *
 * Exactly one of (`reelId`, `featuredReelId`, `tiktokVideoId`, `youtubeVideoId`)
 * must be non-null. enforced in the `recreate.*` handlers.
 */
export const recreatedScripts = mysqlTable(
  "recreated_scripts",
  {
  id: int("id").autoincrement().primaryKey(),
  reelId: int("reelId"),
  featuredReelId: int("featuredReelId"),
  tiktokVideoId: int("tiktokVideoId"),
  youtubeVideoId: int("youtubeVideoId"),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  topic: text("topic").notNull(),
  gradeLevel: varchar("gradeLevel", { length: 16 }).notNull(), // "auto", "2", "3", "4", "5", "6"
  viralStructure: json("viralStructure"), // { hook, body, transition, cta } analysis
  generatedScript: text("generatedScript"),
  readabilityAnalysis: json("readabilityAnalysis"), // Hemingway-style analysis results
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_recreated_scripts_workspace").on(table.workspaceId),
  })
);

export type RecreatedScript = typeof recreatedScripts.$inferSelect;
export type InsertRecreatedScript = typeof recreatedScripts.$inferInsert;

/**
 * Saved/bookmarked reels for quick access.
 *
 * Exactly one of the ID sources must be populated:
 *   - user-scraped: (`reelId` + `jobId`) both non-null; other ID cols null.
 *   - featured catalog: `featuredReelId` non-null; other ID cols null.
 *   - TikTok: `tiktokVideoId` non-null; other ID cols null.
 *   - YouTube: `youtubeVideoId` non-null; other ID cols null.
 * Enforced in the `saved.toggle` handler.
 */
export const savedReels = mysqlTable(
  "saved_reels",
  {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  reelId: int("reelId"),
  jobId: int("jobId"),
  featuredReelId: int("featuredReelId"),
  tiktokVideoId: int("tiktokVideoId"),
  youtubeVideoId: int("youtubeVideoId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_saved_reels_workspace").on(table.workspaceId),
    workspaceUserReelUnique: uniqueIndex("uniq_saved_reels_workspace_user_reel").on(
      table.workspaceId,
      table.userId,
      table.reelId
    ),
    workspaceUserFeaturedUnique: uniqueIndex("uniq_saved_reels_workspace_user_featured").on(
      table.workspaceId,
      table.userId,
      table.featuredReelId
    ),
    workspaceUserTiktokUnique: uniqueIndex("uniq_saved_reels_workspace_user_tiktok").on(
      table.workspaceId,
      table.userId,
      table.tiktokVideoId
    ),
    workspaceUserYoutubeUnique: uniqueIndex("uniq_saved_reels_workspace_user_youtube").on(
      table.workspaceId,
      table.userId,
      table.youtubeVideoId
    ),
  })
);

export type SavedReel = typeof savedReels.$inferSelect;
export type InsertSavedReel = typeof savedReels.$inferInsert;

/**
 * Tags for organizing scripts (default stages + custom user tags).
 */
export const scriptTags = mysqlTable(
  "script_tags",
  {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).notNull(), // hex color like #7c3aed
  isDefault: int("isDefault").default(0).notNull(), // 1 = system default stage tag
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_script_tags_workspace").on(table.workspaceId),
  })
);

export type ScriptTag = typeof scriptTags.$inferSelect;
export type InsertScriptTag = typeof scriptTags.$inferInsert;

/**
 * Saved scripts in the user's library with metadata.
 */
export const savedScripts = mysqlTable(
  "saved_scripts",
  {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  reelId: int("reelId"), // optional - linked to original reel
  recreatedScriptId: int("recreatedScriptId"), // optional - linked to recreated script
  coachScriptId: int("coachScriptId"), // optional - structured AI Coach / Studio script
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(), // current script text
  originalContent: text("originalContent"), // original AI-generated text for reference
  sourceHandle: varchar("sourceHandle", { length: 128 }), // @handle it was inspired by
  gradeLevel: varchar("gradeLevel", { length: 16 }),
  wordCount: int("wordCount").default(0).notNull(),
  postDate: timestamp("postDate"), // planned post date
  postTime: varchar("postTime", { length: 8 }), // preferred posting time HH:MM
  status: mysqlEnum("status", ["draft", "approved"]).default("draft").notNull(),
  notes: text("notes"),
  generatedCaption: text("generatedCaption"),
  generatedHashtags: text("generatedHashtags"),
  captionStyle: varchar("captionStyle", { length: 32 }),
  sourceWorkspaceId: varchar("sourceWorkspaceId", { length: 36 }),
  sourceScriptId: int("sourceScriptId"),
  sentByUserId: int("sentByUserId"),
  sentAt: timestamp("sentAt"),
  senderNote: text("senderNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_saved_scripts_workspace").on(table.workspaceId),
    sourceWorkspaceIdx: index("idx_saved_scripts_source_workspace").on(
      table.sourceWorkspaceId
    ),
    workspaceUserReelUnique: uniqueIndex("uniq_saved_scripts_workspace_user_reel").on(
      table.workspaceId,
      table.userId,
      table.reelId
    ),
    workspaceUserRecreatedUnique: uniqueIndex("uniq_saved_scripts_workspace_user_recreated").on(
      table.workspaceId,
      table.userId,
      table.recreatedScriptId
    ),
    coachScriptIdx: index("idx_saved_scripts_coach_script").on(table.coachScriptId),
  })
);

export type SavedScript = typeof savedScripts.$inferSelect;
export type InsertSavedScript = typeof savedScripts.$inferInsert;

/**
 * Many-to-many relationship between scripts and tags.
 */
export const scriptTagAssignments = mysqlTable(
  "script_tag_assignments",
  {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_script_tag_assignments_workspace").on(table.workspaceId),
  })
);

export type ScriptTagAssignment = typeof scriptTagAssignments.$inferSelect;
export type InsertScriptTagAssignment = typeof scriptTagAssignments.$inferInsert;

/**
 * Version history for scripts - each edit/rewrite creates a new version.
 */
export const scriptVersions = mysqlTable(
  "script_versions",
  {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  content: text("content").notNull(),
  versionNumber: int("versionNumber").notNull(),
  changeType: mysqlEnum("changeType", ["initial", "manual_edit", "ai_rewrite", "grammar_fix"]).default("initial").notNull(),
  changeDescription: text("changeDescription"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_script_versions_workspace").on(table.workspaceId),
  })
);

export type ScriptVersion = typeof scriptVersions.$inferSelect;
export type InsertScriptVersion = typeof scriptVersions.$inferInsert;

/**
 * User preferences (timezone, etc.).
 */
export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  timezone: varchar("timezone", { length: 64 }).default("America/Chicago").notNull(), // IANA timezone, default CST
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;

/**
 * User subscriptions for extension paywall.
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  plan: mysqlEnum("plan", ["free", "starter", "pro", "business", "agency"]).default("free").notNull(),
  billingInterval: mysqlEnum("billingInterval", ["monthly", "yearly"]).default("monthly"),
  stripeCustomerId: varchar("stripeCustomerId", { length: 256 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 256 }),
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing"]).default("active").notNull(),
  cancelAtPeriodEnd: int("cancelAtPeriodEnd").default(0),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Daily usage tracking for extension freemium limits.
 */
export const extensionUsage = mysqlTable("extension_usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  usageDate: varchar("usageDate", { length: 10 }).notNull(), // YYYY-MM-DD
  transcribeCount: int("transcribeCount").default(0).notNull(),
  remakeCount: int("remakeCount").default(0).notNull(),
  saveCount: int("saveCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExtensionUsage = typeof extensionUsage.$inferSelect;
export type InsertExtensionUsage = typeof extensionUsage.$inferInsert;

/**
 * Extension API tokens for authenticating Chrome extension requests.
 */
export const extensionTokens = mysqlTable("extension_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 256 }).notNull().unique(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExtensionToken = typeof extensionTokens.$inferSelect;
export type InsertExtensionToken = typeof extensionTokens.$inferInsert;

/**
 * Monthly usage tracking for feature limits per billing cycle.
 */
export const monthlyUsage = mysqlTable("monthly_usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  usageMonth: varchar("usageMonth", { length: 7 }).notNull(), // YYYY-MM
  scrapeCount: int("scrapeCount").default(0).notNull(),
  searchCount: int("searchCount").default(0).notNull(),
  transcribeCount: int("transcribeCount").default(0).notNull(),
  recreateCount: int("recreateCount").default(0).notNull(),
  rewriteCount: int("rewriteCount").default(0).notNull(),
  exportCount: int("exportCount").default(0).notNull(),
  /** Successful B-roll suggestion runs this month (not clip downloads). */
  brollGenerationCount: int("brollGenerationCount").default(0).notNull(),
  extensionSortCount: int("extensionSortCount").default(0).notNull(),
  extensionSaveCount: int("extensionSaveCount").default(0).notNull(),
  extensionTranscribeCount: int("extensionTranscribeCount").default(0).notNull(),
  extensionRecreateCount: int("extensionRecreateCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MonthlyUsage = typeof monthlyUsage.$inferSelect;
export type InsertMonthlyUsage = typeof monthlyUsage.$inferInsert;

/**
 * Blog posts for SEO content marketing and product updates.
 */
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  authorId: int("authorId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  slug: varchar("slug", { length: 512 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImageUrl: text("coverImageUrl"),
  tags: json("tags").$type<string[]>().default([]),
  metaTitle: varchar("metaTitle", { length: 512 }),
  metaDescription: text("metaDescription"),
  status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
  publishedAt: timestamp("publishedAt"),
  canonicalUrl: varchar("canonicalUrl", { length: 1024 }),
  ogImageUrl: text("ogImageUrl"),
  noIndex: boolean("noIndex").default(false).notNull(),
  sourceKeyword: varchar("sourceKeyword", { length: 255 }),
  generatedByAi: boolean("generatedByAi").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/**
 * Telegram bot connections - links a user's SpyReels account to their Telegram chat.
 */
export const telegramConnections = mysqlTable("telegram_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }), // Telegram chat ID (set after linking)
  telegramUsername: varchar("telegramUsername", { length: 128 }), // Telegram @username
  linkCode: varchar("linkCode", { length: 32 }).notNull().unique(), // 6-char code for linking
  linkCodeExpiresAt: timestamp("linkCodeExpiresAt").notNull(), // code expires after 10 minutes
  isConnected: int("isConnected").default(0).notNull(), // 1 = linked, 0 = pending
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TelegramConnection = typeof telegramConnections.$inferSelect;
export type InsertTelegramConnection = typeof telegramConnections.$inferInsert;

/**
 * Collected reels - reels sent via Telegram bot or other collection methods.
 * These are standalone (not tied to a scrape job) and can be transcribed/re-created.
 */
export const collectedReels = mysqlTable(
  "collected_reels",
  {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  /** instagram | tiktok | youtube — shortcode holds platform external id */
  platform: varchar("platform", { length: 16 }).default("instagram").notNull(),
  shortcode: varchar("shortcode", { length: 64 }).notNull(),
  caption: text("caption"),
  viewCount: bigint("viewCount", { mode: "number" }).default(0).notNull(),
  likeCount: int("likeCount").default(0).notNull(),
  commentCount: int("commentCount").default(0).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  videoUrl: text("videoUrl"),
  reelUrl: varchar("reelUrl", { length: 512 }).notNull(),
  duration: int("duration"),
  postedAt: timestamp("postedAt"),
  ownerUsername: varchar("ownerUsername", { length: 128 }),
  ownerFullName: varchar("ownerFullName", { length: 256 }),
  ownerProfilePicUrl: text("ownerProfilePicUrl"),
  ownerFollowerCount: int("ownerFollowerCount").default(0),
  source: mysqlEnum("source", ["telegram", "url_paste", "extension"]).default("telegram").notNull(),
  status: mysqlEnum("status", ["pending", "ready", "failed"]).default("pending").notNull(), // pending = fetching metadata
  errorMessage: text("errorMessage"),
  fetchAttempts: int("fetchAttempts").default(0).notNull(),
  lastFetchAt: timestamp("lastFetchAt"),
  nextFetchAt: timestamp("nextFetchAt"),
  fetchProvider: varchar("fetchProvider", { length: 64 }),
  transcriptionReelId: int("transcriptionReelId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_collected_reels_workspace").on(table.workspaceId),
    workspacePlatformShortcodeIdx: index(
      "idx_collected_reels_workspace_platform_shortcode"
    ).on(table.workspaceId, table.platform, table.shortcode),
    ingestDueIdx: index("idx_collected_reels_ingest_due").on(
      table.status,
      table.nextFetchAt,
      table.fetchAttempts
    ),
  })
);

export type CollectedReel = typeof collectedReels.$inferSelect;
export type InsertCollectedReel = typeof collectedReels.$inferInsert;

/**
 * Script ideas - users submit topic ideas that get processed into full scripts in the background.
 * Acts as a "script factory" where ideas queue up and scripts are ready when users return.
 */
export const scriptIdeas = mysqlTable(
  "script_ideas",
  {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: varchar("workspaceId", { length: 36 })
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),
  idea: text("idea").notNull(), // The topic/idea text submitted by the user
  niche: varchar("niche", { length: 128 }), // Optional niche/category hint
  tone: varchar("tone", { length: 64 }).default("engaging"), // casual, professional, humorous, educational, engaging
  gradeLevel: varchar("gradeLevel", { length: 16 }).default("auto"), // reading level
  filmingFormat: varchar("filmingFormat", { length: 128 }), // How the creator plans to film (talking head, b-roll, etc.)
  generatedScript: text("generatedScript"), // The AI-generated script
  generatedTitle: varchar("generatedTitle", { length: 256 }), // AI-generated title for the script
  viralStructure: json("viralStructure"), // Hook/body/CTA structure
  savedScriptId: int("savedScriptId"), // Link to saved_scripts once user saves it
  // AI validation step
  aiSuggestion: text("aiSuggestion"), // AI's improved version of the idea
  aiReasoning: text("aiReasoning"), // Why AI suggested changes
  viralScore: int("viralScore"), // 1-10 viral potential score
  validationStatus: mysqlEnum("validationStatus", ["pending", "validated", "accepted", "rejected", "edited"]).default("pending"),
  // Audio/video source
  audioUrl: varchar("audioUrl", { length: 1024 }), // S3 URL of recorded audio
  inputMethod: mysqlEnum("inputMethod", ["text", "voice", "video"]).default("text"),
  status: mysqlEnum("status", ["queued", "validating", "awaiting_approval", "processing", "completed", "failed"]).default("queued").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_script_ideas_workspace").on(table.workspaceId),
  })
);

export type ScriptIdea = typeof scriptIdeas.$inferSelect;
export type InsertScriptIdea = typeof scriptIdeas.$inferInsert;

/** 30-day content plan idea cards (BrandScript-style plan board). */
export const planCards = mysqlTable(
  "plan_cards",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    day: int("day").notNull(),
    funnelStage: varchar("funnelStage", { length: 16 }).notNull(),
    contentFormat: varchar("contentFormat", { length: 32 }).notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    angle: text("angle").notNull(),
    filmingLocation: text("filmingLocation").notNull(),
    researchSignal: text("researchSignal"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    goal: varchar("goal", { length: 32 }),
    /** ai_pick = SpyReels calendar card; user_spark = Spark Deck capture */
    sourceType: varchar("sourceType", { length: 16 }).notNull().default("ai_pick"),
    sourceReelId: int("sourceReelId"),
    sourceFeaturedReelId: int("sourceFeaturedReelId"),
    sourceReelHandle: varchar("sourceReelHandle", { length: 128 }),
    userRawNote: text("userRawNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_plan_cards_workspace").on(table.workspaceId),
  })
);

export type PlanCard = typeof planCards.$inferSelect;
export type InsertPlanCard = typeof planCards.$inferInsert;

/** Cached Reddit / Quora / web audience questions per workspace niche. */
export const audienceSignals = mysqlTable(
  "audience_signals",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    nicheSlug: varchar("nicheSlug", { length: 64 }).notNull(),
    source: mysqlEnum("source", ["reddit", "quora", "web"]).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    snippet: text("snippet"),
    sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
    score: int("score").default(0).notNull(),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceNicheIdx: index("idx_audience_signals_workspace_niche").on(
      table.workspaceId,
      table.nicheSlug
    ),
  })
);

export type AudienceSignal = typeof audienceSignals.$inferSelect;
export type InsertAudienceSignal = typeof audienceSignals.$inferInsert;

/** AI Coach HEIT scripts (separate from saved_scripts library). */
export const coachScripts = mysqlTable(
  "coach_scripts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planCardId: int("planCardId"),
    title: varchar("title", { length: 256 }).notNull(),
    hook: text("hook").notNull(),
    body: text("body").notNull(),
    callToAction: text("callToAction").notNull(),
    platform: varchar("platform", { length: 32 }).notNull().default("both"),
    tone: varchar("tone", { length: 64 }).notNull().default("conversational"),
    estimatedDuration: varchar("estimatedDuration", { length: 64 }),
    contentType: varchar("contentType", { length: 64 }),
    contentFormat: varchar("contentFormat", { length: 64 }),
    formatLabel: varchar("formatLabel", { length: 128 }),
    productionNotes: text("productionNotes"),
    /** Async production-layer job for remake → Studio import. Null = legacy / sync paths. */
    productionNotesStatus: mysqlEnum("productionNotesStatus", [
      "pending",
      "processing",
      "completed",
      "failed",
    ]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_coach_scripts_workspace").on(table.workspaceId),
  })
);

export type CoachScript = typeof coachScripts.$inferSelect;
export type InsertCoachScript = typeof coachScripts.$inferInsert;

/* ────────────────────────────────────────────────────────────────────
 * Featured Accounts
 *
 * A curated catalog of Instagram creators grouped by niche. Unlike the
 * user-driven `scrape_jobs` flow, these accounts are scraped centrally
 * and served read-only to every user. Tables:
 *
 *   niches                    ← top-level catalog, grouped into
 *                                broader buckets (groupName)
 *   featured_accounts         ← the creator accounts themselves
 *   featured_account_niches   ← N:N junction (an account can sit in
 *                                multiple niches, one marked primary)
 *   featured_reels            ← top-N reels per account (rank 1-30)
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Niche catalog — structured taxonomy used to browse featured accounts.
 * `groupName` buckets niches into the 5 top-level tabs in the UI
 * (business-money, creator-economy, lifestyle, personal-family,
 * entertainment-culture). `iconName` is a lucide-react icon name.
 */
export const niches = mysqlTable("niches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  groupName: varchar("groupName", { length: 32 }).notNull(),
  iconName: varchar("iconName", { length: 32 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Niche = typeof niches.$inferSelect;
export type InsertNiche = typeof niches.$inferInsert;

/**
 * Featured creator accounts. Scraped on two cadences:
 *   - lastIncrementalScrape: cheap diff-style refresh
 *   - lastFullScrape:         periodic deep rebuild of the top reels
 */
export const featuredAccounts = mysqlTable("featured_accounts", {
  id: int("id").autoincrement().primaryKey(),
  handle: varchar("handle", { length: 128 }).notNull().unique(),
  displayName: varchar("displayName", { length: 256 }),
  followerCount: int("followerCount").default(0).notNull(),
  avgEngagementRate: decimal("avgEngagementRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  profilePicUrl: text("profilePicUrl"),
  bio: text("bio"),
  totalReelsEver: int("totalReelsEver").default(0).notNull(),
  lastIncrementalScrape: timestamp("lastIncrementalScrape"),
  lastFullScrape: timestamp("lastFullScrape"),
  /**
   * Precomputed best posting window (Commit 6 / migration 0030).
   * Populated by `scripts/backfill-best-posting-time.ts` which tallies
   * the day-of-week + hour-of-day of every `featured_reels.postedAt`.
   * UTC; the dashboard header formats to the user's timezone. Null
   * means "not enough data yet" — the header hides the segment.
   */
  bestPostingHour: int("bestPostingHour"),
  bestPostingDay: varchar("bestPostingDay", { length: 10 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeaturedAccount = typeof featuredAccounts.$inferSelect;
export type InsertFeaturedAccount = typeof featuredAccounts.$inferInsert;

/**
 * N:N join between featured_accounts and niches. `isPrimary` marks the
 * canonical niche for the account (used for single-niche UI contexts).
 * Composite PK on (accountId, nicheId) guarantees an account cannot be
 * tagged with the same niche twice.
 */
export const featuredAccountNiches = mysqlTable(
  "featured_account_niches",
  {
    accountId: int("accountId")
      .notNull()
      .references(() => featuredAccounts.id, { onDelete: "cascade" }),
    nicheId: int("nicheId")
      .notNull()
      .references(() => niches.id, { onDelete: "cascade" }),
    isPrimary: boolean("isPrimary").default(false).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.nicheId] }),
  })
);

export type FeaturedAccountNiche = typeof featuredAccountNiches.$inferSelect;
export type InsertFeaturedAccountNiche = typeof featuredAccountNiches.$inferInsert;

/**
 * Top-N reels per featured account. `rank` is 1..30 within an account's
 * scrape window. Unique (featuredAccountId, reelShortcode) prevents a
 * reel from appearing twice under the same account.
 */
export const featuredReels = mysqlTable(
  "featured_reels",
  {
    id: int("id").autoincrement().primaryKey(),
    featuredAccountId: int("featuredAccountId")
      .notNull()
      .references(() => featuredAccounts.id, { onDelete: "cascade" }),
    reelShortcode: varchar("reelShortcode", { length: 64 }).notNull(),
    caption: text("caption"),
    viewCount: int("viewCount").default(0).notNull(),
    likeCount: int("likeCount").default(0).notNull(),
    commentCount: int("commentCount").default(0).notNull(),
    engagementRate: decimal("engagementRate", { precision: 5, scale: 2 }),
    thumbnailUrl: text("thumbnailUrl"),
    videoUrl: text("videoUrl"),
    duration: int("duration"),
    postedAt: timestamp("postedAt").notNull(),
    rank: int("rank"),
    scrapedAt: timestamp("scrapedAt").defaultNow().notNull(),
    /**
     * Cached transcription for Path B (featured catalog). Populated by
     * the backfill script + lazy fallback in `transcribe.start`. Because
     * featured reels are a shared catalog, the transcript is computed
     * once and fanned out to all users who click "Transcribe" — no per-
     * user row in `transcriptions` for featured reels.
     *
     * `no_speech` is a valid terminal state (music/visual-only reel)
     * distinct from `failed` so the UI can show the right empty state.
     */
    transcriptionStatus: mysqlEnum("transcriptionStatus", [
      "pending",
      "processing",
      "completed",
      "failed",
      "no_speech",
    ])
      .default("pending")
      .notNull(),
    transcript: text("transcript"),
    transcriptSegments: json("transcriptSegments").$type<
      { start: number; end: number; text: string }[] | null
    >(),
    transcribedAt: timestamp("transcribedAt"),
    /** Bug #57 Tier 2: AI classification cache (nullable until classifier runs). */
    contentType: mysqlEnum("contentType", [
      "educational",
      "story",
      "opinion",
      "personal",
      "reaction",
      "skit",
      "music",
      "other",
    ]),
    remakeabilityScore: tinyint("remakeabilityScore"),
    suggestedAction: mysqlEnum("suggestedAction", ["make_version", "save_inspiration", "view_only"]),
    classificationReason: varchar("classificationReason", { length: 255 }),
    classifiedAt: timestamp("classifiedAt"),
    /** V1.3: mirrors user `reels` taxonomy when catalog reels are classified. */
    niche: mysqlEnum("niche", [
      "real_estate",
      "fitness",
      "food",
      "beauty",
      "business",
      "finance",
      "marketing",
      "parenting",
      "travel",
      "fashion",
      "tech",
      "education",
      "lifestyle",
      "spirituality",
      "hospitality",
    ]),
    hookPattern: mysqlEnum("hookPattern", [
      "question",
      "stat",
      "contrarian",
      "story",
      "direct_promise",
      "pov",
      "confession",
      "listicle",
      "comparison",
      "mistake_reveal",
    ]),
    confidence: tinyint("confidence", { unsigned: true }),
    viralFlag: boolean("viralFlag").default(false).notNull(),
    productionFormat: mysqlEnum("productionFormat", [
      "talking_head",
      "b_roll_voiceover",
      "text_on_screen",
      "screen_recording",
      "montage",
      "skit_multi_person",
      "music_dance",
      "other",
    ]),
    thumbnailText: varchar("thumbnailText", { length: 512 }),
  },
  (table) => ({
    reelPerAccountUnique: uniqueIndex("featured_reels_account_shortcode_unique").on(
      table.featuredAccountId,
      table.reelShortcode
    ),
  })
);

export type FeaturedReel = typeof featuredReels.$inferSelect;
export type InsertFeaturedReel = typeof featuredReels.$inferInsert;

/**
 * Brand Coach scores - cached AI viral-potential analysis per Reel.
 *
 * One row per (reelId) for user-scraped reels, or per (featuredReelId)
 * for the public catalog. The LLM verdict is deterministic for a given
 * reel so the cache is shared across users (cost saving).
 *
 * `requestedByUserId` records who triggered the first scoring so we can
 * attribute usage. The cache lookup keys are the reel ids only.
 */
export const brandCoachScores = mysqlTable(
  "brand_coach_scores",
  {
    id: int("id").autoincrement().primaryKey(),
    reelId: int("reelId"),
    featuredReelId: int("featuredReelId"),
    requestedByUserId: int("requestedByUserId").notNull(),
    overallScore: int("overallScore").notNull(),
    hookScore: int("hookScore").notNull(),
    retentionScore: int("retentionScore").notNull(),
    payoffScore: int("payoffScore").notNull(),
    /** How easy it is for a solo creator to copy the format (crew, budget, props). v2+ rubric. */
    replicabilityScore: int("replicabilityScore"),
    /** Bump when the scoring rubric changes; rows below current version are re-scored on demand. */
    scoreVersion: int("scoreVersion").default(1).notNull(),
    verdict: mysqlEnum("verdict", ["viral", "strong", "average", "weak"]).notNull(),
    strengths: json("strengths").$type<string[]>().notNull(),
    weaknesses: json("weaknesses").$type<string[]>().notNull(),
    suggestions: json("suggestions").$type<string[]>().notNull(),
    reasoning: text("reasoning").notNull(),
    /** Whether the LLM had a transcript when it scored. Drives the
     *  "transcribe for a sharper score" nudge in the UI. */
    usedTranscript: boolean("usedTranscript").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    reelUnique: uniqueIndex("brand_coach_scores_reel_unique").on(table.reelId),
    featuredReelUnique: uniqueIndex("brand_coach_scores_featured_reel_unique").on(
      table.featuredReelId
    ),
  })
);

export type BrandCoachScore = typeof brandCoachScores.$inferSelect;
export type InsertBrandCoachScore = typeof brandCoachScores.$inferInsert;

/** Snapshot of a blog post body and meta for admin version history. */
export const blogVersions = mysqlTable(
  "blog_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    blogPostId: int("blogPostId").notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    slug: varchar("slug", { length: 512 }).notNull(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    metaTitle: varchar("metaTitle", { length: 512 }),
    metaDescription: text("metaDescription"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("blog_versions_post_idx").on(table.blogPostId),
  })
);

export type BlogVersion = typeof blogVersions.$inferSelect;
export type InsertBlogVersion = typeof blogVersions.$inferInsert;

export const creatorViewEvents = mysqlTable(
  "creator_view_events",
  {
    id: int("id").autoincrement().primaryKey(),
    creatorHandle: varchar("creatorHandle", { length: 128 }).notNull(),
    viewerUserId: int("viewerUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    handleIdx: index("creator_view_events_handle_idx").on(table.creatorHandle),
    createdIdx: index("creator_view_events_created_idx").on(table.createdAt),
  })
);

export type CreatorViewEvent = typeof creatorViewEvents.$inferSelect;

export const nicheViewEvents = mysqlTable(
  "niche_view_events",
  {
    id: int("id").autoincrement().primaryKey(),
    nicheSlug: varchar("nicheSlug", { length: 128 }).notNull(),
    viewerUserId: int("viewerUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("niche_view_events_slug_idx").on(table.nicheSlug),
    createdIdx: index("niche_view_events_created_idx").on(table.createdAt),
  })
);

export type NicheViewEvent = typeof nicheViewEvents.$inferSelect;

export const keywordOpportunities = mysqlTable(
  "keyword_opportunities",
  {
    id: int("id").autoincrement().primaryKey(),
    keyword: varchar("keyword", { length: 255 }).notNull(),
    searchVolume: int("searchVolume"),
    difficulty: int("difficulty"),
    cpc: decimal("cpc", { precision: 8, scale: 2 }),
    weekStartDate: datetime("weekStartDate", { mode: "date" }),
    raw: json("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    weekIdx: index("keyword_opportunities_week_idx").on(table.weekStartDate),
  })
);

export type KeywordOpportunity = typeof keywordOpportunities.$inferSelect;

export const aiInsights = mysqlTable(
  "ai_insights",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 512 }).notNull(),
    body: text("body").notNull(),
    ctaPath: varchar("ctaPath", { length: 512 }),
    insightDate: datetime("insightDate", { mode: "date" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    dateIdx: index("ai_insights_date_idx").on(table.insightDate),
  })
);

export type AiInsight = typeof aiInsights.$inferSelect;

export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;

export const emailEvents = mysqlTable(
  "email_events",
  {
    id: int("id").autoincrement().primaryKey(),
    resendEmailId: varchar("resendEmailId", { length: 128 }),
    eventType: varchar("eventType", { length: 128 }).notNull(),
    recipient: varchar("recipient", { length: 320 }),
    templateSlug: varchar("templateSlug", { length: 64 }),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    resendIdx: index("email_events_resend_idx").on(table.resendEmailId),
    typeIdx: index("email_events_type_idx").on(table.eventType),
    templateIdx: index("email_events_template_idx").on(table.templateSlug),
    createdIdx: index("email_events_created_idx").on(table.createdAt),
  })
);

export type EmailEvent = typeof emailEvents.$inferSelect;

/** Daily SEO health check snapshot (Site Health tab). */
export const seoHealthSnapshots = mysqlTable(
  "seo_health_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    snapshotDate: date("snapshotDate", { mode: "date" }).notNull(),
    pageSpeedScore: int("pageSpeedScore"),
    schemaStatus: varchar("schemaStatus", { length: 32 }),
    cwvStatus: varchar("cwvStatus", { length: 32 }),
    sslStatus: varchar("sslStatus", { length: 32 }),
    indexabilityStatus: varchar("indexabilityStatus", { length: 32 }),
    recommendedAction: text("recommendedAction"),
    raw: json("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    snapshotDateUnique: uniqueIndex("seo_health_snapshots_date_unique").on(table.snapshotDate),
  })
);

export type SeoHealthSnapshot = typeof seoHealthSnapshots.$inferSelect;

export const gscDailyMetrics = mysqlTable(
  "gsc_daily_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    metricDate: date("metricDate", { mode: "date" }).notNull(),
    clicks: int("clicks").default(0).notNull(),
    impressions: int("impressions").default(0).notNull(),
    ctr: decimal("ctr", { precision: 8, scale: 6 }).default("0").notNull(),
    positionAvg: decimal("positionAvg", { precision: 6, scale: 2 }),
    topQueries: json("topQueries").$type<unknown[]>(),
    raw: json("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    metricDateUnique: uniqueIndex("gsc_daily_metrics_date_unique").on(table.metricDate),
    createdIdx: index("gsc_daily_metrics_created_idx").on(table.createdAt),
  })
);

export type GscDailyMetric = typeof gscDailyMetrics.$inferSelect;

export const bingDailyMetrics = mysqlTable(
  "bing_daily_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    metricDate: date("metricDate", { mode: "date" }).notNull(),
    clicks: int("clicks").default(0).notNull(),
    impressions: int("impressions").default(0).notNull(),
    ctr: decimal("ctr", { precision: 8, scale: 6 }).default("0").notNull(),
    positionAvg: decimal("positionAvg", { precision: 6, scale: 2 }),
    topQueries: json("topQueries").$type<unknown[]>(),
    raw: json("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    metricDateUnique: uniqueIndex("bing_daily_metrics_date_unique").on(table.metricDate),
    createdIdx: index("bing_daily_metrics_created_idx").on(table.createdAt),
  })
);

export type BingDailyMetric = typeof bingDailyMetrics.$inferSelect;

export const aiMentionPrompts = mysqlTable(
  "ai_mention_prompts",
  {
    id: int("id").autoincrement().primaryKey(),
    sortOrder: int("sortOrder").default(0).notNull(),
    body: text("body").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    sortIdx: index("ai_mention_prompts_sort_idx").on(table.sortOrder),
  })
);

export type AiMentionPrompt = typeof aiMentionPrompts.$inferSelect;

export const aiMentionRuns = mysqlTable(
  "ai_mention_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    promptId: int("promptId")
      .notNull()
      .references(() => aiMentionPrompts.id, { onDelete: "cascade" }),
    engine: varchar("engine", { length: 32 }).notNull(),
    responseText: text("responseText"),
    parsedScore: tinyint("parsedScore"),
    weekStartDate: date("weekStartDate", { mode: "date" }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    promptWeekIdx: index("ai_mention_runs_prompt_week_idx").on(table.promptId, table.weekStartDate),
    createdIdx: index("ai_mention_runs_created_idx").on(table.createdAt),
  })
);

export type AiMentionRun = typeof aiMentionRuns.$inferSelect;

export const botCrawlLog = mysqlTable(
  "bot_crawl_log",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    botFamily: varchar("botFamily", { length: 64 }).notNull(),
    userAgent: varchar("userAgent", { length: 512 }).notNull(),
    path: varchar("path", { length: 512 }).notNull(),
    method: varchar("method", { length: 16 }).default("GET").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    familyCreatedIdx: index("bot_crawl_log_family_created_idx").on(table.botFamily, table.createdAt),
    createdIdx: index("bot_crawl_log_created_idx").on(table.createdAt),
  })
);

export type BotCrawlLogRow = typeof botCrawlLog.$inferSelect;

export const sitemapSubmissions = mysqlTable(
  "sitemap_submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    channel: varchar("channel", { length: 32 }).notNull(),
    status: varchar("status", { length: 64 }).notNull(),
    detail: text("detail"),
    payload: json("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    channelCreatedIdx: index("sitemap_submissions_channel_created_idx").on(table.channel, table.createdAt),
  })
);

export type SitemapSubmission = typeof sitemapSubmissions.$inferSelect;

/**
 * Agency workspaces (V1). Workspace ids are UUID strings (varchar 36).
 * User references stay INT to match users.id. No slug column in V1.
 */
export const workspaces = mysqlTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    logoUrl: varchar("logoUrl", { length: 500 }),
    ownerUserId: int("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    plan: varchar("plan", { length: 20 }).default("free").notNull(),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 100 }),
    includedSeats: int("includedSeats").default(1).notNull(),
    isPersonal: boolean("isPersonal").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    ownerIdx: index("idx_workspaces_owner").on(table.ownerUserId),
    stripeSubIdx: index("idx_workspaces_stripe_sub").on(table.stripeSubscriptionId),
  })
);

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = mysqlTable(
  "workspace_members",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).default("member").notNull(),
    invitedByUserId: int("invitedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  (table) => ({
    workspaceUserUnique: uniqueIndex("uniq_workspace_user").on(table.workspaceId, table.userId),
    workspaceIdx: index("idx_members_workspace").on(table.workspaceId),
    userIdx: index("idx_members_user").on(table.userId),
  })
);

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

export const workspaceInvitations = mysqlTable(
  "workspace_invitations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    invitedEmail: varchar("invitedEmail", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).default("member").notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    invitedByUserId: int("invitedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedAt: timestamp("acceptedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("uniq_invitation_token").on(table.token),
    workspaceIdx: index("idx_invitations_workspace").on(table.workspaceId),
    emailIdx: index("idx_invitations_email").on(table.invitedEmail),
  })
);

export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type InsertWorkspaceInvitation = typeof workspaceInvitations.$inferInsert;

export const scriptShareLinks = mysqlTable(
  "script_share_links",
  {
    id: int("id").autoincrement().primaryKey(),
    token: varchar("token", { length: 32 }).notNull(),
    scriptId: int("scriptId")
      .notNull()
      .references(() => savedScripts.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
    viewCount: int("viewCount").default(0).notNull(),
    lastViewedAt: timestamp("lastViewedAt"),
  },
  (table) => ({
    tokenUnique: uniqueIndex("uniq_script_share_token").on(table.token),
    tokenIdx: index("idx_script_share_token").on(table.token),
    scriptIdx: index("idx_script_share_script").on(table.scriptId),
  })
);

export const hookGeneratorLeads = mysqlTable("hook_generator_leads", {
  id: int("id").primaryKey().autoincrement(),
  email: varchar("email", { length: 255 }).notNull(),
  niche: varchar("niche", { length: 500 }).notNull(),
  targetAudience: text("target_audience").default("").notNull(),
  hooksGenerated: json("hooks_generated").$type<Array<{ hook: string; pattern: string; reasoning: string }>>(),
  source: varchar("source", { length: 100 }).default("organic"),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  emailedAt: timestamp("emailed_at"),
  convertedToSignup: boolean("converted_to_signup").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("idx_hook_leads_email").on(table.email),
  createdIdx: index("idx_hook_leads_created").on(table.createdAt),
}));

import type { CreatorDiscoveryResult } from "../server/discovery/creatorPipeline";
import type { DiscoveryResult as DiscoveryPipelineResult } from "../server/discovery/pipeline";

export const discoverySearches = mysqlTable(
  "discovery_searches",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessDescription: varchar("businessDescription", { length: 1000 }).notNull(),
    routedNiche: varchar("routedNiche", { length: 128 }),
    reelCount: int("reelCount").default(0).notNull(),
    resultJson: json("resultJson").$type<DiscoveryPipelineResult>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_discovery_searches_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type DiscoverySearch = typeof discoverySearches.$inferSelect;
export type InsertDiscoverySearch = typeof discoverySearches.$inferInsert;

export const discoveryJobs = mysqlTable(
  "discovery_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessDescription: varchar("businessDescription", { length: 1000 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    routedNiche: varchar("routedNiche", { length: 128 }),
    creatorsTotal: int("creatorsTotal").default(0).notNull(),
    creatorsDrilled: int("creatorsDrilled").default(0).notNull(),
    reelsFound: int("reelsFound").default(0).notNull(),
    partialJson: json("partialJson").$type<DiscoveryPipelineResult>(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_discovery_jobs_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type DiscoveryJob = typeof discoveryJobs.$inferSelect;
export type InsertDiscoveryJob = typeof discoveryJobs.$inferInsert;

export const creatorDiscoverySearches = mysqlTable(
  "creator_discovery_searches",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessDescription: varchar("businessDescription", { length: 1000 }).notNull(),
    routedNiche: varchar("routedNiche", { length: 128 }),
    creatorCount: int("creatorCount").default(0).notNull(),
    resultJson: json("resultJson").$type<CreatorDiscoveryResult>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_creator_discovery_searches_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type CreatorDiscoverySearch = typeof creatorDiscoverySearches.$inferSelect;
export type InsertCreatorDiscoverySearch =
  typeof creatorDiscoverySearches.$inferInsert;

export const creatorDiscoveryJobs = mysqlTable(
  "creator_discovery_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessDescription: varchar("businessDescription", { length: 1000 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    routedNiche: varchar("routedNiche", { length: 128 }),
    topicsTotal: int("topicsTotal").default(0).notNull(),
    topicsSearched: int("topicsSearched").default(0).notNull(),
    creatorsFound: int("creatorsFound").default(0).notNull(),
    partialJson: json("partialJson").$type<CreatorDiscoveryResult>(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_creator_discovery_jobs_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type CreatorDiscoveryJob = typeof creatorDiscoveryJobs.$inferSelect;
export type InsertCreatorDiscoveryJob = typeof creatorDiscoveryJobs.$inferInsert;

export const viralityDiagnosticJobs = mysqlTable(
  "virality_diagnostic_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    reelsFound: int("reelsFound").default(0).notNull(),
    reelsAnalyzed: int("reelsAnalyzed").default(0).notNull(),
    resultJson: json("resultJson"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_virality_diagnostic_jobs_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type ViralityDiagnosticJob = typeof viralityDiagnosticJobs.$inferSelect;
export type InsertViralityDiagnosticJob =
  typeof viralityDiagnosticJobs.$inferInsert;

export const discoveryResults = mysqlTable("discovery_results", {
  id: int("id").primaryKey().autoincrement(),
  searchId: int("searchId")
    .notNull()
    .references(() => discoverySearches.id, { onDelete: "cascade" }),
  rankPosition: int("rankPosition").notNull(),
  instagramHandle: varchar("instagramHandle", { length: 255 }).notNull(),
  followerCount: int("followerCount"),
  engagementRate: decimal("engagementRate", { precision: 5, scale: 2 }),
  nicheFitScore: decimal("nicheFitScore", { precision: 3, scale: 2 }),
  whyMatchSummary: varchar("whyMatchSummary", { length: 500 }),
}, (table) => ({
  searchIdx: index("idx_discovery_results_search").on(table.searchId),
}));

export type DiscoveryResult = typeof discoveryResults.$inferSelect;
export type InsertDiscoveryResult = typeof discoveryResults.$inferInsert;

export const outreachEmails = mysqlTable("outreach_emails", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject"),
  body: text("body"),
  status: varchar("status", { length: 20 }).default("draft"),
  draftedAt: datetime("draftedAt", { mode: "date" }),
  sentAt: datetime("sentAt", { mode: "date" }),
  resendMessageId: varchar("resendMessageId", { length: 255 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type InsertOutreachEmail = typeof outreachEmails.$inferInsert;

export type ScriptShareLink = typeof scriptShareLinks.$inferSelect;
export type InsertScriptShareLink = typeof scriptShareLinks.$inferInsert;

export const founderInterviewRequests = mysqlTable(
  "founder_interview_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    countryCode: varchar("countryCode", { length: 2 }).notNull(),
    dialCode: varchar("dialCode", { length: 8 }).notNull(),
    phoneNational: varchar("phoneNational", { length: 20 }).notNull(),
    phoneE164: varchar("phoneE164", { length: 24 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("uniq_founder_interview_user").on(table.userId),
  })
);

export type FounderInterviewRequest = typeof founderInterviewRequests.$inferSelect;
export type InsertFounderInterviewRequest = typeof founderInterviewRequests.$inferInsert;

/** User thumbs feedback on AI Coach scripts (quality loop for founder review). */
export const coachScriptFeedback = mysqlTable(
  "coach_script_feedback",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    coachScriptId: int("coachScriptId")
      .notNull()
      .references(() => coachScripts.id, { onDelete: "cascade" }),
    rating: varchar("rating", { length: 8 }).notNull(),
    reason: varchar("reason", { length: 32 }),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userScriptUnique: uniqueIndex("uniq_coach_script_feedback_user_script").on(
      table.userId,
      table.coachScriptId
    ),
    createdIdx: index("idx_coach_script_feedback_created").on(table.createdAt),
  })
);

export type CoachScriptFeedback = typeof coachScriptFeedback.$inferSelect;
export type InsertCoachScriptFeedback = typeof coachScriptFeedback.$inferInsert;

import type { CarouselStoredAngleOptionsJson } from "../shared/carouselStudio";
import type { CarouselGenerationMetrics } from "../shared/carouselGenerationMetrics";

/**
 * Carousel remake jobs: AI rewrites only slot text for a curated template.
 * Layout/fonts/colors stay fixed; slotValuesJson is { [slideId]: { [slotId]: string } }.
 * Carousel Studio also stores angleOptionsJson + selectedAngleIndex before slide remake.
 */
export const carouselRemakes = mysqlTable(
  "carousel_remakes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: varchar("templateId", { length: 128 }).notNull(),
    niche: text("niche").notNull(),
    /** Source Instagram URL when remake was generated from a carousel post. */
    sourceUrl: varchar("sourceUrl", { length: 1024 }),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"])
      .default("pending")
      .notNull(),
    /** Worker-reported remake stage: writing_copy | generating_images | saving. */
    progressStage: varchar("progressStage", { length: 32 }),
    slotValuesJson: json("slotValuesJson").$type<Record<string, Record<string, string>>>(),
    /**
     * Carousel Studio stored payload: historic four-field angles and/or modern
     * schemaVersion 2 briefs. Production may also contain invalid rows.
     * Always normalize with normalizeStoredCarouselBriefs before use.
     */
    angleOptionsJson: json("angleOptionsJson").$type<
      CarouselStoredAngleOptionsJson | unknown
    >(),
    /** Index into angleOptionsJson (0-2) for the chosen direction. */
    selectedAngleIndex: int("selectedAngleIndex"),
    /** Ephemeral slide list when remake used a different middle-section count than the template. */
    slideStructureJson: json("slideStructureJson"),
    /** Optional per-remake color/font override. */
    designOverrideJson: json("designOverrideJson"),
    /** Optional per-remake aspect ratio override (e.g. "4:5", "9:16"). */
    aspectRatioOverride: varchar("aspectRatioOverride", { length: 8 }),
    /** Resolved slide photo URLs keyed by slide id. */
    imageUrlsJson: json("imageUrlsJson"),
    /** Phase 0 generation telemetry. Nullable. Never required for generation. */
    generationMetricsJson: json("generationMetricsJson").$type<CarouselGenerationMetrics>(),
    /** Planned Instagram post date (user reference only; not auto-post). */
    postDate: timestamp("postDate"),
    /** Preferred posting time HH:MM (user reference only; not auto-post). */
    postTime: varchar("postTime", { length: 8 }),
    errorMessage: text("errorMessage"),
    /** Soft delete; null means active. Filtered from list/status. */
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_carousel_remakes_workspace").on(table.workspaceId),
  })
);

export type CarouselRemake = typeof carouselRemakes.$inferSelect;
export type InsertCarouselRemake = typeof carouselRemakes.$inferInsert;

import type { SuggestBrollResult } from "../shared/broll";
import type { VideoBrollInsertionPoint } from "../shared/videoBroll";

export type { VideoBrollInsertionPoint };

/**
 * Persisted B-roll generation for a saved script (beats + clips + theme).
 * One row per script; upserted on full generate / per-beat regenerate.
 */
export const brollGenerations = mysqlTable(
  "broll_generations",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scriptId: int("scriptId")
      .notNull()
      .references(() => savedScripts.id, { onDelete: "cascade" }),
    /** Full SuggestBrollResult: beats (with clips), theme, attributionNote. */
    beatsJson: json("beatsJson").$type<SuggestBrollResult>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scriptUnique: uniqueIndex("uniq_broll_generations_script").on(table.scriptId),
    workspaceIdx: index("idx_broll_generations_workspace").on(table.workspaceId),
  })
);

export type BrollGeneration = typeof brollGenerations.$inferSelect;
export type InsertBrollGeneration = typeof brollGenerations.$inferInsert;

/**
 * Video B-roll upload pipeline: user uploads a talking-head video,
 * we transcribe + analyze, then suggest timed Pexels B-roll insertion points.
 */
export const videoBrollGenerations = mysqlTable(
  "video_broll_generations",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Null for anonymous landing-page previews (paired with accessToken). */
    userId: int("userId"),
    /** Null for anonymous landing-page previews. */
    workspaceId: varchar("workspaceId", { length: 36 }).references(
      () => workspaces.id,
      { onDelete: "cascade" }
    ),
    /**
     * Opaque token for anonymous poll/confirm. Null when owned by a workspace user.
     */
    accessToken: varchar("accessToken", { length: 64 }),
    status: mysqlEnum("status", [
      "pending",
      "uploading",
      "transcribing",
      "analyzing",
      "completed",
      "failed",
    ])
      .default("pending")
      .notNull(),
    /** R2 object URL for the uploaded source video. */
    sourceVideoUrl: varchar("sourceVideoUrl", { length: 1024 }).notNull(),
    /** R2 object URL for demuxed source audio (.m4a); null when video-only fallback. */
    sourceAudioUrl: varchar("sourceAudioUrl", { length: 1024 }),
    /**
     * Background video upload (independent of main status).
     * pending | uploading | completed | failed | skipped
     */
    videoUploadStatus: mysqlEnum("videoUploadStatus", [
      "pending",
      "uploading",
      "completed",
      "failed",
      "skipped",
    ]),
    durationSeconds: int("durationSeconds"),
    /** Deepgram utterances (raw JSON). */
    transcript: json("transcript"),
    /** Suggested insertion cuts with optional resolved Pexels clips. */
    insertionPoints: json("insertionPoints").$type<VideoBrollInsertionPoint[]>(),
    errorMessage: text("errorMessage"),
    /** Technical failure detail (ffmpeg/Deepgram/stack). Not for end-user UI. */
    internalErrorDetail: text("internalErrorDetail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_video_broll_generations_workspace").on(table.workspaceId),
    userCreatedIdx: index("idx_video_broll_generations_user_created").on(
      table.userId,
      table.createdAt
    ),
    accessTokenIdx: index("idx_video_broll_generations_access_token").on(
      table.accessToken
    ),
  })
);

export type VideoBrollGeneration = typeof videoBrollGenerations.$inferSelect;
export type InsertVideoBrollGeneration = typeof videoBrollGenerations.$inferInsert;

/**
 * Background ffmpeg watermark burns for free/unpaid B-roll clip downloads.
 * Paid users skip this table and download the source clip directly.
 * Apply DDL via Railway console (Bug #63); do not drizzle-kit push.
 */
export const watermarkJobs = mysqlTable(
  "watermark_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceClipUrl: text("sourceClipUrl").notNull(),
    status: mysqlEnum("status", [
      "pending",
      "processing",
      "completed",
      "failed",
    ])
      .default("pending")
      .notNull(),
    outputUrl: text("outputUrl"),
    /** Authenticated requester (required for free downloads after auth gate). */
    userId: int("userId"),
    /** Opaque client session; unused for gated downloads, kept for legacy rows. */
    sessionId: varchar("sessionId", { length: 64 }),
    errorMessage: text("errorMessage"),
    /** Set after the one-shot "download ready" email is sent. */
    emailSentAt: timestamp("emailSentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    statusCreatedIdx: index("idx_watermark_jobs_status_created").on(
      table.status,
      table.createdAt
    ),
    sourceStatusIdx: index("idx_watermark_jobs_source_status").on(
      table.sourceClipUrl,
      table.status
    ),
  })
);

export type WatermarkJob = typeof watermarkJobs.$inferSelect;
export type InsertWatermarkJob = typeof watermarkJobs.$inferInsert;

/** Viral Posts Phase 3A: normalized Instagram candidates from discovery. */
export const viralPostCandidates = mysqlTable(
  "viral_post_candidates",
  {
    id: int("id").autoincrement().primaryKey(),
    platform: varchar("platform", { length: 16 }).default("instagram").notNull(),
    sourceId: varchar("sourceId", { length: 128 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 512 }).notNull(),
    creatorId: varchar("creatorId", { length: 128 }),
    creatorName: varchar("creatorName", { length: 255 }).notNull(),
    creatorHandle: varchar("creatorHandle", { length: 128 }),
    creatorAvatarUrl: text("creatorAvatarUrl"),
    creatorFollowers: int("creatorFollowers"),
    thumbnailUrl: text("thumbnailUrl"),
    sourceThumbnailUrl: text("sourceThumbnailUrl"),
    thumbnailMediaStatus: varchar("thumbnailMediaStatus", { length: 32 })
      .default("pending")
      .notNull(),
    videoUrl: text("videoUrl"),
    /**
     * Durable `reels.id` mirror for IG/TikTok playback refresh + R2 video.
     * Null for YouTube (link-out only) and until first daily-feed selection.
     */
    mirroredReelId: int("mirroredReelId"),
    caption: text("caption"),
    transcript: text("transcript"),
    hashtags: json("hashtags").$type<string[]>(),
    publishedAt: timestamp("publishedAt"),
    views: int("views"),
    likes: int("likes"),
    comments: int("comments"),
    shares: int("shares"),
    saves: int("saves"),
    reachMultiplier: decimal("reachMultiplier", { precision: 12, scale: 4 }),
    engagementRate: decimal("engagementRate", { precision: 12, scale: 6 }),
    viewsPerHour: decimal("viewsPerHour", { precision: 14, scale: 4 }),
    trendStatus: varchar("trendStatus", { length: 32 }).default("unknown").notNull(),
    rawProviderPayload: json("rawProviderPayload"),
    discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
    refreshedAt: timestamp("refreshedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    platformSourceUq: uniqueIndex("uq_viral_post_candidates_platform_source").on(
      table.platform,
      table.sourceId
    ),
    discoveredIdx: index("idx_viral_post_candidates_discovered").on(
      table.discoveredAt
    ),
    mirroredReelIdx: index("idx_viral_post_candidates_mirrored_reel").on(
      table.mirroredReelId
    ),
  })
);

export type ViralPostCandidate = typeof viralPostCandidates.$inferSelect;
export type InsertViralPostCandidate = typeof viralPostCandidates.$inferInsert;

export const viralPostDailyFeeds = mysqlTable(
  "viral_post_daily_feeds",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: varchar("localDate", { length: 10 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
    status: varchar("status", { length: 20 }).default("ready").notNull(),
    generationReason: varchar("generationReason", { length: 64 }),
    errorMessage: text("errorMessage"),
    scCallCount: int("scCallCount").default(0).notNull(),
    costEstimateUsd: decimal("costEstimateUsd", { precision: 10, scale: 4 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userDateUq: uniqueIndex("uq_viral_post_daily_feeds_user_date").on(
      table.userId,
      table.localDate
    ),
    userCreatedIdx: index("idx_viral_post_daily_feeds_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type ViralPostDailyFeed = typeof viralPostDailyFeeds.$inferSelect;
export type InsertViralPostDailyFeed = typeof viralPostDailyFeeds.$inferInsert;

/**
 * Viral Posts email drip state (paid weekly + unpaid staged reminders).
 * Columns match Railway console (snake_case) from bug #63.
 */
export const viralPostReminderState = mysqlTable("viral_post_reminder_state", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  reminderStage: int("reminder_stage").default(0).notNull(),
  lastReminderSentAt: datetime("last_reminder_sent_at", { mode: "date" }),
  lastFeedGeneratedAt: datetime("last_feed_generated_at", { mode: "date" }),
  updatedAt: datetime("updated_at", { mode: "date" }),
});

export type ViralPostReminderState = typeof viralPostReminderState.$inferSelect;
export type InsertViralPostReminderState =
  typeof viralPostReminderState.$inferInsert;

export const viralPostDailyFeedItems = mysqlTable(
  "viral_post_daily_feed_items",
  {
    id: int("id").autoincrement().primaryKey(),
    feedId: int("feedId")
      .notNull()
      .references(() => viralPostDailyFeeds.id, { onDelete: "cascade" }),
    candidateId: int("candidateId")
      .notNull()
      .references(() => viralPostCandidates.id, { onDelete: "cascade" }),
    rank: int("rank").notNull(),
    contentPillar: varchar("contentPillar", { length: 128 }),
    relevanceScore: decimal("relevanceScore", { precision: 8, scale: 4 }),
    relevanceLabel: varchar("relevanceLabel", { length: 255 }).notNull(),
    relevanceReason: text("relevanceReason").notNull(),
    adaptabilityScore: decimal("adaptabilityScore", { precision: 8, scale: 4 }),
    finalScore: decimal("finalScore", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    shownAt: timestamp("shownAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    feedCandidateUq: uniqueIndex(
      "uq_viral_post_daily_feed_items_feed_candidate"
    ).on(table.feedId, table.candidateId),
    feedRankIdx: index("idx_viral_post_daily_feed_items_feed_rank").on(
      table.feedId,
      table.rank
    ),
  })
);

export type ViralPostDailyFeedItem = typeof viralPostDailyFeedItems.$inferSelect;
export type InsertViralPostDailyFeedItem =
  typeof viralPostDailyFeedItems.$inferInsert;

export const viralPostSaves = mysqlTable(
  "viral_post_saves",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: int("candidateId")
      .notNull()
      .references(() => viralPostCandidates.id, { onDelete: "cascade" }),
    savedAt: timestamp("savedAt").defaultNow().notNull(),
  },
  (table) => ({
    userCandidateUq: uniqueIndex("uq_viral_post_saves_user_candidate").on(
      table.userId,
      table.candidateId
    ),
    userSavedIdx: index("idx_viral_post_saves_user").on(
      table.userId,
      table.savedAt
    ),
  })
);

export type ViralPostSave = typeof viralPostSaves.$inferSelect;
export type InsertViralPostSave = typeof viralPostSaves.$inferInsert;

export const viralPostFeedback = mysqlTable(
  "viral_post_feedback",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: int("candidateId")
      .notNull()
      .references(() => viralPostCandidates.id, { onDelete: "cascade" }),
    feedbackType: varchar("feedbackType", { length: 32 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_viral_post_feedback_user_created").on(
      table.userId,
      table.createdAt
    ),
    userTypeIdx: index("idx_viral_post_feedback_user_type").on(
      table.userId,
      table.feedbackType
    ),
  })
);

export type ViralPostFeedbackRow = typeof viralPostFeedback.$inferSelect;
export type InsertViralPostFeedback = typeof viralPostFeedback.$inferInsert;

export const viralPostHiddenCreators = mysqlTable(
  "viral_post_hidden_creators",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 16 }).default("instagram").notNull(),
    creatorKey: varchar("creatorKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userPlatformKeyUq: uniqueIndex(
      "uq_viral_post_hidden_creators_user_platform_key"
    ).on(table.userId, table.platform, table.creatorKey),
  })
);

export type ViralPostHiddenCreator = typeof viralPostHiddenCreators.$inferSelect;
export type InsertViralPostHiddenCreator =
  typeof viralPostHiddenCreators.$inferInsert;

/** Shared niche/pillar pools for Viral Posts Phase 3A.1. */
export const viralPostPools = mysqlTable(
  "viral_post_pools",
  {
    id: int("id").autoincrement().primaryKey(),
    poolKey: varchar("poolKey", { length: 191 }).notNull(),
    platform: varchar("platform", { length: 16 }).default("instagram").notNull(),
    niche: varchar("niche", { length: 128 }).notNull(),
    pillar: varchar("pillar", { length: 128 }).notNull(),
    language: varchar("language", { length: 16 }).default("en").notNull(),
    region: varchar("region", { length: 32 }),
    priority: int("priority").default(100).notNull(),
    minFreshCandidates: int("minFreshCandidates").default(40).notNull(),
    dailyCallBudget: int("dailyCallBudget").default(60).notNull(),
    lastRefreshedAt: timestamp("lastRefreshedAt"),
    lastRefreshStatus: varchar("lastRefreshStatus", { length: 32 }),
    lastRefreshScCalls: int("lastRefreshScCalls").default(0).notNull(),
    lastRefreshCandidateCount: int("lastRefreshCandidateCount")
      .default(0)
      .notNull(),
    /** Worker identity holding the refresh lease (multi-instance safe). */
    refreshLeaseOwner: varchar("refreshLeaseOwner", { length: 128 }),
    /** Lease expiry; stale leases are stealable after crash. */
    refreshLeaseUntil: timestamp("refreshLeaseUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    poolKeyUq: uniqueIndex("uq_viral_post_pools_key").on(table.poolKey),
    nichePillarIdx: index("idx_viral_post_pools_niche_pillar").on(
      table.niche,
      table.pillar
    ),
    lastRefreshedIdx: index("idx_viral_post_pools_last_refreshed").on(
      table.lastRefreshedAt
    ),
    leaseUntilIdx: index("idx_viral_post_pools_lease_until").on(
      table.refreshLeaseUntil
    ),
  })
);

export type ViralPostPool = typeof viralPostPools.$inferSelect;
export type InsertViralPostPool = typeof viralPostPools.$inferInsert;

export const viralPostPoolCandidates = mysqlTable(
  "viral_post_pool_candidates",
  {
    id: int("id").autoincrement().primaryKey(),
    poolId: int("poolId")
      .notNull()
      .references(() => viralPostPools.id, { onDelete: "cascade" }),
    candidateId: int("candidateId")
      .notNull()
      .references(() => viralPostCandidates.id, { onDelete: "cascade" }),
    primaryPillar: varchar("primaryPillar", { length: 128 }).notNull(),
    secondaryPillar: varchar("secondaryPillar", { length: 128 }),
    pillarConfidence: decimal("pillarConfidence", { precision: 6, scale: 4 })
      .default("0.5000")
      .notNull(),
    pillarReason: text("pillarReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    poolCandidateUq: uniqueIndex("uq_viral_post_pool_candidates").on(
      table.poolId,
      table.candidateId
    ),
    candidateIdx: index("idx_viral_post_pool_candidates_candidate").on(
      table.candidateId
    ),
    poolCreatedIdx: index("idx_viral_post_pool_candidates_pool_created").on(
      table.poolId,
      table.createdAt
    ),
  })
);

export type ViralPostPoolCandidate = typeof viralPostPoolCandidates.$inferSelect;
export type InsertViralPostPoolCandidate =
  typeof viralPostPoolCandidates.$inferInsert;

export const viralPostPoolBudgetDays = mysqlTable(
  "viral_post_pool_budget_days",
  {
    id: int("id").autoincrement().primaryKey(),
    poolId: int("poolId")
      .notNull()
      .references(() => viralPostPools.id, { onDelete: "cascade" }),
    budgetDate: varchar("budgetDate", { length: 10 }).notNull(),
    scCallsUsed: int("scCallsUsed").default(0).notNull(),
    refreshRuns: int("refreshRuns").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    poolDateUq: uniqueIndex("uq_viral_post_pool_budget_day").on(
      table.poolId,
      table.budgetDate
    ),
  })
);

export type ViralPostPoolBudgetDay = typeof viralPostPoolBudgetDays.$inferSelect;
export type InsertViralPostPoolBudgetDay =
  typeof viralPostPoolBudgetDays.$inferInsert;

/**
 * Curated TikTok / YouTube handles used to seed Viral Posts pools per niche.
 * Instagram discovery still uses hashtag search; TT/YT use handle scrapes.
 */
export const viralPostSeedCreators = mysqlTable(
  "viral_post_seed_creators",
  {
    id: int("id").autoincrement().primaryKey(),
    platform: varchar("platform", { length: 16 }).notNull(),
    niche: varchar("niche", { length: 128 }).notNull(),
    handle: varchar("handle", { length: 128 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    platformNicheHandleUq: uniqueIndex(
      "uq_viral_post_seed_creators_platform_niche_handle"
    ).on(table.platform, table.niche, table.handle),
    nichePlatformIdx: index("idx_viral_post_seed_creators_niche_platform").on(
      table.niche,
      table.platform
    ),
  })
);

export type ViralPostSeedCreator = typeof viralPostSeedCreators.$inferSelect;
export type InsertViralPostSeedCreator =
  typeof viralPostSeedCreators.$inferInsert;
