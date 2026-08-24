/**
 * Viral Posts email reminders (paid weekly + unpaid drip).
 * Run: pnpm exec tsx scripts/viral-posts-reminders.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { users, viralPostReminderState } from "../drizzle/schema";
import { getDb } from "../server/db";
import { getUserSubscription } from "../server/stripe/stripe-service";
import { isPaidPlan } from "../server/userActivity";
import {
  sendViralPostsPaidReminderEmail,
  sendViralPostsUnpaidReminderEmail,
} from "../server/utils/email";
import { getOrCreateDailyFeed } from "../server/viralPosts/service";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const UNPAID_SCHEDULE_DAYS = [1, 2, 7, 14, 30] as const;
const PAID_FEED_MAX_AGE_DAYS = 7;

function localDateString(d = new Date(), timeZone = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
}

function daysSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / MS_PER_DAY;
}

async function upsertReminderAfterSend(args: {
  userId: number;
  now: Date;
  reminderStage: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(viralPostReminderState)
    .values({
      userId: args.userId,
      reminderStage: args.reminderStage,
      lastReminderSentAt: args.now,
      lastFeedGeneratedAt: args.now,
      updatedAt: args.now,
    })
    .onDuplicateKeyUpdate({
      set: {
        reminderStage: args.reminderStage,
        lastReminderSentAt: args.now,
        lastFeedGeneratedAt: args.now,
        updatedAt: args.now,
      },
    });
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.log(
      JSON.stringify({
        error: "Database not available",
        paidRegenerated: 0,
        unpaidRegenerated: 0,
        skippedNoEmail: 0,
        errors: [],
      })
    );
    process.exit(0);
  }

  const rows = await db
    .select({
      user: users,
      reminder: viralPostReminderState,
    })
    .from(users)
    .leftJoin(
      viralPostReminderState,
      eq(users.id, viralPostReminderState.userId)
    );

  const now = new Date();
  let paidRegenerated = 0;
  let unpaidRegenerated = 0;
  let skippedNoEmail = 0;
  const errors: Array<{ userId: number; error: string }> = [];

  // No email opt-out / unsubscribe column on users (schema checked).
  for (const row of rows) {
    const user = row.user;
    try {
      const email = (user.email ?? "").trim();
      if (!email) {
        skippedNoEmail += 1;
        continue;
      }

      const sub = await getUserSubscription(user.id);
      const paid = isPaidPlan(sub.plan, sub.stripeSubscriptionId);
      const stage = row.reminder?.reminderStage ?? 0;
      const lastFeedGeneratedAt = row.reminder?.lastFeedGeneratedAt ?? null;
      const lastReminderSentAt = row.reminder?.lastReminderSentAt ?? null;
      const timezone = (user.timezone ?? "").trim() || "UTC";
      const localDate = localDateString(now, timezone);
      const displayName = (user.name ?? "").trim() || "there";

      if (paid) {
        const needsRefresh =
          !lastFeedGeneratedAt ||
          daysSince(lastFeedGeneratedAt, now) >= PAID_FEED_MAX_AGE_DAYS;
        if (!needsRefresh) continue;

        await getOrCreateDailyFeed({
          userId: user.id,
          localDate,
          timezone,
          force: true,
        });
        await sendViralPostsPaidReminderEmail(email, displayName);
        await upsertReminderAfterSend({
          userId: user.id,
          now,
          reminderStage: stage,
        });
        paidRegenerated += 1;
        continue;
      }

      const thresholdDays =
        stage < UNPAID_SCHEDULE_DAYS.length
          ? UNPAID_SCHEDULE_DAYS[stage]!
          : 30;
      const referenceTime =
        lastReminderSentAt ?? user.lastActiveAt ?? user.createdAt;
      const due = daysSince(referenceTime, now) >= thresholdDays;
      const inactiveLongEnough =
        daysSince(user.lastActiveAt, now) >= thresholdDays;
      if (!due || !inactiveLongEnough) continue;

      await getOrCreateDailyFeed({
        userId: user.id,
        localDate,
        timezone,
        force: true,
      });
      await sendViralPostsUnpaidReminderEmail(email, displayName);
      await upsertReminderAfterSend({
        userId: user.id,
        now,
        reminderStage: Math.min(stage + 1, 5),
      });
      unpaidRegenerated += 1;
    } catch (err) {
      errors.push({
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        paidRegenerated,
        unpaidRegenerated,
        skippedNoEmail,
        errors,
        scanned: rows.length,
      },
      null,
      2
    )
  );
  process.exit(0);
}

await main();
