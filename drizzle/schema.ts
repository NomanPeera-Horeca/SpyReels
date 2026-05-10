import { bigint, boolean, datetime, decimal, int, json, mysqlEnum, mysqlTable, primaryKey, text, timestamp, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  onboardingCompletedAt: datetime("onboardingCompletedAt", { mode: "date" }),
  onboardingSkippedAt: datetime("onboardingSkippedAt", { mode: "date" }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Scrape jobs track each scraping request for an Instagram handle.
 */
export const scrapeJobs = mysqlTable("scrape_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  handle: varchar("handle", { length: 128 }).notNull(),
  timeframeDays: int("timeframeDays").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  totalReels: int("totalReels").default(0).notNull(),
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
});

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = typeof scrapeJobs.$inferInsert;

/**
 * Individual reels collected from a scrape job.
 */
export const reels = mysqlTable("reels", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
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
});

export type Reel = typeof reels.$inferSelect;
export type InsertReel = typeof reels.$inferInsert;

/**
 * Transcriptions generated on-demand for individual reels.
 *
 * Exactly one of (`reelId`, `featuredReelId`) must be non-null. This is
 * enforced at the application layer (see `transcribe.*` handlers) since
 * MySQL can't express a cheap "xor" CHECK on nullable columns without
 * function dependencies. `reelId` points at `reels.id` (user-scraped),
 * `featuredReelId` at `featured_reels.id` (catalog).
 */
export const transcriptions = mysqlTable("transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  reelId: int("reelId"),
  featuredReelId: int("featuredReelId"),
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
});

export type Transcription = typeof transcriptions.$inferSelect;
export type InsertTranscription = typeof transcriptions.$inferInsert;

/**
 * Re-created scripts generated from viral reel structures.
 *
 * Exactly one of (`reelId`, `featuredReelId`) must be non-null —
 * enforced in the `recreate.*` handlers.
 */
export const recreatedScripts = mysqlTable("recreated_scripts", {
  id: int("id").autoincrement().primaryKey(),
  reelId: int("reelId"),
  featuredReelId: int("featuredReelId"),
  userId: int("userId").notNull(),
  topic: text("topic").notNull(),
  gradeLevel: varchar("gradeLevel", { length: 16 }).notNull(), // "auto", "2", "3", "4", "5", "6"
  viralStructure: json("viralStructure"), // { hook, body, transition, cta } analysis
  generatedScript: text("generatedScript"),
  readabilityAnalysis: json("readabilityAnalysis"), // Hemingway-style analysis results
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecreatedScript = typeof recreatedScripts.$inferSelect;
export type InsertRecreatedScript = typeof recreatedScripts.$inferInsert;

/**
 * Saved/bookmarked reels for quick access.
 *
 * Exactly one of the two ID sources must be populated:
 *   - user-scraped: (`reelId` + `jobId`) both non-null, `featuredReelId` null.
 *   - featured catalog: `featuredReelId` non-null, `reelId` and `jobId` null.
 * Enforced in the `saved.toggle` handler.
 */
export const savedReels = mysqlTable("saved_reels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reelId: int("reelId"),
  jobId: int("jobId"),
  featuredReelId: int("featuredReelId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SavedReel = typeof savedReels.$inferSelect;
export type InsertSavedReel = typeof savedReels.$inferInsert;

/**
 * Tags for organizing scripts (default stages + custom user tags).
 */
export const scriptTags = mysqlTable("script_tags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).notNull(), // hex color like #7c3aed
  isDefault: int("isDefault").default(0).notNull(), // 1 = system default stage tag
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScriptTag = typeof scriptTags.$inferSelect;
export type InsertScriptTag = typeof scriptTags.$inferInsert;

/**
 * Saved scripts in the user's library with metadata.
 */
export const savedScripts = mysqlTable("saved_scripts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reelId: int("reelId"), // optional - linked to original reel
  recreatedScriptId: int("recreatedScriptId"), // optional - linked to recreated script
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedScript = typeof savedScripts.$inferSelect;
export type InsertSavedScript = typeof savedScripts.$inferInsert;

/**
 * Many-to-many relationship between scripts and tags.
 */
export const scriptTagAssignments = mysqlTable("script_tag_assignments", {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScriptTagAssignment = typeof scriptTagAssignments.$inferSelect;
export type InsertScriptTagAssignment = typeof scriptTagAssignments.$inferInsert;

/**
 * Version history for scripts - each edit/rewrite creates a new version.
 */
export const scriptVersions = mysqlTable("script_versions", {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  content: text("content").notNull(),
  versionNumber: int("versionNumber").notNull(),
  changeType: mysqlEnum("changeType", ["initial", "manual_edit", "ai_rewrite", "grammar_fix"]).default("initial").notNull(),
  changeDescription: text("changeDescription"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
export const collectedReels = mysqlTable("collected_reels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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
  transcriptionReelId: int("transcriptionReelId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CollectedReel = typeof collectedReels.$inferSelect;
export type InsertCollectedReel = typeof collectedReels.$inferInsert;

/**
 * Script ideas - users submit topic ideas that get processed into full scripts in the background.
 * Acts as a "script factory" where ideas queue up and scripts are ready when users return.
 */
export const scriptIdeas = mysqlTable("script_ideas", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  idea: text("idea").notNull(), // The topic/idea text submitted by the user
  niche: varchar("niche", { length: 128 }), // Optional niche/category hint
  tone: varchar("tone", { length: 64 }).default("engaging"), // casual, professional, humorous, educational, engaging
  gradeLevel: varchar("gradeLevel", { length: 16 }).default("auto"), // reading level
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
});

export type ScriptIdea = typeof scriptIdeas.$inferSelect;
export type InsertScriptIdea = typeof scriptIdeas.$inferInsert;

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
