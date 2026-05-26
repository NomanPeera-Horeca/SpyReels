import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  outreachEmails,
  savedScripts,
  scrapeJobs,
  subscriptions,
  users,
} from "../../drizzle/schema";
import { adminPanelProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sendOutreachPlainTextEmail } from "../utils/email";
import { buildOutreachSystemPrompt } from "./claude-prompt";
import {
  buildBehaviorNotes,
  computeRetentionStatus,
  computeSegment,
  SEGMENT_SORT_ORDER,
  type OutreachSegment,
} from "./segments";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_SENDS_PER_HOUR = 10;
const BULK_GENERATE_MAX = 20;

function stripCodeFences(text: string): string {
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
  }
  return trimmed.trim();
}

function parseDraftJson(raw: string): { subject: string; body: string } {
  const data = JSON.parse(stripCodeFences(raw)) as {
    subject?: string;
    body?: string;
  };
  const subject = data.subject?.trim();
  const body = data.body?.trim();
  if (!subject || !body) {
    throw new Error("Claude response missing subject or body");
  }
  if (subject.includes("<") || subject.includes(">") || body.includes("<") || body.includes(">")) {
    throw new Error("Draft must be plain text without HTML tags");
  }
  return { subject, body };
}

function attributionLabel(user: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  firstReferrer: string | null;
}): string {
  if (user.utmSource) {
    return [user.utmSource, user.utmMedium, user.utmCampaign].filter(Boolean).join(" / ");
  }
  if (user.firstReferrer) {
    return user.firstReferrer;
  }
  return "unknown";
}

async function fetchUserContext(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const recentJobs = await db
    .select({
      handle: scrapeJobs.handle,
      status: scrapeJobs.status,
      failureReason: scrapeJobs.failureReason,
      createdAt: scrapeJobs.createdAt,
    })
    .from(scrapeJobs)
    .where(eq(scrapeJobs.userId, userId))
    .orderBy(desc(scrapeJobs.createdAt))
    .limit(10);

  const [scriptCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(savedScripts)
    .where(eq(savedScripts.userId, userId));

  const recentScriptsCount = Number(scriptCountRow?.count ?? 0);

  const [scrapeCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(scrapeJobs)
    .where(eq(scrapeJobs.userId, userId));
  const scrapeJobsRun = Number(scrapeCountRow?.count ?? 0);

  const recentScrapes = recentJobs
    .slice(0, 3)
    .map((j) => j.handle)
    .filter(Boolean);

  const recentFailed = recentJobs.find(
    (j) => j.status === "failed" && j.failureReason
  );

  const now = new Date();
  const daysSinceActive = Math.floor(
    (now.getTime() - user.lastSignedIn.getTime()) / (1000 * 60 * 60 * 24)
  );
  const retentionStatus = computeRetentionStatus(user.lastSignedIn, now);
  const plan = sub?.plan ?? "free";
  const subscriptionStatus = sub?.status ?? null;
  const cancelAtPeriodEnd = Boolean(sub?.cancelAtPeriodEnd);

  const segment = computeSegment({
    plan,
    subscriptionStatus,
    cancelAtPeriodEnd,
    retentionStatus,
    scrapeJobsRun,
    scriptsCreated: recentScriptsCount,
    reelsCollected: 0,
    recentFailedScrape: Boolean(recentFailed),
  });

  const behaviorNotes = buildBehaviorNotes({
    scrapeJobsRun,
    scriptsCreated: recentScriptsCount,
    reelsCollected: 0,
    daysSinceActive,
    recentFailedReason: recentFailed?.failureReason ?? null,
    utmSource: user.utmSource,
  });

  return {
    user,
    sub,
    plan,
    subscriptionStatus,
    retentionStatus,
    segment,
    recentScrapes,
    recentScriptsCount,
    scrapeJobsRun,
    daysSinceActive,
    behaviorNotes,
    lastActiveAt: user.lastSignedIn,
    attributionSource: attributionLabel(user),
  };
}

async function generateDraftForUser(userId: number): Promise<{
  draftId: number;
  subject: string;
  body: string;
}> {
  const ctx = await fetchUserContext(userId);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ANTHROPIC_API_KEY is not set" });
  }

  const client = new Anthropic({ apiKey });
  const displayName = ctx.user.name?.trim() || "unknown";
  const systemPrompt = buildOutreachSystemPrompt({
    name: displayName,
    email: ctx.user.email ?? "unknown",
    plan: ctx.plan,
    status: ctx.retentionStatus,
    lastActiveAt: ctx.lastActiveAt.toISOString(),
    attributionSource: ctx.attributionSource,
    recentScrapes: ctx.recentScrapes.length > 0 ? ctx.recentScrapes.join(", ") : "none",
    recentScriptsCount: ctx.recentScriptsCount,
    segment: ctx.segment,
    behaviorNotes: ctx.behaviorNotes,
  });

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 600,
    temperature: 0.4,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: "Draft the outreach email and return only the JSON object.",
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in Claude response");
  }

  const { subject, body } = parseDraftJson(textBlock.text);
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }

  const [existingDraft] = await db
    .select()
    .from(outreachEmails)
    .where(eq(outreachEmails.userId, userId))
    .orderBy(desc(outreachEmails.id))
    .limit(1);

  const canOverwrite =
    existingDraft &&
    (existingDraft.status === "draft" || existingDraft.status === "failed");

  if (canOverwrite) {
    await db
      .update(outreachEmails)
      .set({
        subject,
        body,
        status: "draft",
        draftedAt: new Date(),
        sentAt: null,
        resendMessageId: null,
        errorMessage: null,
      })
      .where(eq(outreachEmails.id, existingDraft.id));

    return {
      draftId: existingDraft.id,
      subject,
      body,
    };
  }

  const insertResult = await db.insert(outreachEmails).values({
    userId,
    subject,
    body,
    status: "draft",
    draftedAt: new Date(),
  });

  return {
    draftId: insertResult[0].insertId,
    subject,
    body,
  };
}

async function countSendsInLastHour(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(outreachEmails)
    .where(
      and(eq(outreachEmails.status, "sent"), gte(outreachEmails.sentAt, oneHourAgo))
    );
  return Number(rows[0]?.count ?? 0);
}

async function minutesUntilSendRateLimitClears(): Promise<number> {
  const db = await getDb();
  if (!db) return 60;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [oldest] = await db
    .select({ sentAt: outreachEmails.sentAt })
    .from(outreachEmails)
    .where(
      and(eq(outreachEmails.status, "sent"), gte(outreachEmails.sentAt, oneHourAgo))
    )
    .orderBy(asc(outreachEmails.sentAt))
    .limit(1);
  if (!oldest?.sentAt) return 60;
  const unlockAt = oldest.sentAt.getTime() + 60 * 60 * 1000;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / (60 * 1000)));
}

export const outreachRouter = router({
  listUsers: adminPanelProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return { users: [], stats: { total: 0, draftsPending: 0, sentToday: 0 } };
    }

    const allUsers = await db.select().from(users);
    const allSubs = await db.select().from(subscriptions);
    const subMap = new Map(allSubs.map((s) => [s.userId, s]));

    const scriptCounts = await db
      .select({
        userId: savedScripts.userId,
        count: sql<number>`count(*)`,
      })
      .from(savedScripts)
      .groupBy(savedScripts.userId);
    const scriptMap = new Map(scriptCounts.map((s) => [s.userId, Number(s.count)]));

    const scrapeCounts = await db
      .select({
        userId: scrapeJobs.userId,
        count: sql<number>`count(*)`,
      })
      .from(scrapeJobs)
      .groupBy(scrapeJobs.userId);
    const scrapeMap = new Map(scrapeCounts.map((s) => [s.userId, Number(s.count)]));

    const allJobs = await db
      .select({
        userId: scrapeJobs.userId,
        handle: scrapeJobs.handle,
        status: scrapeJobs.status,
        failureReason: scrapeJobs.failureReason,
        createdAt: scrapeJobs.createdAt,
      })
      .from(scrapeJobs)
      .orderBy(desc(scrapeJobs.createdAt));

    const jobsByUser = new Map<number, typeof allJobs>();
    for (const job of allJobs) {
      const list = jobsByUser.get(job.userId) ?? [];
      if (list.length < 10) list.push(job);
      jobsByUser.set(job.userId, list);
    }

    const allOutreach = await db
      .select()
      .from(outreachEmails)
      .orderBy(desc(outreachEmails.id));

    const latestOutreachByUser = new Map<number, (typeof allOutreach)[0]>();
    for (const row of allOutreach) {
      if (!latestOutreachByUser.has(row.userId)) {
        latestOutreachByUser.set(row.userId, row);
      }
    }

    const now = new Date();
    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    let draftsPending = 0;
    let sentToday = 0;

    for (const row of allOutreach) {
      if (row.status === "draft") draftsPending += 1;
      if (
        row.status === "sent" &&
        row.sentAt &&
        row.sentAt >= startOfTodayUtc
      ) {
        sentToday += 1;
      }
    }

    const enriched = allUsers.map((u) => {
      const sub = subMap.get(u.id);
      const plan = sub?.plan ?? "free";
      const retentionStatus = computeRetentionStatus(u.lastSignedIn, now);
      const scrapeJobsRun = scrapeMap.get(u.id) ?? 0;
      const scriptsCreated = scriptMap.get(u.id) ?? 0;
      const userJobs = jobsByUser.get(u.id) ?? [];
      const recentFailed = userJobs.find(
        (j) => j.status === "failed" && j.failureReason
      );

      const segment = computeSegment({
        plan,
        subscriptionStatus: sub?.status ?? null,
        cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
        retentionStatus,
        scrapeJobsRun,
        scriptsCreated,
        reelsCollected: 0,
        recentFailedScrape: Boolean(recentFailed),
      });

      const latest = latestOutreachByUser.get(u.id);

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        plan,
        status: retentionStatus,
        subscriptionStatus: sub?.status ?? null,
        lastActiveAt: u.lastSignedIn,
        attributionSource: attributionLabel(u),
        recentScrapes: userJobs.slice(0, 3).map((j) => j.handle),
        recentScriptsCount: scriptsCreated,
        segment,
        latestOutreachEmail: latest
          ? {
              id: latest.id,
              subject: latest.subject,
              body: latest.body,
              status: latest.status,
              sentAt: latest.sentAt,
              draftedAt: latest.draftedAt,
              errorMessage: latest.errorMessage,
            }
          : null,
      };
    });

    enriched.sort((a, b) => {
      const segA = SEGMENT_SORT_ORDER[a.segment as OutreachSegment] ?? 99;
      const segB = SEGMENT_SORT_ORDER[b.segment as OutreachSegment] ?? 99;
      if (segA !== segB) return segA - segB;
      return b.lastActiveAt.getTime() - a.lastActiveAt.getTime();
    });

    return {
      users: enriched,
      stats: {
        total: enriched.length,
        draftsPending,
        sentToday,
      },
    };
  }),

  generateDraft: adminPanelProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      return generateDraftForUser(input.userId);
    }),

  updateDraft: adminPanelProcedure
    .input(
      z.object({
        draftId: z.number(),
        subject: z.string().min(1).max(500),
        body: z.string().min(1).max(8000),
      })
    )
    .mutation(async ({ input }) => {
      if (input.subject.includes("<") || input.subject.includes(">")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subject must be plain text without HTML",
        });
      }
      if (input.body.includes("<") || input.body.includes(">")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Body must be plain text without HTML",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [existing] = await db
        .select()
        .from(outreachEmails)
        .where(eq(outreachEmails.id, input.draftId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }
      if (existing.status === "sent") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a sent email" });
      }

      await db
        .update(outreachEmails)
        .set({
          subject: input.subject,
          body: input.body,
          status: "draft",
        })
        .where(eq(outreachEmails.id, input.draftId));

      return { ok: true as const };
    }),

  send: adminPanelProcedure
    .input(z.object({ draftId: z.number() }))
    .mutation(async ({ input }) => {
      const sendsLastHour = await countSendsInLastHour();
      if (sendsLastHour >= MAX_SENDS_PER_HOUR) {
        const minutesLeft = await minutesUntilSendRateLimitClears();
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit reached. Try again in ${minutesLeft} minutes.`,
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [draft] = await db
        .select()
        .from(outreachEmails)
        .where(eq(outreachEmails.id, input.draftId))
        .limit(1);

      if (!draft) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }
      if (draft.status === "sent") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Email already sent" });
      }

      const subject = draft.subject?.trim();
      const body = draft.body?.trim();
      if (!subject || !body) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Draft is incomplete" });
      }
      if (subject.includes("<") || subject.includes(">") || body.includes("<") || body.includes(">")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email must be plain text without HTML tags",
        });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, draft.userId))
        .limit(1);

      if (!user?.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User has no email address" });
      }

      await db
        .update(outreachEmails)
        .set({
          subject,
          body,
          updatedAt: new Date(),
        })
        .where(eq(outreachEmails.id, input.draftId));

      try {
        const resendMessageId = await sendOutreachPlainTextEmail(
          user.email,
          subject,
          body
        );

        await db
          .update(outreachEmails)
          .set({
            status: "sent",
            sentAt: new Date(),
            resendMessageId,
            errorMessage: null,
          })
          .where(eq(outreachEmails.id, input.draftId));

        return { ok: true as const, resendMessageId, to: user.email };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(outreachEmails)
          .set({
            status: "failed",
            errorMessage: message,
          })
          .where(eq(outreachEmails.id, input.draftId));

        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  bulkGenerateDrafts: adminPanelProcedure
    .input(z.object({ userIds: z.array(z.number()).min(1).max(BULK_GENERATE_MAX) }))
    .mutation(async ({ input }) => {
      const results: Array<{
        userId: number;
        ok: boolean;
        draftId?: number;
        error?: string;
      }> = [];

      for (const userId of input.userIds) {
        try {
          const draft = await generateDraftForUser(userId);
          results.push({ userId, ok: true, draftId: draft.draftId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ userId, ok: false, error: message });
        }
      }

      return { results };
    }),
});
