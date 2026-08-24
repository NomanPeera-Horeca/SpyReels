/**
 * Viral Posts email reminders (paid weekly + unpaid drip).
 * Run: pnpm exec tsx scripts/viral-posts-reminders.ts
 * Dry-run: pnpm exec tsx scripts/viral-posts-reminders.ts --dry-run
 *
 * Dry-run must never import or call feed generation / email send / reminder writes.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { users, viralPostReminderState } from "../drizzle/schema";
import { getDb } from "../server/db";
import { getUserSubscription } from "../server/stripe/stripe-service";
import { isPaidPlan } from "../server/userActivity";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const UNPAID_SCHEDULE_DAYS = [1, 2, 7, 14, 30] as const;
const PAID_FEED_MAX_AGE_DAYS = 7;
/**
 * Hard cap per live user: feed + email + reminder upsert.
 * Increased from 60s after observing real pool refresh durations up to ~120s per
 * pool in production logs (Aug 2026). Revisit if ScrapeCreators costs grow
 * significantly - consider switching to cached-pool-only mode for reminders
 * instead of forced fresh discovery.
 */
const PER_USER_TIMEOUT_MS = 240_000;

/** True when `--dry-run` appears anywhere in argv (after the script path). */
const dryRun = process.argv.includes("--dry-run");

type WouldProcessReason = `paid-7day` | `unpaid-stage-${number}`;

type WouldHaveProcessed = {
  id: number;
  email: string;
  plan: string;
  reason: WouldProcessReason;
};

type DueVerdict =
  | { due: true; reason: WouldProcessReason; nextReminderStage: number }
  | { due: false };

/**
 * Pure due-check: reads reminder state + activity + plan only.
 * Must never call getOrCreateDailyFeed or any ScrapeCreators / pool path.
 */
function evaluateReminderDue(args: {
  paid: boolean;
  stage: number;
  lastFeedGeneratedAt: Date | null;
  lastReminderSentAt: Date | null;
  lastActiveAt: Date;
  createdAt: Date;
  now: Date;
}): DueVerdict {
  if (args.paid) {
    const needsRefresh =
      !args.lastFeedGeneratedAt ||
      daysSince(args.lastFeedGeneratedAt, args.now) >= PAID_FEED_MAX_AGE_DAYS;
    if (!needsRefresh) return { due: false };
    return {
      due: true,
      reason: "paid-7day",
      nextReminderStage: args.stage,
    };
  }

  const thresholdDays =
    args.stage < UNPAID_SCHEDULE_DAYS.length
      ? UNPAID_SCHEDULE_DAYS[args.stage]!
      : 30;
  const referenceTime =
    args.lastReminderSentAt ?? args.lastActiveAt ?? args.createdAt;
  const due = daysSince(referenceTime, args.now) >= thresholdDays;
  const inactiveLongEnough =
    daysSince(args.lastActiveAt, args.now) >= thresholdDays;
  if (!due || !inactiveLongEnough) return { due: false };

  return {
    due: true,
    reason: `unpaid-stage-${args.stage}`,
    nextReminderStage: Math.min(args.stage + 1, 5),
  };
}

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

async function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
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
  console.log(
    JSON.stringify({
      event: "viral_posts_reminders_start",
      dryRun,
      argv: process.argv.slice(2),
    })
  );

  const db = await getDb();
  if (!db) {
    console.log(
      JSON.stringify({
        error: "Database not available",
        dryRun,
        paidRegenerated: 0,
        unpaidRegenerated: 0,
        skippedNoEmail: 0,
        wouldHaveProcessed: [],
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
  const wouldHaveProcessed: WouldHaveProcessed[] = [];
  const errors: Array<{ userId: number; error: string }> = [];

  // Live path only: load feed + email modules after due-check confirms work.
  // Dry-run never imports these (avoids pulling discovery / pool refresh code).
  let getOrCreateDailyFeed: typeof import("../server/viralPosts/service").getOrCreateDailyFeed | null =
    null;
  let sendViralPostsPaidReminderEmail: typeof import("../server/utils/email").sendViralPostsPaidReminderEmail | null =
    null;
  let sendViralPostsUnpaidReminderEmail: typeof import("../server/utils/email").sendViralPostsUnpaidReminderEmail | null =
    null;

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

      const verdict = evaluateReminderDue({
        paid,
        stage,
        lastFeedGeneratedAt,
        lastReminderSentAt,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
        now,
      });
      if (!verdict.due) continue;

      if (dryRun) {
        wouldHaveProcessed.push({
          id: user.id,
          email,
          plan: sub.plan,
          reason: verdict.reason,
        });
        if (verdict.reason === "paid-7day") paidRegenerated += 1;
        else unpaidRegenerated += 1;
        continue;
      }

      // --- live path only below ---
      // Sequential: feed → email → upsert. If this races times out mid-way,
      // upsertReminderAfterSend is never reached, so the user is retried next run.
      await raceWithTimeout(
        (async () => {
          if (!getOrCreateDailyFeed) {
            const service = await import("../server/viralPosts/service");
            const emailMod = await import("../server/utils/email");
            getOrCreateDailyFeed = service.getOrCreateDailyFeed;
            sendViralPostsPaidReminderEmail =
              emailMod.sendViralPostsPaidReminderEmail;
            sendViralPostsUnpaidReminderEmail =
              emailMod.sendViralPostsUnpaidReminderEmail;
          }

          const timezone = (user.timezone ?? "").trim() || "UTC";
          const localDate = localDateString(now, timezone);
          const displayName = (user.name ?? "").trim() || "there";

          await getOrCreateDailyFeed({
            userId: user.id,
            localDate,
            timezone,
            force: true,
          });

          if (verdict.reason === "paid-7day") {
            await sendViralPostsPaidReminderEmail!(email, displayName);
          } else {
            await sendViralPostsUnpaidReminderEmail!(email, displayName);
          }

          await upsertReminderAfterSend({
            userId: user.id,
            now,
            reminderStage: verdict.nextReminderStage,
          });

          if (verdict.reason === "paid-7day") paidRegenerated += 1;
          else unpaidRegenerated += 1;
        })(),
        PER_USER_TIMEOUT_MS,
        `User reminder processing timed out after ${PER_USER_TIMEOUT_MS / 1000}s`
      );
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
        dryRun,
        paidRegenerated,
        unpaidRegenerated,
        skippedNoEmail,
        wouldHaveProcessed,
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
