import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { hookGeneratorLeads, scrapeJobs, users } from "../drizzle/schema";
import {
  DATE_RANGE_PRESETS,
  resolveDateRange,
  type DateRangePreset,
} from "./adminUserMetrics";
import { getDb } from "./db";

export const trafficReportFiltersSchema = z.object({
  dateRangePreset: z.enum(DATE_RANGE_PRESETS).default("30d"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type TrafficReportFilters = z.infer<typeof trafficReportFiltersSchema>;

export function formatConversionPct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function rangeToUtcBounds(startDate: string, endDate: string) {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  };
}

function posthogQueryApiBase(): string | null {
  const raw =
    process.env.POSTHOG_HOST?.trim() ||
    process.env.VITE_PUBLIC_POSTHOG_HOST?.trim() ||
    "https://us.i.posthog.com";
  if (!raw) return null;
  const normalized = raw.replace(/\/$/, "");
  if (normalized.includes(".i.posthog.com")) {
    return normalized.replace(".i.posthog.com", ".posthog.com");
  }
  return normalized;
}

async function runPostHogHogqlCount(hogql: string): Promise<number | null> {
  const apiKey = process.env.POSTHOG_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  const apiBase = posthogQueryApiBase();
  if (!apiKey || !projectId || !apiBase) return null;

  try {
    const res = await fetch(`${apiBase}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: hogql,
        },
      }),
    });
    if (!res.ok) {
      console.warn(`[PostHog] HogQL query HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { results?: unknown[][] };
    const val = data.results?.[0]?.[0];
    return typeof val === "number" ? val : typeof val === "string" ? Number(val) : null;
  } catch (err) {
    console.warn(
      "[PostHog] HogQL query failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function hogqlTimestampRange(startDate: string, endDate: string) {
  return {
    from: `${startDate} 00:00:00`,
    to: `${endDate} 23:59:59`,
  };
}

async function fetchPostHogTrafficMetrics(startDate: string, endDate: string) {
  const apiKey = process.env.POSTHOG_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  const configured = Boolean(apiKey && projectId);
  if (!configured) {
    return {
      configured: false as const,
      visitors: null,
      blogReaders: null,
      hookToolViews: null,
      signupCtaClicks: null,
      note: "Set POSTHOG_API_KEY and POSTHOG_PROJECT_ID to load visitor counts from PostHog.",
    };
  }

  const { from, to } = hogqlTimestampRange(startDate, endDate);
  const timeFilter = `timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')`;

  const [visitors, blogReaders, hookToolViews, signupCtaClicks] = await Promise.all([
    runPostHogHogqlCount(
      `SELECT count(DISTINCT distinct_id) FROM events WHERE event = '$pageview' AND ${timeFilter}`
    ),
    runPostHogHogqlCount(
      `SELECT count(DISTINCT distinct_id) FROM events WHERE event = '$pageview' AND properties.$pathname LIKE '/blog%' AND ${timeFilter}`
    ),
    runPostHogHogqlCount(
      `SELECT count(DISTINCT distinct_id) FROM events WHERE event = '$pageview' AND properties.$pathname LIKE '/free-tools/viral-hooks%' AND ${timeFilter}`
    ),
    runPostHogHogqlCount(
      `SELECT count(DISTINCT distinct_id) FROM events WHERE event = 'public_header_cta_clicked' AND ${timeFilter}`
    ),
  ]);

  return {
    configured: true as const,
    visitors,
    blogReaders,
    hookToolViews,
    signupCtaClicks,
    note: null,
  };
}

function normalizeLoginMethod(method: string | null | undefined): string {
  const m = (method || "unknown").toLowerCase();
  if (m === "google") return "google";
  if (m === "email") return "email";
  return m;
}

export async function buildTrafficConversionReport(input: TrafficReportFilters) {
  const filters = trafficReportFiltersSchema.parse(input);
  const dateRange = resolveDateRange(filters);
  const { start, end } = rangeToUtcBounds(dateRange.startDate, dateRange.endDate);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const periodUserFilter = and(
    gte(users.createdAt, start),
    lte(users.createdAt, end),
    eq(users.isTestAccount, false)
  );

  const signupRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      loginMethod: users.loginMethod,
      utmSource: users.utmSource,
      utmMedium: users.utmMedium,
      createdAt: users.createdAt,
      hasCompletedFirstSpy: users.hasCompletedFirstSpy,
    })
    .from(users)
    .where(periodUserFilter)
    .orderBy(desc(users.createdAt));

  const signupsTotal = signupRows.length;

  const signupsByLoginMethod: Record<string, number> = {};
  for (const row of signupRows) {
    const key = normalizeLoginMethod(row.loginMethod);
    signupsByLoginMethod[key] = (signupsByLoginMethod[key] ?? 0) + 1;
  }

  const signupsByUtmSource: Record<string, number> = {};
  for (const row of signupRows) {
    const key = row.utmSource?.trim() || "(direct / unknown)";
    signupsByUtmSource[key] = (signupsByUtmSource[key] ?? 0) + 1;
  }

  const utmSourceBreakdown = Object.entries(signupsByUtmSource)
    .map(([source, total]) => ({ source, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const leadPeriodFilter = and(
    gte(hookGeneratorLeads.createdAt, start),
    lte(hookGeneratorLeads.createdAt, end)
  );

  const [leadSubmissionRow] = await db
    .select({ total: count() })
    .from(hookGeneratorLeads)
    .where(leadPeriodFilter);

  const [uniqueLeadRow] = await db
    .select({ total: sql<number>`cast(count(distinct lower(${hookGeneratorLeads.email})) as signed)` })
    .from(hookGeneratorLeads)
    .where(leadPeriodFilter);

  const leadSubmissions = Number(leadSubmissionRow?.total ?? 0);
  const uniqueLeadEmails = Number(uniqueLeadRow?.total ?? 0);

  const [convertedLeadRow] = await db
    .select({
      total: sql<number>`cast(count(distinct lower(${hookGeneratorLeads.email})) as signed)`,
    })
    .from(hookGeneratorLeads)
    .innerJoin(users, sql`lower(${users.email}) = lower(${hookGeneratorLeads.email})`)
    .where(
      and(
        leadPeriodFilter,
        eq(users.isTestAccount, false)
      )
    );

  const leadsConvertedToSignup = Number(convertedLeadRow?.total ?? 0);

  const signupIds = signupRows.map((r) => r.id);
  let startedResearch = 0;
  if (signupIds.length > 0) {
    const researchRows = await db
      .select({ userId: scrapeJobs.userId })
      .from(scrapeJobs)
      .where(
        and(
          inArray(scrapeJobs.userId, signupIds),
          eq(scrapeJobs.isDemo, false)
        )
      )
      .groupBy(scrapeJobs.userId);
    startedResearch = researchRows.length;
  }

  const completedFirstSpy = signupRows.filter((r) => r.hasCompletedFirstSpy).length;

  const signupDailyRows = await db
    .select({
      day: sql<string>`date(${users.createdAt})`.mapWith(String),
      total: count(),
    })
    .from(users)
    .where(periodUserFilter)
    .groupBy(sql`date(${users.createdAt})`)
    .orderBy(sql`date(${users.createdAt})`);

  const leadDailyRows = await db
    .select({
      day: sql<string>`date(${hookGeneratorLeads.createdAt})`.mapWith(String),
      total: count(),
    })
    .from(hookGeneratorLeads)
    .where(leadPeriodFilter)
    .groupBy(sql`date(${hookGeneratorLeads.createdAt})`)
    .orderBy(sql`date(${hookGeneratorLeads.createdAt})`);

  const recentLeads = await db
    .select({
      id: hookGeneratorLeads.id,
      email: hookGeneratorLeads.email,
      niche: hookGeneratorLeads.niche,
      utmSource: hookGeneratorLeads.utmSource,
      createdAt: hookGeneratorLeads.createdAt,
    })
    .from(hookGeneratorLeads)
    .where(leadPeriodFilter)
    .orderBy(desc(hookGeneratorLeads.createdAt))
    .limit(15);

  const leadEmailMatchers = recentLeads.map((l) =>
    sql`lower(${users.email}) = ${l.email.toLowerCase()}`
  );
  const signedUpEmails = new Set<string>();
  if (leadEmailMatchers.length > 0) {
    const matchedUsers = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.isTestAccount, false), or(...leadEmailMatchers)));
    for (const u of matchedUsers) {
      if (u.email) signedUpEmails.add(u.email.toLowerCase());
    }
  }

  const posthog = await fetchPostHogTrafficMetrics(
    dateRange.startDate,
    dateRange.endDate
  );

  const visitors = posthog.visitors;

  return {
    dateRange,
    posthog,
    signups: {
      total: signupsTotal,
      byLoginMethod: signupsByLoginMethod,
      google: signupsByLoginMethod.google ?? 0,
      email: signupsByLoginMethod.email ?? 0,
      utmSourceBreakdown,
    },
    leads: {
      submissions: leadSubmissions,
      uniqueEmails: uniqueLeadEmails,
      convertedToSignup: leadsConvertedToSignup,
    },
    activation: {
      startedResearch,
      completedFirstSpy,
    },
    funnel: {
      visitorToSignupPct: formatConversionPct(signupsTotal, visitors ?? 0),
      visitorToLeadPct: formatConversionPct(uniqueLeadEmails, visitors ?? 0),
      leadToSignupPct: formatConversionPct(leadsConvertedToSignup, uniqueLeadEmails),
      signupToResearchPct: formatConversionPct(startedResearch, signupsTotal),
      signupToFirstSpyPct: formatConversionPct(completedFirstSpy, signupsTotal),
      blogReaderToSignupPct:
        posthog.blogReaders != null && posthog.blogReaders > 0
          ? formatConversionPct(signupsTotal, posthog.blogReaders)
          : null,
    },
    daily: {
      signups: signupDailyRows.map((r) => ({
        day: r.day,
        total: Number(r.total),
      })),
      leads: leadDailyRows.map((r) => ({
        day: r.day,
        total: Number(r.total),
      })),
    },
    recentSignups: signupRows.slice(0, 15).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      loginMethod: normalizeLoginMethod(r.loginMethod),
      utmSource: r.utmSource,
      createdAt: r.createdAt,
      hasCompletedFirstSpy: r.hasCompletedFirstSpy,
    })),
    recentLeads: recentLeads.map((l) => ({
      id: l.id,
      email: l.email,
      niche: l.niche,
      utmSource: l.utmSource,
      createdAt: l.createdAt,
      hasAccount: signedUpEmails.has(l.email.toLowerCase()),
    })),
  };
}
