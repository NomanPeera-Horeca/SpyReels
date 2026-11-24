import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminPanelProcedure } from "../_core/trpc";
import {
  creatorViewEvents,
  nicheViewEvents,
  emailEvents,
  emailTemplates,
  users,
  monthlyUsage,
  scrapeJobs,
  savedScripts,
  subscriptions,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import {
  coachScriptQualityFiltersSchema,
  buildCoachScriptQualityReport,
  buildCoachScriptQualityDownload,
} from "../adminCoachScriptQuality";
import {
  trafficReportFiltersSchema,
  buildTrafficConversionReport,
} from "../adminTrafficMetrics";
import {
  panelUserFiltersSchema,
  buildPanelUserReport,
} from "../adminUserMetrics";
import { getDb } from "../db";
import { searchLibrary } from "../viralPosts/search/librarySearch";
import { FIELD_LABELS, queryTerms, words, stem } from "../viralPosts/search/scoring";
import {
  and,
  desc,
  asc,
  sql,
  isNotNull,
  or,
  eq,
  like,
  not,
} from "drizzle-orm";
import { getAlertTelemetry } from "../monitoring/alerts";
import {
  getActiveComplimentaryGrant,
  getComplimentaryAccessHistory,
  grantComplimentaryAccess,
  resolveAccessSource,
  resolveEffectivePlan,
  revokeComplimentaryAccess,
  type ComplimentaryPlan,
} from "../entitlements/complimentaryAccess";
import type { PlanId } from "../stripe/products";

const panelUserSummaryFiltersSchema = panelUserFiltersSchema.omit({
  limit: true,
  offset: true,
  sortBy: true,
  sortOrder: true,
});

const complimentaryPlanSchema = z.enum([
  "starter",
  "pro",
  "business",
  "agency",
]);

function inferPanelTestAccount(u: typeof users.$inferSelect): boolean {
  if (u.isTestAccount) return true;
  const e = (u.email || "").toLowerCase();
  const o = (u.openId || "").toLowerCase();
  if (
    e.includes("+test") ||
    e.endsWith("@example.com") ||
    e.endsWith("@example.org")
  )
    return true;
  if (o.includes("test_") || o.startsWith("demo_")) return true;
  return false;
}

export const adminRouter = router({
  ping: adminPanelProcedure.query(() => ({ ok: true as const })),

  /** Search Lab: try the library video search on real data and see why each video matched. */
  searchLab: adminPanelProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        platform: z.enum(["instagram", "tiktok", "youtube"]).nullable(),
        sort: z.enum(["best", "viral", "views", "newest"]),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      const started = Date.now();
      const result = await searchLibrary({ ...input, limit: 30 });
      const terms = queryTerms(input.query);
      const snippet = (text: string | undefined) => {
        if (!text) return null;
        const w = text.split(/\s+/);
        const hit = w.findIndex(x => terms.includes(stem(words(x)[0] ?? "")));
        if (hit < 0) return text.slice(0, 160);
        return `${hit > 12 ? "… " : ""}${w.slice(Math.max(0, hit - 12), hit + 18).join(" ")}…`;
      };
      return {
        terms,
        total: result.total,
        nextCursor: result.nextCursor,
        indexSize: result.indexSize,
        usedMeaning: result.usedMeaning,
        ms: Date.now() - started,
        items: result.matches.map(m => ({
          id: m.doc.id,
          platform: m.doc.platform,
          url: m.doc.url ?? "",
          creator: m.doc.creatorHandle,
          caption: (m.doc.fields.caption ?? "").slice(0, 200),
          summary: m.doc.fields.summary ?? null,
          spokenSnippet: m.matchedIn.includes("spoken") ? snippet(m.doc.fields.spoken) : null,
          hasTranscript: Boolean(m.doc.fields.spoken?.trim()),
          tier: m.tier,
          relevance: Math.round(m.relevance * 100),
          wordScore: Math.round(m.wordScore * 100),
          meaningScore: Math.round(m.meaningScore * 100),
          phrase: m.phrase,
          matchedIn: m.matchedIn.map(f => FIELD_LABELS[f]),
          views: m.doc.views,
          multiple: m.doc.multiple,
          status: m.doc.status,
        })),
      };
    }),

  monitoringStatus: adminPanelProcedure.query(() => getAlertTelemetry()),

  trafficConversionReport: adminPanelProcedure
    .input(trafficReportFiltersSchema.optional())
    .query(async ({ input }) => {
      return buildTrafficConversionReport(
        trafficReportFiltersSchema.parse(input ?? {})
      );
    }),

  trafficOverview: adminPanelProcedure.query(() => ({
    visitors: 0,
    signups7d: 0,
    note: "Wire PostHog and aggregates in Phase 1 Prompt 5.",
  })),

  creatorsSummary: adminPanelProcedure.query(() => ({
    featuredCount: 0,
    note: "Featured creators admin in Phase 1 Prompt 4.",
  })),

  blogStudioSummary: adminPanelProcedure.query(() => ({
    draftCount: 0,
    note: "Blog Studio pipeline in Phase 1 Prompt 6.",
  })),

  trackCreatorView: adminPanelProcedure
    .input(z.object({ creatorHandle: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: true as const };
      await db.insert(creatorViewEvents).values({
        creatorHandle: input.creatorHandle.trim().toLowerCase(),
        viewerUserId: ctx.user.id,
      });
      return { ok: true as const };
    }),

  trackNicheView: adminPanelProcedure
    .input(z.object({ nicheSlug: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: true as const };
      await db.insert(nicheViewEvents).values({
        nicheSlug: input.nicheSlug.trim().toLowerCase(),
        viewerUserId: ctx.user.id,
      });
      return { ok: true as const };
    }),

  emailRecentEvents: adminPanelProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(80) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const limit = input?.limit ?? 80;
      const items = await db
        .select()
        .from(emailEvents)
        .orderBy(desc(emailEvents.createdAt))
        .limit(limit);
      return { items };
    }),

  emailTemplatesList: adminPanelProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { items: [] };
    const items = await db
      .select()
      .from(emailTemplates)
      .orderBy(asc(emailTemplates.slug));
    return { items };
  }),

  emailTemplateStats: adminPanelProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { items: [] as { templateSlug: string; count: number }[] };
    const rows = await db
      .select({
        templateSlug: emailEvents.templateSlug,
        count: sql<number>`count(*)`,
      })
      .from(emailEvents)
      .where(isNotNull(emailEvents.templateSlug))
      .groupBy(emailEvents.templateSlug);
    const items = rows
      .filter((r) => r.templateSlug)
      .map((r) => ({ templateSlug: r.templateSlug as string, count: Number(r.count) }))
      .sort((a, b) => b.count - a.count);
    return { items };
  }),

  emailBounces: adminPanelProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const limit = input?.limit ?? 100;
      const items = await db
        .select()
        .from(emailEvents)
        .where(
          or(
            eq(emailEvents.eventType, "email.bounced"),
            eq(emailEvents.eventType, "email.complained"),
            like(emailEvents.eventType, "%bounce%")
          )
        )
        .orderBy(desc(emailEvents.createdAt))
        .limit(limit);
      return { items };
    }),

  panelUserList: adminPanelProcedure
    .input(panelUserFiltersSchema.optional())
    .query(async ({ input }) => {
      const opts = panelUserFiltersSchema.parse(input ?? {});
      const report = await buildPanelUserReport(opts);
      return {
        items: report.items,
        total: report.total,
        summary: report.summary,
        dateRange: report.dateRange,
      };
    }),

  panelUserSummary: adminPanelProcedure
    .input(panelUserSummaryFiltersSchema.optional())
    .query(async ({ input }) => {
      const opts = panelUserFiltersSchema.parse({
        ...(input ?? {}),
        limit: 1,
        offset: 0,
      });
      const report = await buildPanelUserReport(opts);
      return { summary: report.summary, dateRange: report.dateRange };
    }),

  panelUserDetail: adminPanelProcedure
    .input(
      z.object({
        userId: z.number(),
        dateRangePreset: z
          .enum([
            "today",
            "7d",
            "14d",
            "30d",
            "60d",
            "90d",
            "365d",
            "custom",
          ])
          .default("30d"),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .query(async ({ input }) => {
      const { resolveDateRange } = await import(".././adminUserMetrics");
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const dateRange = resolveDateRange(input);
      const report = await buildPanelUserReport(
        panelUserFiltersSchema.parse({
          dateRangePreset: input.dateRangePreset,
          startDate: input.startDate,
          endDate: input.endDate,
          limit: 500,
          offset: 0,
        })
      );
      const row = report.items.find((r) => r.id === input.userId);

      const usageHistory = await db
        .select()
        .from(monthlyUsage)
        .where(eq(monthlyUsage.userId, input.userId))
        .orderBy(desc(monthlyUsage.usageMonth))
        .limit(12);

      const recentJobs = await db
        .select()
        .from(scrapeJobs)
        .where(eq(scrapeJobs.userId, input.userId))
        .orderBy(desc(scrapeJobs.createdAt))
        .limit(10);

      const recentScripts = await db
        .select({
          id: savedScripts.id,
          title: savedScripts.title,
          status: savedScripts.status,
          createdAt: savedScripts.createdAt,
        })
        .from(savedScripts)
        .where(eq(savedScripts.userId, input.userId))
        .orderBy(desc(savedScripts.createdAt))
        .limit(10);

      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, input.userId))
        .limit(1);

      const [activeComplimentaryAccess, complimentaryAccessHistory] =
        await Promise.all([
          getActiveComplimentaryGrant(input.userId),
          getComplimentaryAccessHistory(input.userId),
        ]);

      const { computeRetentionStatus, isPaidPlan } = await import(
        ".././userActivity"
      );
      const lastActiveAt = user.lastActiveAt ?? user.lastSignedIn;
      const billingPlan = (sub?.plan ?? "free") as PlanId;
      const complimentaryPlan = activeComplimentaryAccess?.plan ?? null;
      const effectivePlan = resolveEffectivePlan(
        billingPlan,
        complimentaryPlan
      );
      const accessSource = resolveAccessSource(
        billingPlan,
        complimentaryPlan
      );
      const now = Date.now();

      return {
        dateRange,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          loginMethod: user.loginMethod,
          role: user.role,
          createdAt: user.createdAt,
          lastSignedIn: user.lastSignedIn,
          lastActiveAt,
          visitCount: user.visitCount ?? 0,
          totalActiveSeconds: user.totalActiveSeconds ?? 0,
          periodVisits: row?.periodVisits ?? 0,
          periodActiveSeconds: row?.periodActiveSeconds ?? 0,
          daysSinceActive: Math.floor(
            (Date.now() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
          ),
          retentionStatus: computeRetentionStatus(lastActiveAt),
          isPaid: isPaidPlan(billingPlan, sub?.stripeSubscriptionId),
          hasComplimentaryAccess: !!activeComplimentaryAccess,
          utmSource: user.utmSource,
          utmMedium: user.utmMedium,
          utmCampaign: user.utmCampaign,
          isTestAccount: user.isTestAccount,
          inferredTestAccount: inferPanelTestAccount(user),
        },
        subscription: sub
          ? {
              plan: sub.plan,
              status: sub.status,
              billingInterval: sub.billingInterval,
              stripeCustomerId: sub.stripeCustomerId,
              currentPeriodEnd: sub.currentPeriodEnd,
            }
          : null,
        entitlement: {
          effectivePlan,
          billingPlan,
          accessSource,
          complimentaryAccess: activeComplimentaryAccess,
        },
        complimentaryAccessHistory: complimentaryAccessHistory.map((grant) => ({
          ...grant,
          lifecycle:
            grant.status === "revoked"
              ? ("revoked" as const)
              : grant.expiresAt && grant.expiresAt.getTime() <= now
                ? ("expired" as const)
                : ("active" as const),
        })),
        usageHistory,
        recentJobs,
        recentScripts,
      };
    }),

  grantComplimentaryAccess: adminPanelProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        plan: complimentaryPlanSchema,
        expiresAt: z.string().datetime().nullable().optional(),
        reason: z.string().trim().min(3).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      const [target] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (target.role === "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Admin accounts already bypass plan limits and cannot receive complimentary access.",
        });
      }

      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Expiry must be in the future.",
        });
      }

      const grant = await grantComplimentaryAccess({
        userId: input.userId,
        plan: input.plan as ComplimentaryPlan,
        reason: input.reason,
        grantedByUserId: ctx.user.id,
        expiresAt,
      });

      const [sub] = await db
        .select({ plan: subscriptions.plan })
        .from(subscriptions)
        .where(eq(subscriptions.userId, input.userId))
        .limit(1);
      const billingPlan = (sub?.plan ?? "free") as PlanId;

      return {
        ok: true as const,
        grant,
        effectivePlan: resolveEffectivePlan(billingPlan, grant?.plan ?? null),
        billingPlan,
      };
    }),

  revokeComplimentaryAccess: adminPanelProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        reason: z.string().trim().min(3).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const revoked = await revokeComplimentaryAccess({
        userId: input.userId,
        reason: input.reason,
        revokedByUserId: ctx.user.id,
      });
      if (!revoked) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This user does not have active complimentary access.",
        });
      }

      const [sub] = await db
        .select({ plan: subscriptions.plan })
        .from(subscriptions)
        .where(eq(subscriptions.userId, input.userId))
        .limit(1);

      return {
        ok: true as const,
        billingPlan: (sub?.plan ?? "free") as PlanId,
      };
    }),

  coachScriptQualitySummary: adminPanelProcedure
    .input(coachScriptQualityFiltersSchema.optional())
    .query(async ({ input }) => {
      return buildCoachScriptQualityReport(
        coachScriptQualityFiltersSchema.parse(input ?? {})
      );
    }),

  coachScriptQualityDownload: adminPanelProcedure
    .input(
      coachScriptQualityFiltersSchema.extend({
        format: z.enum(["html", "csv"]),
      })
    )
    .mutation(async ({ input }) => {
      const { format, ...filters } = input;
      return buildCoachScriptQualityDownload({ filters, format });
    }),
});
