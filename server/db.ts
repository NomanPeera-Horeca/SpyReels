import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, User, users, scrapeJobs, exportJobs, reels, transcriptions, recreatedScripts, savedReels, scriptTags, savedScripts, scriptTagAssignments, scriptVersions, userPreferences, subscriptions, extensionUsage, extensionTokens, blogPosts, telegramConnections, collectedReels, scriptIdeas, featuredAccounts, featuredReels, brandCoachScores, emailEvents, InsertScrapeJob, InsertExportJob, InsertReel, InsertTranscription, InsertRecreatedScript, InsertSavedReel, InsertScriptTag, InsertSavedScript, InsertScriptTagAssignment, InsertScriptVersion, ScrapeJob, ExportJob, Reel, Transcription, RecreatedScript, SavedReel, ScriptTag, SavedScript, ScriptTagAssignment, ScriptVersion, UserPreference, Subscription, ExtensionUsage, ExtensionToken, BlogPost, InsertBlogPost, TelegramConnection, InsertTelegramConnection, CollectedReel, InsertCollectedReel, ScriptIdea, InsertScriptIdea, FeaturedReel, BrandCoachScore, InsertBrandCoachScore } from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  createPersonalWorkspaceForUser,
  getPersonalWorkspaceId,
  getSavedScriptWorkspaceId,
  getScrapeJobWorkspaceId,
} from "./personalWorkspace";
import type { ExportScope } from "../shared/exportScope";

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

export async function applySignupAttribution(
  userId: number,
  partial: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmTerm?: string | null;
    utmContent?: string | null;
    firstReferrer?: string | null;
  }
): Promise<void> {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      set[key] = value;
    }
  }
  if (Object.keys(set).length === 0) return;

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot apply signup attribution: database not available");
    return;
  }

  await db.update(users).set(set).where(eq(users.id, userId));
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
    const existingBefore = await getUserByOpenId(user.openId);

    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
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
    } else {
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const email = user.email?.trim().toLowerCase();
      if (adminEmail && email && email === adminEmail) {
        values.role = 'admin';
        updateSet.role = 'admin';
      }
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

    if (!existingBefore) {
      const created = await getUserByOpenId(user.openId);
      if (created) {
        try {
          await createPersonalWorkspaceForUser(created.id);
        } catch (workspaceErr) {
          console.error(
            `[Workspaces] Failed to create personal workspace for new user ${created.id}:`,
            workspaceErr
          );
        }
      }
    }
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

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── Onboarding state ──

/**
 * All 8 onboarding fields in one call: the 5 first-run flags/timestamps
 * (4 booleans + `demoSeededAt`) plus the Section 3 onboarding-flow
 * fields (`selectedNicheSlugs`, `onboardingCompletedAt`, `onboardingSkippedAt`).
 * Bundled so the OnboardingGate + dashboard demo banner can decide
 * visibility in a single network round-trip.
 */
export async function getOnboardingState(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select({
      hasSeenWelcome: users.hasSeenWelcome,
      hasDismissedHintCard: users.hasDismissedHintCard,
      hasCompletedFirstSpy: users.hasCompletedFirstSpy,
      hasDismissedDemoBanner: users.hasDismissedDemoBanner,
      demoSeededAt: users.demoSeededAt,
      selectedNicheSlugs: users.selectedNicheSlugs,
      selectedCreatorHandles: users.selectedCreatorHandles,
      businessDescription: users.businessDescription,
      targetAudience: users.targetAudience,
      onboardingCompletedAt: users.onboardingCompletedAt,
      onboardingSkippedAt: users.onboardingSkippedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0];
}

/**
 * Partial update for user personalization text on `users`.
 * Mirrors `updateOnboardingState` — scoped by userId only.
 */
export async function updateUserPersonalization(
  userId: number,
  data: Partial<Pick<User, "businessDescription" | "targetAudience">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (Object.keys(data).length === 0) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

/**
 * Partial update for any subset of the onboarding fields. Mirrors the
 * `updateScrapeJob` pattern — the `Partial<Pick<...>>` keeps callers
 * from accidentally mutating fields outside this surface.
 */
export async function updateOnboardingState(
  userId: number,
  data: Partial<
    Pick<
      User,
      | "hasSeenWelcome"
      | "hasDismissedHintCard"
      | "hasCompletedFirstSpy"
      | "hasDismissedDemoBanner"
      | "demoSeededAt"
    >
  >
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ── Onboarding completion + demo seed (Section 3) ──

/**
 * Seeds a demo scrape for a freshly-onboarded user by cloning a
 * featured account's stored top reels into the normal reels pipeline
 * (spec §3). The resulting scrape_jobs row is marked `status="completed"`
 * with the same field shape as runScrapeJob's normal completion path,
 * plus `isDemo=true` so the dashboard banner visibility check and the
 * hasCompletedFirstSpy auto-flip can tell it apart from a real scrape.
 *
 * Account selection:
 *   - If `preferredHandle` resolves to an active featured account with
 *     ≥1 stored reel, use it.
 *   - Otherwise fall back to the "richness winner" — the active
 *     featured account with the highest (reelCount × avgEngagementRate).
 *     Same ordering powers the onboarding "Pick for me" card and the
 *     onboarding-skipped path.
 *
 * Resilience: every failure path is swallowed and surfaced as a `null`
 * return so callers never need try/catch around the seed — `null`
 * simply means "no demo dashboard for this user, proceed anyway".
 * Partial failures (job row inserted but reel batch blew up) clean up
 * the orphan job so the user doesn't see an empty dashboard.
 */
export async function seedDemoScrape(
  userId: number,
  preferredHandle?: string
): Promise<number | null> {
  const t0 = Date.now();
  const hLabel = preferredHandle ?? "—";
  const ms = () => Date.now() - t0;
  console.log(`[seedDemoScrape] start userId=${userId} handle=${hLabel}`);

  const db = await getDb();
  if (!db) {
    console.warn(
      `[seedDemoScrape] db unavailable, skipping seed for userId=${userId} (+${ms()}ms) handle=${hLabel}`
    );
    return null;
  }
  console.log(`[seedDemoScrape] getDb ok (+${ms()}ms) userId=${userId}`);

  let jobId: number | null = null;
  try {
    type Candidate = {
      id: number;
      handle: string;
      displayName: string | null;
      followerCount: number;
      profilePicUrl: string | null;
    };
    let chosen: Candidate | undefined;

    if (preferredHandle) {
      const normalized = preferredHandle.replace(/^@/, "").trim().toLowerCase();
      console.log(
        `[seedDemoScrape] account lookup by preferred handle (+${ms()}ms) normalized=${normalized}`
      );
      const byHandle = await db
        .select({
          id: featuredAccounts.id,
          handle: featuredAccounts.handle,
          displayName: featuredAccounts.displayName,
          followerCount: featuredAccounts.followerCount,
          profilePicUrl: featuredAccounts.profilePicUrl,
          reelCount: sql<number>`COUNT(${featuredReels.id})`,
        })
        .from(featuredAccounts)
        .leftJoin(featuredReels, eq(featuredReels.featuredAccountId, featuredAccounts.id))
        .where(and(eq(featuredAccounts.handle, normalized), eq(featuredAccounts.isActive, true)))
        .groupBy(
          featuredAccounts.id,
          featuredAccounts.handle,
          featuredAccounts.displayName,
          featuredAccounts.followerCount,
          featuredAccounts.profilePicUrl
        )
        .limit(1);
      console.log(
        `[seedDemoScrape] byHandle query done (+${ms()}ms) rows=${byHandle.length} reelCount=${
          byHandle[0] ? Number(byHandle[0].reelCount) : "n/a"
        }`
      );
      if (byHandle.length > 0 && Number(byHandle[0].reelCount) > 0) {
        chosen = byHandle[0];
        console.log(`[seedDemoScrape] using preferred account @${chosen.handle} id=${chosen.id} (+${ms()}ms)`);
      } else {
        console.warn(
          `[seedDemoScrape] preferred handle "${preferredHandle}" not found or has 0 reels, falling back to richness winner (+${ms()}ms)`
        );
      }
    }

    if (!chosen) {
      // Richness = reelCount × avgEngagementRate, scoped to active
      // accounts that actually have stored reels. Pure density metric;
      // the tradeoff (pet accounts often win over business accounts)
      // is accepted per §3 spec ("densest possible dashboard").
      console.log(`[seedDemoScrape] richness winner query start (+${ms()}ms)`);
      const winner = await db
        .select({
          id: featuredAccounts.id,
          handle: featuredAccounts.handle,
          displayName: featuredAccounts.displayName,
          followerCount: featuredAccounts.followerCount,
          profilePicUrl: featuredAccounts.profilePicUrl,
        })
        .from(featuredAccounts)
        .innerJoin(featuredReels, eq(featuredReels.featuredAccountId, featuredAccounts.id))
        .where(eq(featuredAccounts.isActive, true))
        .groupBy(
          featuredAccounts.id,
          featuredAccounts.handle,
          featuredAccounts.displayName,
          featuredAccounts.followerCount,
          featuredAccounts.profilePicUrl
        )
        .orderBy(sql`COUNT(${featuredReels.id}) * ${featuredAccounts.avgEngagementRate} DESC`)
        .limit(1);
      console.log(`[seedDemoScrape] richness winner done (+${ms()}ms) rows=${winner.length}`);
      if (winner.length === 0) {
        console.warn(
          `[seedDemoScrape] no eligible featured accounts (empty pool?), exit null userId=${userId} duration=${ms()}ms`
        );
        return null;
      }
      chosen = winner[0];
      console.log(`[seedDemoScrape] chosen richness winner @${chosen.handle} id=${chosen.id} (+${ms()}ms)`);
    }

    // Replay the scrape-featured-accounts script's pre-ranked top reels
    // in rank order (1..30). `rank` is reserved in MySQL 8+; Drizzle
    // auto-escapes it via the schema mapping so the query builder is
    // safe here, unlike the hand-written SQL in the scrape script.
    console.log(`[seedDemoScrape] sourceReels query start featuredAccountId=${chosen.id} (+${ms()}ms)`);
    const sourceReels = await db
      .select()
      .from(featuredReels)
      .where(eq(featuredReels.featuredAccountId, chosen.id))
      .orderBy(asc(featuredReels.rank));
    console.log(
      `[seedDemoScrape] sourceReels done (+${ms()}ms) count=${sourceReels.length} account=@${chosen.handle}`
    );

    if (sourceReels.length === 0) {
      console.warn(
        `[seedDemoScrape] chosen account @${chosen.handle} has 0 reels after re-check, exit null duration=${ms()}ms`
      );
      return null;
    }

    // Mirror runScrapeJob's normal completion shape (server/routers.ts
    // L3487-3495) field-for-field so the dashboard can't tell the
    // difference between a demo job and a real one — except via
    // isDemo, which is the only legitimate discriminator.
    console.log(`[seedDemoScrape] createScrapeJob start totalReels=${sourceReels.length} (+${ms()}ms)`);
    jobId = await createScrapeJob({
      userId,
      handle: chosen.handle,
      timeframeDays: 365,
      status: "completed",
      totalReels: sourceReels.length,
      followerCount: chosen.followerCount,
      profilePicUrl: chosen.profilePicUrl ?? undefined,
      currentStep: "complete",
      reelsFound: sourceReels.length,
      progressPercent: 100,
      isDemo: true,
    });
    console.log(`[seedDemoScrape] createScrapeJob done jobId=${jobId} (+${ms()}ms)`);

    // Copy featured_reels → reels. reelUrl is synthesized from the
    // shortcode (canonical IG format). ownerUsername is set to the
    // featured account handle. featured_reels-only fields
    // (engagementRate, rank, scrapedAt) are dropped — the dashboard
    // recomputes engagement rate on the fly from view/like/comment
    // counts, and rank is implicit in the insertion order.
    const reelRows = sourceReels.map((r) => ({
      jobId: jobId!,
      shortcode: r.reelShortcode,
      caption: r.caption,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      thumbnailUrl: r.thumbnailUrl,
      videoUrl: r.videoUrl,
      reelUrl: `https://www.instagram.com/reel/${r.reelShortcode}/`,
      duration: r.duration,
      postedAt: r.postedAt,
      ownerUsername: chosen!.handle,
    }));
    console.log(`[seedDemoScrape] insertReels start rowCount=${reelRows.length} (+${ms()}ms)`);
    await insertReels(reelRows);
    const duration = Date.now() - t0;
    console.log(
      `[seedDemoScrape] complete jobId=${jobId} userId=${userId} @${chosen.handle} reels=${sourceReels.length} duration=${duration}ms`
    );
    return jobId;
  } catch (error) {
    const duration = Date.now() - t0;
    console.error(
      `[seedDemoScrape] catch userId=${userId} handle=${hLabel} duration=${duration}ms error=`,
      error instanceof Error ? error.message : error
    );
    if (jobId !== null) {
      try {
        await deleteScrapeJob(jobId);
        console.log(`[seedDemoScrape] deleted partial jobId=${jobId} after error (+${Date.now() - t0}ms)`);
      } catch (cleanupError) {
        console.error(`[seedDemoScrape] cleanup of partial job ${jobId} failed:`, cleanupError);
      }
    }
    return null;
  }
}

/**
 * Copy cached featured_reels into a user's scrape job so the dashboard
 * can show catalog reels instantly while runScrapeJob pulls live data.
 */
export async function seedFeaturedReelsIntoJob(
  jobId: number,
  featuredAccountId: number,
  timeframeDays: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const accountRows = await db
    .select({
      id: featuredAccounts.id,
      handle: featuredAccounts.handle,
      followerCount: featuredAccounts.followerCount,
      profilePicUrl: featuredAccounts.profilePicUrl,
    })
    .from(featuredAccounts)
    .where(
      and(
        eq(featuredAccounts.id, featuredAccountId),
        eq(featuredAccounts.isActive, true)
      )
    )
    .limit(1);

  if (accountRows.length === 0) return 0;
  const acc = accountRows[0]!;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - timeframeDays);

  const sourceReels = await db
    .select()
    .from(featuredReels)
    .where(
      and(
        eq(featuredReels.featuredAccountId, featuredAccountId),
        gte(featuredReels.postedAt, cutoff)
      )
    )
    .orderBy(asc(featuredReels.rank));

  if (sourceReels.length > 0) {
    await insertReels(
      sourceReels.map((r) => ({
        jobId,
        shortcode: r.reelShortcode,
        caption: r.caption,
        viewCount: r.viewCount,
        likeCount: r.likeCount,
        commentCount: r.commentCount,
        thumbnailUrl: r.thumbnailUrl,
        videoUrl: r.videoUrl,
        reelUrl: `https://www.instagram.com/reel/${r.reelShortcode}/`,
        duration: r.duration,
        postedAt: r.postedAt,
        ownerUsername: acc.handle,
      }))
    );
  }

  await updateScrapeJob(jobId, {
    followerCount: acc.followerCount,
    profilePicUrl: acc.profilePicUrl ?? undefined,
    reelsFound: sourceReels.length,
    totalReels: sourceReels.length,
    currentStep: sourceReels.length > 0 ? "pulling_reels" : "fetching_profile",
    progressPercent: sourceReels.length > 0 ? 20 : 15,
  });

  console.log(
    `[seedFeaturedReelsIntoJob] jobId=${jobId} @${acc.handle} seeded=${sourceReels.length} timeframeDays=${timeframeDays}`
  );
  return sourceReels.length;
}

/**
 * Stamps the user as having completed onboarding. Writes the niche
 * selection (assumed already deduped by the caller), optional multi-
 * creator handle picks, the completion timestamp, and optionally
 * `demoSeededAt` — only when the paired demo-seed succeeded, so
 * `user.demoSeededAt IS NOT NULL` remains a reliable "real demo
 * dashboard exists" signal.
 *
 * Idempotency lives at the tRPC boundary (the mutation guards on
 * `onboardingCompletedAt IS NOT NULL` before calling this). Repeated
 * calls here are harmless — they just rewrite the same columns.
 */
export async function markOnboardingComplete(
  userId: number,
  nicheSlugs: string[],
  selectedCreatorHandles: string[],
  demoSeededAt: Date | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Partial<
    Pick<
      User,
      "selectedNicheSlugs" | "selectedCreatorHandles" | "onboardingCompletedAt" | "demoSeededAt"
    >
  > = {
    selectedNicheSlugs: nicheSlugs,
    selectedCreatorHandles: selectedCreatorHandles.length > 0 ? selectedCreatorHandles : null,
    onboardingCompletedAt: new Date(),
  };
  if (demoSeededAt) {
    updates.demoSeededAt = demoSeededAt;
  }
  await db.update(users).set(updates).where(eq(users.id, userId));
}

/**
 * Marks onboarding as skipped. `demoSeededAt` follows the same "only
 * stamp on success" rule as markOnboardingComplete.
 */
export async function markOnboardingSkipped(
  userId: number,
  demoSeededAt: Date | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Partial<Pick<User, "onboardingSkippedAt" | "demoSeededAt">> = {
    onboardingSkippedAt: new Date(),
  };
  if (demoSeededAt) {
    updates.demoSeededAt = demoSeededAt;
  }
  await db.update(users).set(updates).where(eq(users.id, userId));
}

// ── Scrape Jobs ──

/** Max length for `scrape_jobs.errorMessage` — avoids MySQL overflow when errors embed huge SQL payloads. */
const SCRAPE_JOB_ERROR_MESSAGE_MAX_LEN = 250;

export async function createScrapeJob(
  data: Omit<InsertScrapeJob, "workspaceId"> & Partial<Pick<InsertScrapeJob, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const payload =
    typeof data.errorMessage === "string"
      ? {
          ...data,
          workspaceId,
          errorMessage: data.errorMessage.slice(0, SCRAPE_JOB_ERROR_MESSAGE_MAX_LEN),
        }
      : { ...data, workspaceId };
  const result = await db.insert(scrapeJobs).values(payload);
  return result[0].insertId;
}

export async function getScrapeJob(id: number): Promise<ScrapeJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);
  return result[0];
}

export async function updateScrapeJob(id: number, data: Partial<Pick<ScrapeJob, "status" | "totalReels" | "followerCount" | "errorMessage" | "failureReason" | "profilePicUrl" | "currentStep" | "reelsFound" | "estimatedTotal" | "progressPercent" | "classifiedNicheSlug" | "classifiedConfidence" | "classifiedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const payload =
    typeof data.errorMessage === "string"
      ? {
          ...data,
          errorMessage: data.errorMessage.slice(0, SCRAPE_JOB_ERROR_MESSAGE_MAX_LEN),
        }
      : data;
  await db.update(scrapeJobs).set(payload).where(eq(scrapeJobs.id, id));
}

export async function createExportJob(
  data: Omit<InsertExportJob, "workspaceId"> & Partial<Pick<InsertExportJob, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId =
    data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const result = await db.insert(exportJobs).values({ ...data, workspaceId });
  return result[0].insertId;
}

export async function getExportJobById(id: number): Promise<ExportJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(exportJobs).where(eq(exportJobs.id, id)).limit(1);
  return rows[0];
}

export async function updateExportJob(
  id: number,
  data: Partial<
    Pick<
      ExportJob,
      | "status"
      | "currentStep"
      | "progressPercent"
      | "stepDone"
      | "stepTotal"
      | "progressLabel"
      | "fileR2Key"
      | "filename"
      | "fileSizeBytes"
      | "reelCountAtExport"
      | "errorMessage"
      | "expiresAt"
      | "completedAt"
    >
  >
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(exportJobs).set(data).where(eq(exportJobs.id, id));
}

export async function getActiveExportJobForScrapeJob(
  scrapeJobId: number,
  workspaceId: string
): Promise<ExportJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(exportJobs)
    .where(
      and(
        eq(exportJobs.scrapeJobId, scrapeJobId),
        eq(exportJobs.workspaceId, workspaceId),
        inArray(exportJobs.status, ["pending", "processing"])
      )
    )
    .orderBy(desc(exportJobs.id))
    .limit(1);
  return rows[0];
}

export async function getLatestCompletedExportForScrapeJob(
  scrapeJobId: number,
  workspaceId: string,
  exportScope?: ExportScope
): Promise<ExportJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [
    eq(exportJobs.scrapeJobId, scrapeJobId),
    eq(exportJobs.workspaceId, workspaceId),
    eq(exportJobs.status, "completed"),
  ];
  if (exportScope) {
    conditions.push(eq(exportJobs.exportScope, exportScope));
  }
  const rows = await db
    .select()
    .from(exportJobs)
    .where(and(...conditions))
    .orderBy(desc(exportJobs.id))
    .limit(1);
  return rows[0];
}

export async function getScrapeJobsByWorkspace(workspaceId: string): Promise<ScrapeJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(scrapeJobs)
    .where(eq(scrapeJobs.workspaceId, workspaceId))
    .orderBy(desc(scrapeJobs.createdAt));
}

export async function deleteScrapeJob(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete associated reels first, then the job
  await db.delete(reels).where(eq(reels.jobId, id));
  await db.delete(scrapeJobs).where(eq(scrapeJobs.id, id));
}

// ── Reels ──

export async function insertReels(
  data: Array<Omit<InsertReel, "workspaceId"> & Partial<Pick<InsertReel, "workspaceId">>>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;

  const jobId = data[0]!.jobId;
  const defaultWorkspaceId = await getScrapeJobWorkspaceId(jobId);

  // reels has no (jobId, shortcode) unique key — skip rows already stored
  // for this job so seed + incremental + final passes cannot duplicate.
  const existing = new Set(await getExistingShortcodes(jobId));
  const toInsert = data.filter((row) => !existing.has(row.shortcode));
  if (toInsert.length === 0) return;

  // Insert in batches of 50 to avoid query size limits
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50).map((row) => ({
      ...row,
      workspaceId: row.workspaceId ?? defaultWorkspaceId,
    }));
    await db.insert(reels).values(batch);
  }
}

/** Refresh live-scrape fields on reels already stored for this job. */
export async function updateReelsForJobFromScrape(
  jobId: number,
  data: Array<{
    shortcode: string;
    caption: string | null;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    thumbnailUrl: string | null;
    videoUrl: string;
    reelUrl: string;
    duration: number | null;
    postedAt: Date;
    ownerUsername: string | null;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db || data.length === 0) return;

  for (const r of data) {
    await db
      .update(reels)
      .set({
        caption: r.caption,
        viewCount: r.viewCount,
        likeCount: r.likeCount,
        commentCount: r.commentCount,
        thumbnailUrl: r.thumbnailUrl,
        videoUrl: r.videoUrl,
        duration: r.duration,
        postedAt: r.postedAt,
        ownerUsername: r.ownerUsername,
      })
      .where(and(eq(reels.jobId, jobId), eq(reels.shortcode, r.shortcode)));
  }
}

/** Drop duplicate shortcodes within a job, keeping the newest row (highest id). */
export async function dedupeReelsForJob(jobId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    DELETE r1 FROM reels r1
    INNER JOIN reels r2
      ON r1.jobId = r2.jobId
      AND r1.shortcode = r2.shortcode
      AND r1.id < r2.id
    WHERE r1.jobId = ${jobId}
  `);
  const raw = (result as { affectedRows?: number }[])[0]?.affectedRows;
  return typeof raw === "number" ? raw : 0;
}

export async function getReelsByJobId(
  jobId: number,
  niche?: Reel["niche"]
): Promise<Reel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(reels)
    .where(
      niche != null
        ? and(eq(reels.jobId, jobId), eq(reels.niche, niche))
        : eq(reels.jobId, jobId)
    )
    .orderBy(desc(reels.id));

  const seen = new Set<string>();
  const deduped: Reel[] = [];
  for (const row of rows) {
    if (seen.has(row.shortcode)) continue;
    seen.add(row.shortcode);
    deduped.push(row);
  }
  return deduped;
}

export async function getExistingShortcodes(jobId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ shortcode: reels.shortcode }).from(reels).where(eq(reels.jobId, jobId));
  return rows.map(r => r.shortcode);
}

/** Lightweight check used by failed-job cleanup to decide whether the
 * row is safe to delete. Returns 0 if the scrape never inserted any
 * reels (worker can drop the row); >0 if there is user-visible data
 * we must preserve even though the job is marked failed. */
export async function countReelsForJob(jobId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(reels)
    .where(eq(reels.jobId, jobId));
  const raw = rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw) || 0;
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

export async function updateTranscription(
  id: number,
  data: Partial<
    Pick<Transcription, "transcript" | "segments" | "hookAnalysis" | "status" | "errorMessage" | "queuedAt" | "startedAt">
  >
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(transcriptions).set(data).where(eq(transcriptions.id, id));
}

const TRANSCRIPTION_BATCH_BY_REEL_IDS = 200;

export async function getTranscriptionsByJobId(jobId: number): Promise<Transcription[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const reelRows = await db.select({ id: reels.id }).from(reels).where(eq(reels.jobId, jobId));
  if (reelRows.length === 0) return [];
  const reelIds = reelRows.map((r) => r.id);
  const allTranscriptions: Transcription[] = [];
  for (let i = 0; i < reelIds.length; i += TRANSCRIPTION_BATCH_BY_REEL_IDS) {
    const chunk = reelIds.slice(i, i + TRANSCRIPTION_BATCH_BY_REEL_IDS);
    const rows = await db
      .select()
      .from(transcriptions)
      .where(inArray(transcriptions.reelId, chunk));
    allTranscriptions.push(...rows);
  }
  return allTranscriptions;
}

// ── Recreated Scripts ──

export async function createRecreatedScript(
  data: Omit<InsertRecreatedScript, "workspaceId"> & Partial<Pick<InsertRecreatedScript, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const result = await db.insert(recreatedScripts).values({ ...data, workspaceId });
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

export async function getRecreatedScriptsByReelId(
  reelId: number,
  workspaceId: string
): Promise<RecreatedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(recreatedScripts)
    .where(
      and(eq(recreatedScripts.reelId, reelId), eq(recreatedScripts.workspaceId, workspaceId))
    )
    .orderBy(desc(recreatedScripts.createdAt));
}

// ── Featured Reel helpers (Path B: catalog-backed transcribe/recreate/save) ──

/** Fetch a featured_reels row by id (returns undefined if missing). */
export async function getFeaturedReelById(id: number): Promise<FeaturedReel | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(featuredReels)
    .where(eq(featuredReels.id, id))
    .limit(1);
  return rows[0];
}

/**
 * In-memory `Transcription` view from a `featured_reels` row. Same mapping
 * as `getTranscriptionByFeaturedReelId` (including `no_speech` as
 * `completed` with empty transcript and segments for frontend hook/reuse).
 * `getDashboardData` uses this with rows from its single list query to
 * avoid N extra round trips; keep in sync with any change here.
 */
export function transcriptionViewFromFeaturedReelRow(
  fr: FeaturedReel
): Transcription {
  const uiStatus: Transcription["status"] =
    fr.transcriptionStatus === "no_speech"
      ? "completed"
      : fr.transcriptionStatus === "pending"
      ? "pending"
      : fr.transcriptionStatus === "processing"
      ? "processing"
      : fr.transcriptionStatus === "failed"
      ? "failed"
      : "completed";
  const transcript =
    fr.transcriptionStatus === "no_speech" ? "" : fr.transcript;
  const segments =
    fr.transcriptionStatus === "no_speech"
      ? []
      : (fr.transcriptSegments ?? null);
  return {
    id: fr.id,
    reelId: null,
    featuredReelId: fr.id,
    workspaceId: null,
    transcript,
    segments: segments as Transcription["segments"],
    hookAnalysis: null,
    status: uiStatus,
    errorMessage: null,
    queuedAt: null,
    startedAt: null,
    createdAt: fr.transcribedAt ?? fr.scrapedAt,
    updatedAt: fr.transcribedAt ?? fr.scrapedAt,
  };
}

/**
 * Returns a `Transcription`-shaped view of a featured reel's inline cache
 * (see migration 0029). Featured reels don't get rows in the per-user
 * `transcriptions` table — the catalog owns a single shared transcript
 * per reel, and this helper adapts it to the shape the rest of the
 * codebase already consumes.
 *
 * Status mapping: the catalog's `no_speech` terminal state collapses to
 * `completed` with empty transcript + segments, which is the same signal
 * the UI already uses to render the "all vibes no voice" empty state.
 * `id` reuses the featured reel id — callers treat it as an opaque
 * refetch key and never join against `transcriptions` on it.
 */
export async function getTranscriptionByFeaturedReelId(
  featuredReelId: number
): Promise<Transcription | undefined> {
  const fr = await getFeaturedReelById(featuredReelId);
  if (!fr) return undefined;
  return transcriptionViewFromFeaturedReelRow(fr);
}

/**
 * Update a featured reel's inline transcription cache. Used by the
 * backfill script + the lazy cache-fill path in `transcribe.start`.
 * Writing a `completed` status without a transcript is a bug — callers
 * must pass the transcript text (may be empty string for no_speech).
 */
export async function updateFeaturedReelTranscription(
  featuredReelId: number,
  data: {
    transcriptionStatus:
      | "pending"
      | "processing"
      | "completed"
      | "failed"
      | "no_speech";
    transcript?: string | null;
    transcriptSegments?:
      | { start: number; end: number; text: string }[]
      | null;
    transcribedAt?: Date | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(featuredReels)
    .set({
      transcriptionStatus: data.transcriptionStatus,
      ...(data.transcript !== undefined ? { transcript: data.transcript } : {}),
      ...(data.transcriptSegments !== undefined
        ? { transcriptSegments: data.transcriptSegments }
        : {}),
      ...(data.transcribedAt !== undefined
        ? { transcribedAt: data.transcribedAt }
        : {}),
    })
    .where(eq(featuredReels.id, featuredReelId));
}

/** Bug #57 Tier 2: persist AI transcript classification on `featured_reels`. */
export async function updateFeaturedReelClassification(
  id: number,
  data: {
    contentType: string;
    remakeabilityScore: number;
    suggestedAction: string;
    classificationReason: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(featuredReels)
    .set({
      contentType: data.contentType as FeaturedReel["contentType"],
      remakeabilityScore: data.remakeabilityScore,
      suggestedAction: data.suggestedAction as FeaturedReel["suggestedAction"],
      classificationReason: data.classificationReason,
      classifiedAt: new Date(),
    })
    .where(eq(featuredReels.id, id));
}

/** Bug #57 Tier 2: persist AI transcript classification on scraped `reels`. */
export async function updateReelClassification(
  id: number,
  data: {
    contentType: string;
    remakeabilityScore: number;
    suggestedAction: string;
    classificationReason: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(reels)
    .set({
      contentType: data.contentType as Reel["contentType"],
      remakeabilityScore: data.remakeabilityScore,
      suggestedAction: data.suggestedAction as Reel["suggestedAction"],
      classificationReason: data.classificationReason,
      classifiedAt: new Date(),
    })
    .where(eq(reels.id, id));
}

/** All recreated scripts attached to a featured reel (newest first). */
export async function getRecreatedScriptsByFeaturedReelId(
  featuredReelId: number,
  workspaceId: string
): Promise<RecreatedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(recreatedScripts)
    .where(
      and(
        eq(recreatedScripts.featuredReelId, featuredReelId),
        eq(recreatedScripts.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(recreatedScripts.createdAt));
}

// ── Saved Reels ──

export async function saveReel(
  data: Omit<InsertSavedReel, "workspaceId"> & Partial<Pick<InsertSavedReel, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const result = await db.insert(savedReels).values({ ...data, workspaceId });
  return result[0].insertId;
}

export async function unsaveReel(
  workspaceId: string,
  userId: number,
  reelId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(savedReels)
    .where(
      and(
        eq(savedReels.workspaceId, workspaceId),
        eq(savedReels.userId, userId),
        eq(savedReels.reelId, reelId)
      )
    );
}

export async function getSavedReelsByWorkspace(workspaceId: string): Promise<SavedReel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(savedReels)
    .where(eq(savedReels.workspaceId, workspaceId))
    .orderBy(desc(savedReels.createdAt));
}

export async function isReelSaved(
  workspaceId: string,
  userId: number,
  reelId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(savedReels)
    .where(
      and(
        eq(savedReels.workspaceId, workspaceId),
        eq(savedReels.userId, userId),
        eq(savedReels.reelId, reelId)
      )
    )
    .limit(1);
  return result.length > 0;
}

// ── Saved Reels (featured variant) ──

/** Save a featured-catalog reel. Returns the saved_reels row id. */
export async function saveFeaturedReel(
  userId: number,
  featuredReelId: number,
  workspaceId: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(savedReels).values({
    userId,
    workspaceId,
    reelId: null,
    jobId: null,
    featuredReelId,
  });
  return result[0].insertId;
}

export async function unsaveFeaturedReel(
  workspaceId: string,
  userId: number,
  featuredReelId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(savedReels)
    .where(
      and(
        eq(savedReels.workspaceId, workspaceId),
        eq(savedReels.userId, userId),
        eq(savedReels.featuredReelId, featuredReelId)
      )
    );
}

export async function isFeaturedReelSaved(
  workspaceId: string,
  userId: number,
  featuredReelId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ id: savedReels.id })
    .from(savedReels)
    .where(
      and(
        eq(savedReels.workspaceId, workspaceId),
        eq(savedReels.userId, userId),
        eq(savedReels.featuredReelId, featuredReelId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Saved featured-reel rows joined with their featured_reels + featured_accounts
 * and any existing transcription. Shape mirrors `getSavedReelsWithDetails`
 * closely so the frontend can render both with minimal branching — the
 * `source: "featured"` discriminator tells the UI which navigation path to
 * use (clicking the handle should open /dashboard?featuredAccountId=…).
 */
type SavedReelFeatured = Omit<SavedReel, "reelId" | "jobId" | "featuredReelId"> & {
  reelId: null;
  jobId: null;
  featuredReelId: number;
};

export async function getSavedFeaturedReelsWithDetails(
  workspaceId: string
): Promise<
  Array<
    SavedReelFeatured & {
      featuredReel: FeaturedReel;
      featuredAccount: {
        id: number;
        handle: string;
        displayName: string | null;
        followerCount: number;
        profilePicUrl: string | null;
      };
      transcription?: Transcription;
    }
  >
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      saved: savedReels,
      featuredReel: featuredReels,
      accId: featuredAccounts.id,
      accHandle: featuredAccounts.handle,
      accDisplay: featuredAccounts.displayName,
      accFollowers: featuredAccounts.followerCount,
      accPic: featuredAccounts.profilePicUrl,
    })
    .from(savedReels)
    .innerJoin(featuredReels, eq(savedReels.featuredReelId, featuredReels.id))
    .innerJoin(featuredAccounts, eq(featuredReels.featuredAccountId, featuredAccounts.id))
    .where(and(eq(savedReels.workspaceId, workspaceId), isNotNull(savedReels.featuredReelId)))
    .orderBy(desc(savedReels.createdAt));

  return rows.map(({ saved, featuredReel: fr, accId, accHandle, accDisplay, accFollowers, accPic }) => ({
    ...saved,
    reelId: null,
    jobId: null,
    featuredReelId: saved.featuredReelId as number,
    featuredReel: fr,
    featuredAccount: {
      id: accId,
      handle: accHandle,
      displayName: accDisplay,
      followerCount: accFollowers,
      profilePicUrl: accPic,
    },
    transcription: transcriptionViewFromFeaturedReelRow(fr),
  }));
}

/**
 * Saved scraped-reel rows joined with their reel + scrape_job. Featured-
 * catalog saves (identified by a populated `featuredReelId`) are filtered
 * out here and surfaced via a sibling helper added in Commit 3b; the
 * narrow return type (reelId / jobId guaranteed non-null) lets existing
 * frontend callers keep working without null checks.
 */
type SavedReelScraped = Omit<SavedReel, "reelId" | "jobId" | "featuredReelId"> & {
  reelId: number;
  jobId: number;
  featuredReelId: null;
};

export async function getSavedReelsWithDetails(
  workspaceId: string
): Promise<Array<SavedReelScraped & { reel: Reel; job: ScrapeJob; transcription?: Transcription }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const joined = await db
    .select({
      saved: savedReels,
      reel: reels,
      job: scrapeJobs,
    })
    .from(savedReels)
    .innerJoin(reels, eq(savedReels.reelId, reels.id))
    .innerJoin(scrapeJobs, eq(savedReels.jobId, scrapeJobs.id))
    .where(
      and(
        eq(savedReels.workspaceId, workspaceId),
        isNotNull(savedReels.reelId),
        isNotNull(savedReels.jobId),
        gt(savedReels.jobId, 0)
      )
    )
    .orderBy(desc(savedReels.createdAt));

  if (joined.length === 0) return [];

  const reelIds = [...new Set(joined.map((row) => row.reel.id))];
  const txByReelId = new Map<number, Transcription>();
  for (let i = 0; i < reelIds.length; i += TRANSCRIPTION_BATCH_BY_REEL_IDS) {
    const chunk = reelIds.slice(i, i + TRANSCRIPTION_BATCH_BY_REEL_IDS);
    const txs = await db.select().from(transcriptions).where(inArray(transcriptions.reelId, chunk));
    for (const t of txs) {
      if (t.reelId == null) continue;
      const prev = txByReelId.get(t.reelId);
      if (!prev || t.id > prev.id) txByReelId.set(t.reelId, t);
    }
  }

  const results: Array<SavedReelScraped & { reel: Reel; job: ScrapeJob; transcription?: Transcription }> =
    [];

  for (const { saved: s, reel, job } of joined) {
    results.push({
      ...s,
      reelId: s.reelId as number,
      jobId: s.jobId as number,
      featuredReelId: null,
      reel,
      job,
      transcription: txByReelId.get(reel.id),
    });
  }

  return results;
}

/** Discover/collected saves: saved_reels with jobId 0, no scrape_jobs row. */
type SavedReelDiscover = Omit<SavedReel, "reelId" | "jobId" | "featuredReelId"> & {
  reelId: number;
  jobId: 0;
  featuredReelId: null;
};

export type SavedDiscoverSyntheticJob = {
  id: 0;
  handle: string;
  followerCount: 0;
  featuredAccountId: null;
};

export async function getSavedDiscoverReelsWithDetails(
  workspaceId: string
): Promise<
  Array<
    SavedReelDiscover & {
      reel: Reel;
      job: SavedDiscoverSyntheticJob;
      transcription?: Transcription;
    }
  >
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const joined = await db
    .select({
      saved: savedReels,
      reel: reels,
    })
    .from(savedReels)
    .innerJoin(reels, eq(savedReels.reelId, reels.id))
    .where(
      and(
        eq(savedReels.workspaceId, workspaceId),
        isNotNull(savedReels.reelId),
        eq(savedReels.jobId, 0)
      )
    )
    .orderBy(desc(savedReels.createdAt));

  if (joined.length === 0) return [];

  const reelIds = [...new Set(joined.map((row) => row.reel.id))];
  const txByReelId = new Map<number, Transcription>();
  for (let i = 0; i < reelIds.length; i += TRANSCRIPTION_BATCH_BY_REEL_IDS) {
    const chunk = reelIds.slice(i, i + TRANSCRIPTION_BATCH_BY_REEL_IDS);
    const txs = await db.select().from(transcriptions).where(inArray(transcriptions.reelId, chunk));
    for (const t of txs) {
      if (t.reelId == null) continue;
      const prev = txByReelId.get(t.reelId);
      if (!prev || t.id > prev.id) txByReelId.set(t.reelId, t);
    }
  }

  const results: Array<
    SavedReelDiscover & {
      reel: Reel;
      job: SavedDiscoverSyntheticJob;
      transcription?: Transcription;
    }
  > = [];

  for (const { saved: s, reel } of joined) {
    const handle = (reel.ownerUsername ?? "").replace(/^@/, "").trim() || "unknown";
    results.push({
      ...s,
      reelId: s.reelId as number,
      jobId: 0,
      featuredReelId: null,
      reel,
      job: {
        id: 0,
        handle,
        followerCount: 0,
        featuredAccountId: null,
      },
      transcription: txByReelId.get(reel.id),
    });
  }

  return results;
}

// ── Script Tags ──

export async function createScriptTag(
  data: Omit<InsertScriptTag, "workspaceId"> & Partial<Pick<InsertScriptTag, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const result = await db.insert(scriptTags).values({ ...data, workspaceId });
  return result[0].insertId;
}

export async function getScriptTagsByWorkspace(workspaceId: string): Promise<ScriptTag[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(scriptTags)
    .where(eq(scriptTags.workspaceId, workspaceId))
    .orderBy(asc(scriptTags.sortOrder));
}

export async function getScriptTagById(id: number): Promise<ScriptTag | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(scriptTags).where(eq(scriptTags.id, id)).limit(1);
  return result[0];
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

export async function ensureDefaultTags(
  workspaceId: string,
  createdByUserId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(scriptTags)
    .where(and(eq(scriptTags.workspaceId, workspaceId), eq(scriptTags.isDefault, 1)));
  if (existing.length > 0) return;
  const defaults = [
    { name: "Scripting", color: "#7c3aed", sortOrder: 1 },
    { name: "Rehearsing", color: "#2563eb", sortOrder: 2 },
    { name: "Filming", color: "#d97706", sortOrder: 3 },
    { name: "Editing", color: "#059669", sortOrder: 4 },
    { name: "Posting", color: "#dc2626", sortOrder: 5 },
  ];
  for (const d of defaults) {
    await db.insert(scriptTags).values({
      userId: createdByUserId,
      workspaceId,
      ...d,
      isDefault: 1,
    });
  }
}

// ── Saved Scripts ──

export async function createSavedScript(
  data: Omit<InsertSavedScript, "workspaceId"> & Partial<Pick<InsertSavedScript, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const result = await db.insert(savedScripts).values({ ...data, workspaceId });
  return result[0].insertId;
}

export async function getSavedScript(id: number): Promise<SavedScript | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(savedScripts).where(eq(savedScripts.id, id)).limit(1);
  return result[0];
}

export async function getSavedScriptsByWorkspace(workspaceId: string): Promise<SavedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(savedScripts)
    .where(eq(savedScripts.workspaceId, workspaceId))
    .orderBy(desc(savedScripts.postDate), desc(savedScripts.updatedAt));
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
  const workspaceId = await getSavedScriptWorkspaceId(scriptId);
  await db.insert(scriptTagAssignments).values({ scriptId, tagId, workspaceId });
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

/** Find a tag by name in a workspace, or create a non-default tag with the same styling. */
export async function findOrCreateScriptTagInWorkspace(
  workspaceId: string,
  userId: number,
  name: string,
  color: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(scriptTags)
    .where(and(eq(scriptTags.workspaceId, workspaceId), eq(scriptTags.name, name)))
    .limit(1);
  if (existing) return existing.id;
  return createScriptTag({
    userId,
    workspaceId,
    name,
    color,
    sortOrder: 99,
    isDefault: 0,
  });
}

export async function workspaceHasScriptForReel(
  workspaceId: string,
  userId: number,
  reelId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select({ id: savedScripts.id })
    .from(savedScripts)
    .where(
      and(
        eq(savedScripts.workspaceId, workspaceId),
        eq(savedScripts.userId, userId),
        eq(savedScripts.reelId, reelId)
      )
    )
    .limit(1);
  return Boolean(row);
}

export async function workspaceHasScriptForRecreated(
  workspaceId: string,
  userId: number,
  recreatedScriptId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select({ id: savedScripts.id })
    .from(savedScripts)
    .where(
      and(
        eq(savedScripts.workspaceId, workspaceId),
        eq(savedScripts.userId, userId),
        eq(savedScripts.recreatedScriptId, recreatedScriptId)
      )
    )
    .limit(1);
  return Boolean(row);
}

export async function getScriptsByTag(
  workspaceId: string,
  tagId: number
): Promise<SavedScript[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const assignments = await db
    .select()
    .from(scriptTagAssignments)
    .where(eq(scriptTagAssignments.tagId, tagId));
  if (assignments.length === 0) return [];
  const scriptIds = assignments.map((a) => a.scriptId);
  return db
    .select()
    .from(savedScripts)
    .where(
      and(eq(savedScripts.workspaceId, workspaceId), inArray(savedScripts.id, scriptIds))
    )
    .orderBy(desc(savedScripts.updatedAt));
}

// ── Script Versions ──

export async function createScriptVersion(
  data: Omit<InsertScriptVersion, "workspaceId"> & Partial<Pick<InsertScriptVersion, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getSavedScriptWorkspaceId(data.scriptId));
  const result = await db.insert(scriptVersions).values({ ...data, workspaceId });
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

/** Published posts that should appear in sitemap and public blog index. */
export async function getPublishedIndexableBlogPosts(): Promise<BlogPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.status, "published"), eq(blogPosts.noIndex, false)))
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

let collectedReelIngestColumnsCached: boolean | undefined;

/** Migration 0044 — probe so staging can deploy before SQL is applied. */
export async function hasCollectedReelIngestColumns(): Promise<boolean> {
  if (collectedReelIngestColumnsCached !== undefined) {
    return collectedReelIngestColumnsCached;
  }
  const db = await getDb();
  if (!db) {
    collectedReelIngestColumnsCached = false;
    return false;
  }
  try {
    await db.execute(
      sql`SELECT fetchAttempts, lastFetchAt, nextFetchAt, fetchProvider FROM collected_reels LIMIT 0`
    );
    collectedReelIngestColumnsCached = true;
  } catch {
    collectedReelIngestColumnsCached = false;
    console.warn(
      "[db] collected_reels ingest columns missing — run drizzle/0044_collected_reel_ingest.sql"
    );
  }
  return collectedReelIngestColumnsCached;
}

export async function collectedReelsColumnsForQuery() {
  return collectedReelsSelectColumns(await hasCollectedReelIngestColumns());
}

function collectedReelsSelectColumns(includeIngest: boolean) {
  const all = getTableColumns(collectedReels);
  if (includeIngest) return all;
  const {
    fetchAttempts: _a,
    lastFetchAt: _b,
    nextFetchAt: _c,
    fetchProvider: _d,
    ...core
  } = all;
  return core;
}

function withIngestDefaults(row: Record<string, unknown>): CollectedReel {
  return {
    ...row,
    fetchAttempts: (row.fetchAttempts as number | undefined) ?? 0,
    lastFetchAt: (row.lastFetchAt as Date | null | undefined) ?? null,
    nextFetchAt: (row.nextFetchAt as Date | null | undefined) ?? null,
    fetchProvider: (row.fetchProvider as string | null | undefined) ?? null,
  } as CollectedReel;
}

async function stripIngestFieldsIfNeeded<T extends Record<string, unknown>>(
  data: T
): Promise<Partial<T>> {
  if (await hasCollectedReelIngestColumns()) return data;
  const out = { ...data };
  delete out.fetchAttempts;
  delete out.lastFetchAt;
  delete out.nextFetchAt;
  delete out.fetchProvider;
  return out;
}

export async function createCollectedReel(
  data: Omit<InsertCollectedReel, "workspaceId"> & Partial<Pick<InsertCollectedReel, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const values = (await stripIngestFieldsIfNeeded({ ...data, workspaceId })) as InsertCollectedReel;
  const result = await db.insert(collectedReels).values(values);
  return result[0].insertId;
}

export async function getCollectedReelsByWorkspace(workspaceId: string): Promise<CollectedReel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const includeIngest = await hasCollectedReelIngestColumns();
  const rows = await db
    .select(collectedReelsSelectColumns(includeIngest))
    .from(collectedReels)
    .where(eq(collectedReels.workspaceId, workspaceId))
    .orderBy(desc(collectedReels.createdAt));
  return includeIngest ? (rows as CollectedReel[]) : rows.map((r) => withIngestDefaults(r));
}

export async function getCollectedReelById(id: number): Promise<CollectedReel | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const includeIngest = await hasCollectedReelIngestColumns();
  const result = await db
    .select(collectedReelsSelectColumns(includeIngest))
    .from(collectedReels)
    .where(eq(collectedReels.id, id))
    .limit(1);
  const row = result[0];
  if (!row) return undefined;
  return includeIngest ? (row as CollectedReel) : withIngestDefaults(row);
}

export async function updateCollectedReel(id: number, data: Partial<Omit<CollectedReel, "id" | "createdAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const patch = (await stripIngestFieldsIfNeeded(data)) as Partial<
    Omit<CollectedReel, "id" | "createdAt">
  >;
  await db.update(collectedReels).set(patch).where(eq(collectedReels.id, id));
}

export async function deleteCollectedReel(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(collectedReels).where(eq(collectedReels.id, id));
}

export async function deleteFailedCollectedReelsByWorkspace(workspaceId: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ id: collectedReels.id })
    .from(collectedReels)
    .where(and(eq(collectedReels.workspaceId, workspaceId), eq(collectedReels.status, "failed")));
  if (rows.length === 0) return 0;
  await db.delete(collectedReels).where(
    inArray(
      collectedReels.id,
      rows.map((r) => r.id)
    )
  );
  return rows.length;
}

export async function getCollectedReelByShortcode(
  workspaceId: string,
  shortcode: string
): Promise<CollectedReel | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const includeIngest = await hasCollectedReelIngestColumns();
  const result = await db
    .select(collectedReelsSelectColumns(includeIngest))
    .from(collectedReels)
    .where(and(eq(collectedReels.workspaceId, workspaceId), eq(collectedReels.shortcode, shortcode)))
    .limit(1);
  const row = result[0];
  if (!row) return undefined;
  return includeIngest ? (row as CollectedReel) : withIngestDefaults(row);
}

/** Pending collected reels due for background ingest (worker / sweeper). */
export async function listCollectedReelsDueForIngest(limit: number): Promise<CollectedReel[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const includeIngest = await hasCollectedReelIngestColumns();
  if (!includeIngest) {
    const rows = await db
      .select(collectedReelsSelectColumns(false))
      .from(collectedReels)
      .where(eq(collectedReels.status, "pending"))
      .orderBy(asc(collectedReels.createdAt))
      .limit(limit);
    return rows.map((r) => withIngestDefaults(r));
  }
  const now = new Date();
  const maxAttempts = 24;
  const rows = await db
    .select(collectedReelsSelectColumns(true))
    .from(collectedReels)
    .where(
      and(
        eq(collectedReels.status, "pending"),
        lt(collectedReels.fetchAttempts, maxAttempts),
        or(isNull(collectedReels.nextFetchAt), lte(collectedReels.nextFetchAt, now))
      )
    )
    .orderBy(asc(collectedReels.createdAt))
    .limit(limit);
  return rows as CollectedReel[];
}


// ── Script Ideas ──

export async function createScriptIdea(
  data: Omit<InsertScriptIdea, "workspaceId"> & Partial<Pick<InsertScriptIdea, "workspaceId">>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const workspaceId = data.workspaceId ?? (await getPersonalWorkspaceId(data.userId));
  const result = await db.insert(scriptIdeas).values({ ...data, workspaceId });
  return Number(result[0].insertId);
}

export async function getScriptIdeasByWorkspace(workspaceId: string): Promise<ScriptIdea[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(scriptIdeas)
    .where(eq(scriptIdeas.workspaceId, workspaceId))
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

export async function getLibraryTranscripts(
  workspaceId: string,
  opts: { search?: string; source?: string; limit?: number; offset?: number } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { search, source, limit = 50, offset = 0 } = opts;

  // 1. Transcripts from scraped reels (via scrape_jobs in workspace)
  const userJobs = await db
    .select({ id: scrapeJobs.id, handle: scrapeJobs.handle })
    .from(scrapeJobs)
    .where(eq(scrapeJobs.workspaceId, workspaceId));
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
          // `reelId` is nullable post-migration 0028; narrow via cast
          // since we only want scraped-reel rows here (featuredReelId-
          // driven rows never land in reelMap anyway).
          inArray(transcriptions.reelId as any, reelIds),
          eq(transcriptions.status, "completed")
        )
      );
      for (const t of tRows) {
        if (t.reelId == null) continue;
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

  // 2. Transcripts from collected reels (via reels.shortcode → transcriptions.reelId)
  let collectedTranscripts: typeof scrapedTranscripts = [];
  if (!source || source === "collected") {
    const collected = await db
      .select()
      .from(collectedReels)
      .where(eq(collectedReels.workspaceId, workspaceId));
    if (collected.length > 0) {
      const shortcodes = [...new Set(collected.map((c) => c.shortcode).filter(Boolean))] as string[];
      if (shortcodes.length > 0) {
        const reelsMatching = await db.select().from(reels).where(inArray(reels.shortcode, shortcodes));
        const reelByShortcode = new Map(reelsMatching.map((r) => [r.shortcode, r]));
        const reelIds = reelsMatching.map((r) => r.id);
        if (reelIds.length > 0) {
          const tRows = await db
            .select()
            .from(transcriptions)
            .where(and(inArray(transcriptions.reelId as any, reelIds), eq(transcriptions.status, "completed")));
          const tByReelId = new Map(
            tRows.filter((t) => t.reelId != null).map((t) => [t.reelId as number, t])
          );
          for (const cr of collected) {
            const reel = reelByShortcode.get(cr.shortcode);
            if (!reel) continue;
            const t = tByReelId.get(reel.id);
            if (!t || t.reelId == null) continue;
            collectedTranscripts.push({
              id: t.id,
              reelId: t.reelId,
              transcript: t.transcript,
              hookAnalysis: t.hookAnalysis,
              status: t.status,
              createdAt: t.createdAt,
              source: "collected",
              sourceHandle: cr.ownerUsername || null,
              reelUrl: cr.reelUrl,
              thumbnailUrl: cr.thumbnailUrl,
              caption: cr.caption,
            });
          }
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

export async function getLibraryScripts(
  workspaceId: string,
  opts: { search?: string; source?: string; status?: string; limit?: number; offset?: number } = {}
) {
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
    const saved = await db
      .select()
      .from(savedScripts)
      .where(eq(savedScripts.workspaceId, workspaceId))
      .orderBy(desc(savedScripts.createdAt));
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
    const recreated = await db
      .select()
      .from(recreatedScripts)
      .where(
        and(eq(recreatedScripts.workspaceId, workspaceId), eq(recreatedScripts.status, "completed"))
      )
      .orderBy(desc(recreatedScripts.createdAt));

    // Get saved script recreatedScriptIds to exclude already-saved ones
    const savedWithRecreated = await db
      .select({ recreatedScriptId: savedScripts.recreatedScriptId })
      .from(savedScripts)
      .where(eq(savedScripts.workspaceId, workspaceId));
    const savedRecreatedIds = new Set(savedWithRecreated.map(s => s.recreatedScriptId).filter(Boolean));

    const recreatedNeedingReel = recreated.filter(
      (r) => !savedRecreatedIds.has(r.id) && r.reelId != null
    );
    const reelIdsNeeded = [...new Set(recreatedNeedingReel.map((r) => r.reelId as number))];
    const reelsRows =
      reelIdsNeeded.length > 0
        ? await db.select().from(reels).where(inArray(reels.id, reelIdsNeeded))
        : [];
    const reelById = Object.fromEntries(reelsRows.map((row) => [row.id, row]));

    for (const r of recreated) {
      if (savedRecreatedIds.has(r.id)) continue;
      if (r.reelId == null) continue;
      const reelRow = reelById[r.reelId];
      let title = r.topic || "Untitled Script";
      if (/^(SAME_TOPIC|make\s+(it\s+)?simil|rewrite|recreate)/i.test(title) && r.generatedScript) {
        const firstLine = r.generatedScript.split(/[.!?\n]/)[0]?.trim();
        title = firstLine ? (firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine) : "Re-Created Script";
      }
      scripts.push({
        id: r.id,
        title,
        content: r.generatedScript || "",
        sourceHandle: reelRow?.ownerUsername || null,
        status: "draft",
        source: "recreated",
        wordCount: (r.generatedScript || "").split(/\s+/).length,
        gradeLevel: r.gradeLevel,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    }
  }

  // 3. Idea-generated scripts not yet saved
  if (!source || source === "idea") {
    const ideas = await db
      .select()
      .from(scriptIdeas)
      .where(and(eq(scriptIdeas.workspaceId, workspaceId), eq(scriptIdeas.status, "completed")))
      .orderBy(desc(scriptIdeas.createdAt));

    const savedIdeaIds = new Set(
      (
        await db
          .select({ id: savedScripts.id })
          .from(savedScripts)
          .where(eq(savedScripts.workspaceId, workspaceId))
      ).map((s) => s.id)
    );

    for (const idea of ideas) {
      if (idea.savedScriptId && savedIdeaIds.has(idea.savedScriptId)) continue;
      scripts.push({
        id: idea.id, title: idea.generatedTitle || (idea.idea || "").slice(0, 60),
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

// ── Brand Coach scores ─────────────────────────────────────────
// One cached AI viral-potential analysis per reel. Lookups are by
// reelId (user-scraped) OR featuredReelId (catalog). Both UNIQUE.

export async function createBrandCoachScore(
  data: InsertBrandCoachScore
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(brandCoachScores).values(data);
  return result[0].insertId;
}

export async function getBrandCoachScoreByReelId(
  reelId: number
): Promise<BrandCoachScore | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(brandCoachScores)
    .where(eq(brandCoachScores.reelId, reelId))
    .limit(1);
  return rows[0];
}

export async function getBrandCoachScoreByFeaturedReelId(
  featuredReelId: number
): Promise<BrandCoachScore | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(brandCoachScores)
    .where(eq(brandCoachScores.featuredReelId, featuredReelId))
    .limit(1);
  return rows[0];
}

export async function deleteBrandCoachScoreByReelId(reelId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(brandCoachScores).where(eq(brandCoachScores.reelId, reelId));
}

export async function deleteBrandCoachScoreByFeaturedReelId(
  featuredReelId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(brandCoachScores)
    .where(eq(brandCoachScores.featuredReelId, featuredReelId));
}

/** Batch fetch cached scores for a list of reel ids. Returns a map. */
export async function getBrandCoachScoresBatch(opts: {
  reelIds?: number[];
  featuredReelIds?: number[];
}): Promise<{
  byReelId: Record<number, BrandCoachScore>;
  byFeaturedReelId: Record<number, BrandCoachScore>;
}> {
  const byReelId: Record<number, BrandCoachScore> = {};
  const byFeaturedReelId: Record<number, BrandCoachScore> = {};

  const db = await getDb();
  if (!db) return { byReelId, byFeaturedReelId };

  if (opts.reelIds && opts.reelIds.length > 0) {
    const rows = await db
      .select()
      .from(brandCoachScores)
      .where(inArray(brandCoachScores.reelId, opts.reelIds));
    for (const row of rows) {
      if (row.reelId != null) byReelId[row.reelId] = row;
    }
  }

  if (opts.featuredReelIds && opts.featuredReelIds.length > 0) {
    const rows = await db
      .select()
      .from(brandCoachScores)
      .where(inArray(brandCoachScores.featuredReelId, opts.featuredReelIds));
    for (const row of rows) {
      if (row.featuredReelId != null) byFeaturedReelId[row.featuredReelId] = row;
    }
  }

  return { byReelId, byFeaturedReelId };
}

export async function insertEmailEventRow(data: {
  resendEmailId?: string | null;
  eventType: string;
  recipient?: string | null;
  templateSlug?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Email] Skipping email_events insert: database unavailable");
    return;
  }
  await db.insert(emailEvents).values({
    resendEmailId: data.resendEmailId ?? null,
    eventType: data.eventType,
    recipient: data.recipient ?? null,
    templateSlug: data.templateSlug ?? null,
    payload: data.payload,
  });
}
