import { and, desc, asc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, scrapeJobs, reels, transcriptions, recreatedScripts, savedReels, scriptTags, savedScripts, scriptTagAssignments, scriptVersions, userPreferences, subscriptions, extensionUsage, extensionTokens, blogPosts, telegramConnections, collectedReels, scriptIdeas, InsertScrapeJob, InsertReel, InsertTranscription, InsertRecreatedScript, InsertSavedReel, InsertScriptTag, InsertSavedScript, InsertScriptTagAssignment, InsertScriptVersion, ScrapeJob, Reel, Transcription, RecreatedScript, SavedReel, ScriptTag, SavedScript, ScriptTagAssignment, ScriptVersion, UserPreference, Subscription, ExtensionUsage, ExtensionToken, BlogPost, InsertBlogPost, TelegramConnection, InsertTelegramConnection, CollectedReel, InsertCollectedReel, ScriptIdea, InsertScriptIdea } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Scrape Jobs ──

export async function createScrapeJob(data: InsertScrapeJob): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(scrapeJobs).values(data);
  return result[0].insertId;
}

export async function getScrapeJob(id: number): Promise<ScrapeJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);
  return result[0];
}

export async function updateScrapeJob(id: number, data: Partial<Pick<ScrapeJob, "status" | "totalReels" | "followerCount" | "errorMessage" | "profilePicUrl">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(scrapeJobs).set(data).where(eq(scrapeJobs.id, id));
}

export async function getUserScrapeJobs(userId: number): Promise<ScrapeJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(scrapeJobs).where(eq(scrapeJobs.userId, userId)).orderBy(desc(scrapeJobs.createdAt));
}

export async function deleteScrapeJob(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete associated reels first, then the job
  await db.delete(reels).where(eq(reels.jobId, id));
  await db.delete(scrapeJobs).where(eq(scrapeJobs.id, id));
}

// ── Reels ──

export async function insertReels(data: InsertReel[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  // Insert in batches of 50 to avoid query size limits
  for (let i = 0; i < data.length; i += 50) {
    const batch = data.slice(i, i + 50);
    await db.insert(reels).values(batch);
  }
}

export async function getReelsByJobId(jobId: number): Promise<Reel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(reels).where(eq(reels.jobId, jobId));
}

export async function getExistingShortcodes(jobId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ shortcode: reels.shortcode }).from(reels).where(eq(reels.jobId, jobId));
  return rows.map(r => r.shortcode);
}

export async function updateScrapeJobResync(id: number, data: { totalReels: number; followerCount: number; status: string; profilePicUrl?: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const setData: Record<string, any> = {
    totalReels: data.totalReels,
    followerCount: data.followerCount,
    status: data.status as any,
  };
  if (data.profilePicUrl) {
    setData.profilePicUrl = data.profilePicUrl;
  }
  await db.update(scrapeJobs).set(setData).where(eq(scrapeJobs.id, id));
}

export async function getReelById(id: number): Promise<Reel | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(reels).where(eq(reels.id, id)).limit(1);
  return result[0];
}

// ── Transcriptions ──

export async function createTranscription(data: InsertTranscription): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transcriptions).values(data);
  return result[0].insertId;
}

export async function getTranscriptionByReelId(reelId: number): Promise<Transcription | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(transcriptions).where(eq(transcriptions.reelId, reelId)).limit(1);
  return result[0];
}

export async function updateTranscription(id: number, data: Partial<Pick<Transcription, "transcript" | "segments" | "hookAnalysis" | "status" | "errorMessage">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(transcriptions).set(data).where(eq(transcriptions.id, id));
}

export async function getTranscriptionsByJobId(jobId: number): Promise<Transcription[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const reelRows = await db.select({ id: reels.id }).from(reels).where(eq(reels.jobId, jobId));
  if (reelRows.length === 0) return [];
  const reelIds = reelRows.map(r => r.id);
  // Get all transcriptions for these reels
  const allTranscriptions: Transcription[] = [];
  for (const reelId of reelIds) {
    const t = await db.select().from(transcriptions).where(eq(transcriptions.reelId, reelId));
    allTranscriptions.push(...t);
  }
  return allTranscriptions;
}

// ── Recreated Scripts ──

export async function createRecreatedScript(data: InsertRecreatedScript): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recreatedScripts).values(data);
  return result[0].insertId;
}

export async function getRecreatedScript(id: number): Promise<RecreatedScript | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(recreatedScripts).where(eq(recreatedScripts.id, id)).limit(1);
  return result[0];
}

export async function updateRecreatedScript(id: number, data: Partial<Pick<RecreatedScript, "viralStructure" | "generatedScript" | "readabilityAnalysis" | "status" | "errorMessage">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recreatedScripts).set(data).where(eq(recreatedScripts.id, id));
}

export async function getRecreatedScriptsByReelId(reelId: number): Promise<RecreatedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(recreatedScripts).where(eq(recreatedScripts.reelId, reelId)).orderBy(desc(recreatedScripts.createdAt));
}

// ── Saved Reels ──

export async function saveReel(data: InsertSavedReel): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(savedReels).values(data);
  return result[0].insertId;
}

export async function unsaveReel(userId: number, reelId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(savedReels).where(and(eq(savedReels.userId, userId), eq(savedReels.reelId, reelId)));
}

export async function getSavedReelsByUser(userId: number): Promise<SavedReel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(savedReels).where(eq(savedReels.userId, userId)).orderBy(desc(savedReels.createdAt));
}

export async function isReelSaved(userId: number, reelId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(savedReels).where(and(eq(savedReels.userId, userId), eq(savedReels.reelId, reelId))).limit(1);
  return result.length > 0;
}

export async function getSavedReelsWithDetails(userId: number): Promise<Array<SavedReel & { reel: Reel; job: ScrapeJob; transcription?: Transcription }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const saved = await db.select().from(savedReels).where(eq(savedReels.userId, userId)).orderBy(desc(savedReels.createdAt));
  const results: Array<SavedReel & { reel: Reel; job: ScrapeJob; transcription?: Transcription }> = [];
  for (const s of saved) {
    const reelRows = await db.select().from(reels).where(eq(reels.id, s.reelId)).limit(1);
    const jobRows = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, s.jobId)).limit(1);
    if (reelRows[0] && jobRows[0]) {
      const tRows = await db.select().from(transcriptions).where(eq(transcriptions.reelId, s.reelId)).limit(1);
      results.push({ ...s, reel: reelRows[0], job: jobRows[0], transcription: tRows[0] });
    }
  }
  return results;
}

// ── Script Tags ──

export async function createScriptTag(data: InsertScriptTag): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(scriptTags).values(data);
  return result[0].insertId;
}

export async function getScriptTagsByUser(userId: number): Promise<ScriptTag[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(scriptTags).where(eq(scriptTags.userId, userId)).orderBy(asc(scriptTags.sortOrder));
}

export async function updateScriptTag(id: number, data: Partial<Pick<ScriptTag, "name" | "color" | "sortOrder">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(scriptTags).set(data).where(eq(scriptTags.id, id));
}

export async function deleteScriptTag(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(scriptTagAssignments).where(eq(scriptTagAssignments.tagId, id));
  await db.delete(scriptTags).where(eq(scriptTags.id, id));
}

export async function ensureDefaultTags(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(scriptTags).where(and(eq(scriptTags.userId, userId), eq(scriptTags.isDefault, 1)));
  if (existing.length > 0) return;
  const defaults = [
    { name: "Scripting", color: "#7c3aed", sortOrder: 1 },
    { name: "Rehearsing", color: "#2563eb", sortOrder: 2 },
    { name: "Filming", color: "#d97706", sortOrder: 3 },
    { name: "Editing", color: "#059669", sortOrder: 4 },
    { name: "Posting", color: "#dc2626", sortOrder: 5 },
  ];
  for (const d of defaults) {
    await db.insert(scriptTags).values({ userId, ...d, isDefault: 1 });
  }
}

// ── Saved Scripts ──

export async function createSavedScript(data: InsertSavedScript): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(savedScripts).values(data);
  return result[0].insertId;
}

export async function getSavedScript(id: number): Promise<SavedScript | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(savedScripts).where(eq(savedScripts.id, id)).limit(1);
  return result[0];
}

export async function getSavedScriptsByUser(userId: number): Promise<SavedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(savedScripts).where(eq(savedScripts.userId, userId)).orderBy(desc(savedScripts.postDate), desc(savedScripts.updatedAt));
}

export async function updateSavedScript(id: number, data: Partial<Pick<SavedScript, "title" | "content" | "wordCount" | "postDate" | "postTime" | "status" | "notes" | "gradeLevel">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(savedScripts).set(data).where(eq(savedScripts.id, id));
}

export async function deleteSavedScript(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(scriptTagAssignments).where(eq(scriptTagAssignments.scriptId, id));
  await db.delete(scriptVersions).where(eq(scriptVersions.scriptId, id));
  await db.delete(savedScripts).where(eq(savedScripts.id, id));
}

// ── Script Tag Assignments ──

export async function assignTagToScript(scriptId: number, tagId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(scriptTagAssignments).where(and(eq(scriptTagAssignments.scriptId, scriptId), eq(scriptTagAssignments.tagId, tagId))).limit(1);
  if (existing.length > 0) return;
  await db.insert(scriptTagAssignments).values({ scriptId, tagId });
}

export async function removeTagFromScript(scriptId: number, tagId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(scriptTagAssignments).where(and(eq(scriptTagAssignments.scriptId, scriptId), eq(scriptTagAssignments.tagId, tagId)));
}

export async function getTagsForScript(scriptId: number): Promise<ScriptTag[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const assignments = await db.select().from(scriptTagAssignments).where(eq(scriptTagAssignments.scriptId, scriptId));
  if (assignments.length === 0) return [];
  const tagIds = assignments.map(a => a.tagId);
  return db.select().from(scriptTags).where(inArray(scriptTags.id, tagIds));
}

export async function getScriptsByTag(userId: number, tagId: number): Promise<SavedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const assignments = await db.select().from(scriptTagAssignments).where(eq(scriptTagAssignments.tagId, tagId));
  if (assignments.length === 0) return [];
  const scriptIds = assignments.map(a => a.scriptId);
  return db.select().from(savedScripts).where(and(eq(savedScripts.userId, userId), inArray(savedScripts.id, scriptIds))).orderBy(desc(savedScripts.updatedAt));
}

// ── Script Versions ──

export async function createScriptVersion(data: InsertScriptVersion): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(scriptVersions).values(data);
  return result[0].insertId;
}

export async function getScriptVersions(scriptId: number): Promise<ScriptVersion[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(scriptVersions).where(eq(scriptVersions.scriptId, scriptId)).orderBy(desc(scriptVersions.versionNumber));
}

export async function getLatestVersionNumber(scriptId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const versions = await db.select().from(scriptVersions).where(eq(scriptVersions.scriptId, scriptId)).orderBy(desc(scriptVersions.versionNumber)).limit(1);
  return versions.length > 0 ? versions[0].versionNumber : 0;
}

// ── User Preferences ──

export async function getUserPreferences(userId: number): Promise<UserPreference | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserPreferences(userId: number, data: { timezone?: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(userPreferences).set(data).where(eq(userPreferences.userId, userId));
  } else {
    await db.insert(userPreferences).values({ userId, ...data });
  }
}

// ── Subscriptions ──

export async function getSubscription(userId: number): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return result[0];
}

export async function upsertSubscription(userId: number, data: Partial<Omit<Subscription, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(subscriptions).set(data).where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({ userId, ...data } as any);
  }
}

// ── Extension Usage Tracking ──

export async function getExtensionUsage(userId: number, date: string): Promise<ExtensionUsage | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(extensionUsage)
    .where(and(eq(extensionUsage.userId, userId), eq(extensionUsage.usageDate, date)))
    .limit(1);
  return result[0];
}

export async function incrementExtensionUsage(userId: number, date: string, field: "transcribeCount" | "remakeCount" | "saveCount"): Promise<ExtensionUsage> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(extensionUsage)
    .where(and(eq(extensionUsage.userId, userId), eq(extensionUsage.usageDate, date)))
    .limit(1);
  
  if (existing.length > 0) {
    const current = existing[0];
    const newVal = (current[field] || 0) + 1;
    await db.update(extensionUsage).set({ [field]: newVal }).where(eq(extensionUsage.id, current.id));
    return { ...current, [field]: newVal };
  } else {
    const insertData: any = { userId, usageDate: date, [field]: 1 };
    const result = await db.insert(extensionUsage).values(insertData);
    return { id: (result as any)[0].insertId, userId, usageDate: date, transcribeCount: 0, remakeCount: 0, saveCount: 0, [field]: 1, createdAt: new Date(), updatedAt: new Date() };
  }
}

// ── Extension Tokens ──

export async function createExtensionToken(userId: number, token: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remove old tokens for this user
  await db.delete(extensionTokens).where(eq(extensionTokens.userId, userId));
  await db.insert(extensionTokens).values({ userId, token });
}

export async function getExtensionTokenUser(token: string): Promise<ExtensionToken | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(extensionTokens).where(eq(extensionTokens.token, token)).limit(1);
  if (result[0]) {
    await db.update(extensionTokens).set({ lastUsedAt: new Date() }).where(eq(extensionTokens.id, result[0].id));
  }
  return result[0];
}


// ── Blog Post Helpers ──────────────────────────────────────────

export async function createBlogPost(post: InsertBlogPost): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(blogPosts).values(post);
  return result[0].insertId;
}

export async function updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(blogPosts).set(data).where(eq(blogPosts.id, id));
}

export async function deleteBlogPost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
  return result[0];
}

export async function getBlogPostById(id: number): Promise<BlogPost | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return result[0];
}

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt));
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
}


// ── Telegram Connections ──

export async function createTelegramConnection(data: InsertTelegramConnection): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(telegramConnections).values(data);
  return result[0].insertId;
}

export async function getTelegramConnectionByUserId(userId: number): Promise<TelegramConnection | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(telegramConnections).where(eq(telegramConnections.userId, userId)).limit(1);
  return result[0];
}

export async function getTelegramConnectionByLinkCode(linkCode: string): Promise<TelegramConnection | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(telegramConnections).where(eq(telegramConnections.linkCode, linkCode)).limit(1);
  return result[0];
}

export async function getTelegramConnectionByChatId(chatId: string): Promise<TelegramConnection | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(telegramConnections)
    .where(and(eq(telegramConnections.telegramChatId, chatId), eq(telegramConnections.isConnected, 1)))
    .limit(1);
  return result[0];
}

export async function updateTelegramConnection(id: number, data: Partial<Pick<TelegramConnection, "telegramChatId" | "telegramUsername" | "linkCode" | "linkCodeExpiresAt" | "isConnected">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(telegramConnections).set(data).where(eq(telegramConnections.id, id));
}

export async function deleteTelegramConnection(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(telegramConnections).where(eq(telegramConnections.id, id));
}

// ── Collected Reels ──

export async function createCollectedReel(data: InsertCollectedReel): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(collectedReels).values(data);
  return result[0].insertId;
}

export async function getCollectedReelsByUser(userId: number): Promise<CollectedReel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(collectedReels)
    .where(eq(collectedReels.userId, userId))
    .orderBy(desc(collectedReels.createdAt));
}

export async function getCollectedReelById(id: number): Promise<CollectedReel | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(collectedReels).where(eq(collectedReels.id, id)).limit(1);
  return result[0];
}

export async function updateCollectedReel(id: number, data: Partial<Omit<CollectedReel, "id" | "createdAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(collectedReels).set(data).where(eq(collectedReels.id, id));
}

export async function deleteCollectedReel(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(collectedReels).where(eq(collectedReels.id, id));
}

export async function getCollectedReelByShortcode(userId: number, shortcode: string): Promise<CollectedReel | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(collectedReels)
    .where(and(eq(collectedReels.userId, userId), eq(collectedReels.shortcode, shortcode)))
    .limit(1);
  return result[0];
}


// ── Script Ideas ──

export async function createScriptIdea(data: InsertScriptIdea): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(scriptIdeas).values(data);
  return Number(result[0].insertId);
}

export async function getScriptIdeasByUser(userId: number): Promise<ScriptIdea[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(scriptIdeas)
    .where(eq(scriptIdeas.userId, userId))
    .orderBy(desc(scriptIdeas.createdAt));
}

export async function getScriptIdeaById(id: number): Promise<ScriptIdea | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(scriptIdeas).where(eq(scriptIdeas.id, id)).limit(1);
  return result[0];
}

export async function updateScriptIdea(id: number, data: Partial<InsertScriptIdea> & { status?: string; errorMessage?: string; generatedScript?: string; generatedTitle?: string; viralStructure?: any; savedScriptId?: number }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(scriptIdeas).set(data as any).where(eq(scriptIdeas.id, id));
}

export async function deleteScriptIdea(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(scriptIdeas).where(eq(scriptIdeas.id, id));
}

export async function getQueuedScriptIdeas(): Promise<ScriptIdea[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(scriptIdeas)
    .where(eq(scriptIdeas.status, "queued"))
    .orderBy(asc(scriptIdeas.createdAt))
    .limit(10);
}

// ── Library: Aggregated Transcripts & Scripts ──

export async function getLibraryTranscripts(userId: number, opts: { search?: string; source?: string; limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { search, source, limit = 50, offset = 0 } = opts;

  // 1. Transcripts from scraped reels (via scrape_jobs owned by user)
  const userJobs = await db.select({ id: scrapeJobs.id, handle: scrapeJobs.handle }).from(scrapeJobs).where(eq(scrapeJobs.userId, userId));
  const jobIds = userJobs.map(j => j.id);
  const jobHandleMap = Object.fromEntries(userJobs.map(j => [j.id, j.handle]));

  let scrapedTranscripts: Array<{
    id: number; reelId: number; transcript: string | null; hookAnalysis: string | null;
    status: string; createdAt: Date; source: string; sourceHandle: string | null;
    reelUrl: string | null; thumbnailUrl: string | null; caption: string | null;
  }> = [];

  if (jobIds.length > 0 && (!source || source === "scraped")) {
    const reelRows = await db.select().from(reels).where(inArray(reels.jobId, jobIds));
    const reelIds = reelRows.map(r => r.id);
    const reelMap = Object.fromEntries(reelRows.map(r => [r.id, r]));

    if (reelIds.length > 0) {
      let tRows = await db.select().from(transcriptions).where(
        and(
          inArray(transcriptions.reelId, reelIds),
          eq(transcriptions.status, "completed")
        )
      );
      for (const t of tRows) {
        const reel = reelMap[t.reelId];
        if (!reel) continue;
        scrapedTranscripts.push({
          id: t.id, reelId: t.reelId, transcript: t.transcript, hookAnalysis: t.hookAnalysis,
          status: t.status, createdAt: t.createdAt, source: "scraped",
          sourceHandle: reel.ownerUsername || jobHandleMap[reel.jobId] || null,
          reelUrl: reel.reelUrl, thumbnailUrl: reel.thumbnailUrl, caption: reel.caption,
        });
      }
    }
  }

  // 2. Transcripts from collected reels (these have their own transcription via reelId link)
  let collectedTranscripts: typeof scrapedTranscripts = [];
  if (!source || source === "collected") {
    const collected = await db.select().from(collectedReels).where(eq(collectedReels.userId, userId));
    // Collected reels may have transcriptions linked via a separate mechanism
    // Check if any collected reel shortcodes match reels in the reels table
    for (const cr of collected) {
      // Look for transcriptions that reference this collected reel
      // Collected reels don't have a direct reelId in transcriptions table
      // They are transcribed inline - check if there's a matching reel
      const matchingReels = await db.select().from(reels).where(eq(reels.shortcode, cr.shortcode)).limit(1);
      if (matchingReels.length > 0) {
        const t = await db.select().from(transcriptions).where(
          and(eq(transcriptions.reelId, matchingReels[0].id), eq(transcriptions.status, "completed"))
        ).limit(1);
        if (t.length > 0) {
          collectedTranscripts.push({
            id: t[0].id, reelId: t[0].reelId, transcript: t[0].transcript, hookAnalysis: t[0].hookAnalysis,
            status: t[0].status, createdAt: t[0].createdAt, source: "collected",
            sourceHandle: cr.ownerUsername || null,
            reelUrl: cr.reelUrl, thumbnailUrl: cr.thumbnailUrl, caption: cr.caption,
          });
        }
      }
    }
  }

  // Combine all transcripts
  let allTranscripts = [...scrapedTranscripts, ...collectedTranscripts];

  // Deduplicate by reelId
  const seen = new Set<number>();
  allTranscripts = allTranscripts.filter(t => {
    if (seen.has(t.reelId)) return false;
    seen.add(t.reelId);
    return true;
  });

  // Apply search filter
  if (search) {
    const lower = search.toLowerCase();
    allTranscripts = allTranscripts.filter(t =>
      (t.transcript && t.transcript.toLowerCase().includes(lower)) ||
      (t.caption && t.caption.toLowerCase().includes(lower)) ||
      (t.sourceHandle && t.sourceHandle.toLowerCase().includes(lower))
    );
  }

  // Sort by createdAt desc
  allTranscripts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = allTranscripts.length;
  const items = allTranscripts.slice(offset, offset + limit);

  return { items, total };
}

export async function getLibraryScripts(userId: number, opts: { search?: string; source?: string; status?: string; limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { search, source, status, limit = 50, offset = 0 } = opts;

  // 1. Saved scripts (from My Scripts - includes re-created, rewritten, and idea-generated)
  let scripts: Array<{
    id: number; title: string; content: string; sourceHandle: string | null;
    status: string; source: string; wordCount: number; gradeLevel: string | null;
    createdAt: Date; updatedAt: Date;
  }> = [];

  if (!source || source === "saved") {
    const saved = await db.select().from(savedScripts).where(eq(savedScripts.userId, userId)).orderBy(desc(savedScripts.createdAt));
    for (const s of saved) {
      scripts.push({
        id: s.id, title: s.title, content: s.content, sourceHandle: s.sourceHandle,
        status: s.status, source: "saved", wordCount: s.wordCount,
        gradeLevel: s.gradeLevel, createdAt: s.createdAt, updatedAt: s.updatedAt,
      });
    }
  }

  // 2. Recreated scripts not yet saved
  if (!source || source === "recreated") {
    const recreated = await db.select().from(recreatedScripts).where(
      and(eq(recreatedScripts.userId, userId), eq(recreatedScripts.status, "completed"))
    ).orderBy(desc(recreatedScripts.createdAt));

    // Get saved script recreatedScriptIds to exclude already-saved ones
    const savedWithRecreated = await db.select({ recreatedScriptId: savedScripts.recreatedScriptId }).from(savedScripts).where(eq(savedScripts.userId, userId));
    const savedRecreatedIds = new Set(savedWithRecreated.map(s => s.recreatedScriptId).filter(Boolean));

    for (const r of recreated) {
      if (savedRecreatedIds.has(r.id)) continue; // Already in saved scripts
      const reel = await db.select().from(reels).where(eq(reels.id, r.reelId)).limit(1);
      // Generate a better title for recreated scripts
      let title = r.topic || "Untitled Script";
      // If topic is a generic instruction like "SAME_TOPIC", "make similar", etc., extract first line of script
      if (/^(SAME_TOPIC|make\s+(it\s+)?simil|rewrite|recreate)/i.test(title) && r.generatedScript) {
        // Use first sentence or first 60 chars of the generated script as title
        const firstLine = r.generatedScript.split(/[.!?\n]/)[0]?.trim();
        title = firstLine ? (firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine) : "Re-Created Script";
      }
      scripts.push({
        id: r.id, title, content: r.generatedScript || "",
        sourceHandle: reel[0]?.ownerUsername || null,
        status: "draft", source: "recreated", wordCount: (r.generatedScript || "").split(/\s+/).length,
        gradeLevel: r.gradeLevel, createdAt: r.createdAt, updatedAt: r.updatedAt,
      });
    }
  }

  // 3. Idea-generated scripts not yet saved
  if (!source || source === "idea") {
    const ideas = await db.select().from(scriptIdeas).where(
      and(eq(scriptIdeas.userId, userId), eq(scriptIdeas.status, "completed"))
    ).orderBy(desc(scriptIdeas.createdAt));

    const savedIdeaIds = new Set(
      (await db.select({ id: savedScripts.id }).from(savedScripts).where(eq(savedScripts.userId, userId)))
        .map(s => s.id)
    );

    for (const idea of ideas) {
      if (idea.savedScriptId && savedIdeaIds.has(idea.savedScriptId)) continue;
      scripts.push({
        id: idea.id, title: idea.generatedTitle || idea.ideaText.slice(0, 60),
        content: idea.generatedScript || "", sourceHandle: null,
        status: "draft", source: "idea",
        wordCount: (idea.generatedScript || "").split(/\s+/).length,
        gradeLevel: idea.gradeLevel || "auto",
        createdAt: idea.createdAt, updatedAt: idea.updatedAt,
      });
    }
  }

  // Apply search filter
  if (search) {
    const lower = search.toLowerCase();
    scripts = scripts.filter(s =>
      s.title.toLowerCase().includes(lower) ||
      s.content.toLowerCase().includes(lower) ||
      (s.sourceHandle && s.sourceHandle.toLowerCase().includes(lower))
    );
  }

  // Apply status filter
  if (status) {
    scripts = scripts.filter(s => s.status === status);
  }

  // Sort by createdAt desc
  scripts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = scripts.length;
  const items = scripts.slice(offset, offset + limit);

  return { items, total };
}
