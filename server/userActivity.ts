import { eq, sql } from "drizzle-orm";
import { userActivityDaily, users } from "../drizzle/schema";
import { getDb, getUserByOpenId } from "./db";

const PAID_PLANS = ["starter", "pro", "business", "agency"] as const;

export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isPaidPlan(
  plan: string,
  stripeSubscriptionId: string | null | undefined
): boolean {
  return (
    PAID_PLANS.includes(plan as (typeof PAID_PLANS)[number]) &&
    Boolean(stripeSubscriptionId)
  );
}

export function computeRetentionStatus(
  lastActiveAt: Date,
  now: Date = new Date()
): "active" | "at_risk" | "churned" {
  const daysSince = Math.floor(
    (now.getTime() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince > 30) return "churned";
  if (daysSince > 7) return "at_risk";
  return "active";
}

async function bumpDailyActivity(
  userId: number,
  opts: { countVisit?: boolean; addSeconds?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const activityDate = utcDateKey();
  const addSeconds = opts.addSeconds
    ? Math.min(Math.max(0, Math.floor(opts.addSeconds)), 120)
    : 0;

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (opts.countVisit) {
    updateSet.visitDay = sql`GREATEST(${userActivityDaily.visitDay}, 1)`;
  }
  if (addSeconds > 0) {
    updateSet.activeSeconds = sql`${userActivityDaily.activeSeconds} + ${addSeconds}`;
  }

  await db
    .insert(userActivityDaily)
    .values({
      userId,
      activityDate,
      visitDay: opts.countVisit ? 1 : 0,
      activeSeconds: addSeconds,
    })
    .onDuplicateKeyUpdate({ set: updateSet });
}

/** Bump last seen and count at most one visit per UTC calendar day. */
export async function recordUserActivity(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const user = await getUserByOpenId(openId);
  if (!user) return;

  const now = new Date();
  const todayUtc = utcDateKey(now);
  const shouldCountVisit = (user.lastVisitCountedOn ?? null) !== todayUtc;

  await db
    .update(users)
    .set({
      lastSignedIn: now,
      lastActiveAt: now,
      ...(shouldCountVisit
        ? {
            visitCount: sql`${users.visitCount} + 1`,
            lastVisitCountedOn: todayUtc,
          }
        : {}),
    })
    .where(eq(users.openId, openId));

  await bumpDailyActivity(user.id, { countVisit: true });
}

/** Add foreground seconds from the client heartbeat (capped per request). */
export async function addUserActiveSeconds(
  userId: number,
  seconds: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const capped = Math.min(Math.max(0, Math.floor(seconds)), 120);
  if (capped === 0) return;

  const now = new Date();
  await db
    .update(users)
    .set({
      totalActiveSeconds: sql`${users.totalActiveSeconds} + ${capped}`,
      lastActiveAt: now,
    })
    .where(eq(users.id, userId));

  await bumpDailyActivity(userId, { addSeconds: capped, countVisit: true });
}
