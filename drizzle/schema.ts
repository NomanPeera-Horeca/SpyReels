import { bigint, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
});

export type Reel = typeof reels.$inferSelect;
export type InsertReel = typeof reels.$inferInsert;

/**
 * Transcriptions generated on-demand for individual reels.
 */
export const transcriptions = mysqlTable("transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  reelId: int("reelId").notNull(),
  transcript: text("transcript"),
  segments: json("segments"),
  hookAnalysis: text("hookAnalysis"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transcription = typeof transcriptions.$inferSelect;
export type InsertTranscription = typeof transcriptions.$inferInsert;

/**
 * Re-created scripts generated from viral reel structures.
 */
export const recreatedScripts = mysqlTable("recreated_scripts", {
  id: int("id").autoincrement().primaryKey(),
  reelId: int("reelId").notNull(),
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
 */
export const savedReels = mysqlTable("saved_reels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reelId: int("reelId").notNull(),
  jobId: int("jobId").notNull(),
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
