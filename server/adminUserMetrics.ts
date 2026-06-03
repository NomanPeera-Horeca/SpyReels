import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  collectedReels,
  monthlyUsage,
  savedScripts,
  scrapeJobs,
  subscriptions,
  userActivityDaily,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { computeRetentionStatus, isPaidPlan, utcDateKey } from "./userActivity";

export const DATE_RANGE_PRESETS = [
  "today",
  "7d",
  "14d",
  "30d",
  "60d",
  "90d",
  "365d",
  "custom",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const panelUserFiltersSchema = z.object({
  search: z.string().optional(),
  plan: z.string().optional(),
  testOnly: z.boolean().optional(),
  paidOnly: z.boolean().optional(),
  freeOnly: z.boolean().optional(),
  retentionStatus: z.enum(["active", "at_risk", "churned"]).optional(),
  subscriptionStatus: z
    .enum(["active", "canceled", "past_due", "trialing"])
    .optional(),
  minVisits: z.number().min(0).optional(),
  maxDaysSinceActive: z.number().min(0).optional(),
  dateRangePreset: z.enum(DATE_RANGE_PRESETS).default("30d"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortBy: z
    .enum([
      "createdAt",
      "lastSignedIn",
      "lastActiveAt",
      "periodVisits",
      "periodActiveSeconds",
      "visitCount",
      "totalActiveSeconds",
      "name",
    ])
    .default("lastActiveAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export type PanelUserFilters = z.infer<typeof panelUserFiltersSchema>;

export type ResolvedDateRange = {
  preset: DateRangePreset;
  startDate: string;
  endDate: string;
  label: string;
};

const PRESET_LABELS: Record<Exclude<DateRangePreset, "custom">, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "60d": "Last 60 days",
  "90d": "Last 90 days",
  "365d": "Last year",
};

function addUtcDays(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDateKey(d);
}

export function resolveDateRange(input: {
  dateRangePreset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
}): ResolvedDateRange {
  const today = utcDateKey();
  const preset = input.dateRangePreset ?? "30d";

  if (preset === "custom") {
    const startDate = input.startDate ?? addUtcDays(today, -29);
    const endDate = input.endDate ?? today;
    return {
      preset,
      startDate,
      endDate,
      label: `${startDate} to ${endDate}`,
    };
  }

  if (preset === "today") {
    return {
      preset,
      startDate: today,
      endDate: today,
      label: PRESET_LABELS.today,
    };
  }

  const daysMap: Record<Exclude<DateRangePreset, "custom" | "today">, number> = {
    "7d": 6,
    "14d": 13,
    "30d": 29,
    "60d": 59,
    "90d": 89,
    "365d": 364,
  };
  const offset = daysMap[preset as keyof typeof daysMap] ?? 29;
  return {
    preset,
    startDate: addUtcDays(today, -offset),
    endDate: today,
    label: PRESET_LABELS[preset as keyof typeof PRESET_LABELS] ?? "Last 30 days",
  };
}

function lastActiveInRange(lastActiveAt: Date, range: ResolvedDateRange): boolean {
  const key = utcDateKey(lastActiveAt);
  return key >= range.startDate && key <= range.endDate;
}

export function inferPanelTestAccount(u: {
  isTestAccount: boolean;
  email: string | null;
  openId: string;
}): boolean {
  if (u.isTestAccount) return true;
  const e = (u.email || "").toLowerCase();
  const o = (u.openId || "").toLowerCase();
  if (e.includes("+test") || e.endsWith("@example.com") || e.endsWith("@example.org")) {
    return true;
  }
  if (o.includes("test_") || o.startsWith("demo_")) return true;
  return false;
}

export type PanelUserRow = {
  id: number;
  name: string;
  email: string;
  loginMethod: string;
  role: string;
  plan: string;
  subscriptionStatus: string | null;
  isPaid: boolean;
  stripeCustomerId: string | null;
  createdAt: Date;
  lastSignedIn: Date;
  lastActiveAt: Date;
  visitCount: number;
  totalActiveSeconds: number;
  periodVisits: number;
  periodActiveSeconds: number;
  daysSinceActive: number;
  retentionStatus: "active" | "at_risk" | "churned";
  activeInPeriod: boolean;
  scriptsCreated: number;
  scrapeJobsRun: number;
  reelsCollected: number;
  isTestAccount: boolean;
  inferredTestAccount: boolean;
  monthlyUsage: {
    scrapes: number;
    transcriptions: number;
    recreates: number;
    rewrites: number;
    searches: number;
  };
};

export type PanelUserSummary = {
  totalUsers: number;
  activeInPeriod: number;
  totalPeriodVisits: number;
  totalPeriodActiveSeconds: number;
  paidUsers: number;
  newSignupsInPeriod: number;
  avgVisitsPerActive: number;
  avgSecondsPerActive: number;
};

async function loadPeriodMetrics(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  range: ResolvedDateRange
) {
  const dailyRows = await db
    .select({
      userId: userActivityDaily.userId,
      visits: sql<number>`COALESCE(SUM(${userActivityDaily.visitDay}), 0)`,
      seconds: sql<number>`COALESCE(SUM(${userActivityDaily.activeSeconds}), 0)`,
    })
    .from(userActivityDaily)
    .where(
      and(
        gte(userActivityDaily.activityDate, range.startDate),
        lte(userActivityDaily.activityDate, range.endDate)
      )
    )
    .groupBy(userActivityDaily.userId);

  const dailyMap = new Map(
    dailyRows.map((r) => [
      r.userId,
      { visits: Number(r.visits), seconds: Number(r.seconds) },
    ])
  );

  const scrapeRows = await db
    .select({
      userId: scrapeJobs.userId,
      visits: sql<number>`COUNT(DISTINCT DATE_FORMAT(${scrapeJobs.createdAt}, '%Y-%m-%d'))`,
    })
    .from(scrapeJobs)
    .where(
      and(
        gte(scrapeJobs.createdAt, new Date(`${range.startDate}T00:00:00.000Z`)),
        lte(scrapeJobs.createdAt, new Date(`${range.endDate}T23:59:59.999Z`))
      )
    )
    .groupBy(scrapeJobs.userId);

  const scrapeMap = new Map(
    scrapeRows.map((r) => [r.userId, Number(r.visits)])
  );

  return { dailyMap, scrapeMap };
}

function periodMetricsForUser(
  userId: number,
  dailyMap: Map<number, { visits: number; seconds: number }>,
  scrapeMap: Map<number, number>
) {
  const daily = dailyMap.get(userId);
  const scrapeVisits = scrapeMap.get(userId) ?? 0;
  const dailyVisits = daily?.visits ?? 0;
  const periodVisits = Math.max(dailyVisits, scrapeVisits);
  const periodActiveSeconds = daily?.seconds ?? 0;
  return { periodVisits, periodActiveSeconds };
}

export async function buildPanelUserReport(opts: PanelUserFilters) {
  const db = await getDb();
  const dateRange = resolveDateRange(opts);
  const emptySummary: PanelUserSummary = {
    totalUsers: 0,
    activeInPeriod: 0,
    totalPeriodVisits: 0,
    totalPeriodActiveSeconds: 0,
    paidUsers: 0,
    newSignupsInPeriod: 0,
    avgVisitsPerActive: 0,
    avgSecondsPerActive: 0,
  };

  if (!db) {
    return { items: [] as PanelUserRow[], total: 0, summary: emptySummary, dateRange };
  }

  const { dailyMap, scrapeMap } = await loadPeriodMetrics(db, dateRange);

  const allUsers = await db.select().from(users);
  const allSubs = await db.select().from(subscriptions);
  const subMap = new Map(allSubs.map((s) => [s.userId, s]));
  const currentMonth = new Date().toISOString().slice(0, 7);
  const allUsage = await db
    .select()
    .from(monthlyUsage)
    .where(eq(monthlyUsage.usageMonth, currentMonth));
  const usageMap = new Map(allUsage.map((u) => [u.userId, u]));

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
  const scrapeMapTotal = new Map(scrapeCounts.map((s) => [s.userId, Number(s.count)]));

  const collectedCounts = await db
    .select({
      userId: collectedReels.userId,
      count: sql<number>`count(*)`,
    })
    .from(collectedReels)
    .groupBy(collectedReels.userId);
  const collectedMap = new Map(collectedCounts.map((s) => [s.userId, Number(s.count)]));

  const rangeStart = new Date(`${dateRange.startDate}T00:00:00.000Z`);
  const rangeEnd = new Date(`${dateRange.endDate}T23:59:59.999Z`);
  const now = new Date();

  let enriched: PanelUserRow[] = allUsers.map((u) => {
    const sub = subMap.get(u.id);
    const usage = usageMap.get(u.id);
    const plan = sub?.plan || "free";
    const subscriptionStatus = sub?.status ?? null;
    const lastActiveAt = u.lastActiveAt ?? u.lastSignedIn;
    const { periodVisits, periodActiveSeconds } = periodMetricsForUser(
      u.id,
      dailyMap,
      scrapeMap
    );
    const activeInPeriod =
      periodVisits > 0 ||
      periodActiveSeconds > 0 ||
      lastActiveInRange(lastActiveAt, dateRange);

    return {
      id: u.id,
      name: u.name || "Unknown",
      email: u.email || "No email",
      loginMethod: u.loginMethod || "unknown",
      role: u.role,
      plan,
      subscriptionStatus,
      isPaid: isPaidPlan(plan, sub?.stripeSubscriptionId),
      stripeCustomerId: sub?.stripeCustomerId || null,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
      lastActiveAt,
      visitCount: u.visitCount ?? 0,
      totalActiveSeconds: u.totalActiveSeconds ?? 0,
      periodVisits,
      periodActiveSeconds,
      daysSinceActive: Math.floor(
        (now.getTime() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
      ),
      retentionStatus: computeRetentionStatus(lastActiveAt, now),
      activeInPeriod,
      scriptsCreated: scriptMap.get(u.id) || 0,
      scrapeJobsRun: scrapeMapTotal.get(u.id) || 0,
      reelsCollected: collectedMap.get(u.id) || 0,
      isTestAccount: u.isTestAccount,
      inferredTestAccount: inferPanelTestAccount(u),
      monthlyUsage: usage
        ? {
            scrapes: usage.scrapeCount,
            transcriptions: usage.transcribeCount,
            recreates: usage.recreateCount,
            rewrites: usage.rewriteCount,
            searches: usage.searchCount,
          }
        : {
            scrapes: 0,
            transcriptions: 0,
            recreates: 0,
            rewrites: 0,
            searches: 0,
          },
    };
  });

  if (opts.search) {
    const lower = opts.search.toLowerCase();
    enriched = enriched.filter(
      (u) =>
        u.name.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower)
    );
  }
  if (opts.plan) enriched = enriched.filter((u) => u.plan === opts.plan);
  if (opts.paidOnly) enriched = enriched.filter((u) => u.isPaid);
  if (opts.freeOnly) enriched = enriched.filter((u) => !u.isPaid);
  if (opts.retentionStatus) {
    enriched = enriched.filter((u) => u.retentionStatus === opts.retentionStatus);
  }
  if (opts.subscriptionStatus) {
    enriched = enriched.filter((u) => u.subscriptionStatus === opts.subscriptionStatus);
  }
  if (opts.minVisits !== undefined) {
    enriched = enriched.filter((u) => u.periodVisits >= opts.minVisits!);
  }
  if (opts.maxDaysSinceActive !== undefined) {
    enriched = enriched.filter((u) => u.daysSinceActive <= opts.maxDaysSinceActive!);
  }
  if (opts.testOnly) {
    enriched = enriched.filter((u) => u.inferredTestAccount || u.isTestAccount);
  }

  const summary: PanelUserSummary = {
    totalUsers: enriched.length,
    activeInPeriod: enriched.filter((u) => u.activeInPeriod).length,
    totalPeriodVisits: enriched.reduce((s, u) => s + u.periodVisits, 0),
    totalPeriodActiveSeconds: enriched.reduce((s, u) => s + u.periodActiveSeconds, 0),
    paidUsers: enriched.filter((u) => u.isPaid).length,
    newSignupsInPeriod: enriched.filter(
      (u) => u.createdAt >= rangeStart && u.createdAt <= rangeEnd
    ).length,
    avgVisitsPerActive: 0,
    avgSecondsPerActive: 0,
  };
  const activeRows = enriched.filter((u) => u.activeInPeriod);
  if (activeRows.length > 0) {
    summary.avgVisitsPerActive =
      Math.round(
        (summary.totalPeriodVisits / activeRows.length) * 10
      ) / 10;
    summary.avgSecondsPerActive = Math.round(
      summary.totalPeriodActiveSeconds / activeRows.length
    );
  }

  const sortKey = opts.sortBy;
  enriched.sort((a, b) => {
    const dir = opts.sortOrder === "asc" ? 1 : -1;
    if (sortKey === "name") {
      return a.name.localeCompare(b.name) * dir;
    }
    const av =
      sortKey === "periodVisits"
        ? a.periodVisits
        : sortKey === "periodActiveSeconds"
          ? a.periodActiveSeconds
          : sortKey === "visitCount"
            ? a.visitCount
            : sortKey === "totalActiveSeconds"
              ? a.totalActiveSeconds
              : sortKey === "createdAt"
                ? a.createdAt.getTime()
                : sortKey === "lastSignedIn"
                  ? a.lastSignedIn.getTime()
                  : a.lastActiveAt.getTime();
    const bv =
      sortKey === "periodVisits"
        ? b.periodVisits
        : sortKey === "periodActiveSeconds"
          ? b.periodActiveSeconds
          : sortKey === "visitCount"
            ? b.visitCount
            : sortKey === "totalActiveSeconds"
              ? b.totalActiveSeconds
              : sortKey === "createdAt"
                ? b.createdAt.getTime()
                : sortKey === "lastSignedIn"
                  ? b.lastSignedIn.getTime()
                  : b.lastActiveAt.getTime();
    return (av - bv) * dir;
  });

  const total = enriched.length;
  const items = enriched.slice(opts.offset, opts.offset + opts.limit);

  return { items, total, summary, dateRange };
}
