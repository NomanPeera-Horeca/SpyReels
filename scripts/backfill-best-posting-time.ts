/**
 * One-shot backfill: computes `featured_accounts.bestPostingHour` +
 * `bestPostingDay` by tallying the day-of-week and hour-of-day of every
 * `featured_reels.postedAt` per account. Idempotent — overwrites the
 * existing values, safe to re-run whenever the catalog is re-scraped.
 *
 * Algorithm per account:
 *   1. Bucket posted reels by day-of-week (Sun..Sat) and hour (0..23).
 *   2. Collapse weekdays (Mon..Fri) into a single "weekdays" bucket,
 *      then pick the max across {weekdays, saturday, sunday}. Matches
 *      the display copy "Posts weekdays around 2 PM" vs "Posts Sundays
 *      around 10 AM".
 *   3. Pick the hour with the most posts overall.
 *   4. Write both back to `featured_accounts`. If the account has zero
 *      reels, both columns are left NULL.
 *
 * Timestamps in the DB are UTC; the display layer is responsible for
 * timezone conversion (or not — spec copy is rough enough that UTC is
 * fine for v1).
 *
 * Run:
 *   DATABASE_URL="..." npx tsx scripts/backfill-best-posting-time.ts
 *
 * Flags:
 *   --account-id=N    only process a single account (debug)
 *   --dry-run         compute but don't write
 */

import "dotenv/config";
import mysql from "mysql2/promise";

interface AccountRow {
  id: number;
  handle: string;
}

interface ReelTs {
  postedAt: Date;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const idArg = args.find((a) => a.startsWith("--account-id="));
  const accountId = idArg ? Number(idArg.split("=")[1]) : null;
  return { dryRun, accountId };
}

async function connect(): Promise<mysql.Connection> {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL not set");
  const url = new URL(raw);
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  });
}

const DAY_INDEX_TO_NAME = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function computeBest(reels: ReelTs[]): {
  bestPostingDay: string | null;
  bestPostingHour: number | null;
} {
  if (reels.length === 0) {
    return { bestPostingDay: null, bestPostingHour: null };
  }

  // Weekday bucket (Mon..Fri) vs Saturday vs Sunday — matches the
  // display bucketing so the backfill's notion of "best day" agrees
  // with what the header will render.
  let weekdayCount = 0;
  let saturdayCount = 0;
  let sundayCount = 0;
  const hourBuckets = new Array<number>(24).fill(0);

  for (const r of reels) {
    const d = r.postedAt;
    const dayIdx = d.getUTCDay();
    const hour = d.getUTCHours();
    hourBuckets[hour]++;
    if (dayIdx === 0) sundayCount++;
    else if (dayIdx === 6) saturdayCount++;
    else weekdayCount++;
  }

  let bestDay: string;
  if (
    saturdayCount > weekdayCount &&
    saturdayCount >= sundayCount
  ) {
    bestDay = "saturday";
  } else if (
    sundayCount > weekdayCount &&
    sundayCount > saturdayCount
  ) {
    bestDay = "sunday";
  } else {
    // Default "weekdays" represents the Mon..Fri aggregate. We pick an
    // arbitrary weekday (Wednesday) as the stored canonical value —
    // the formatter only looks at weekend vs weekday buckets anyway.
    bestDay = "wednesday";
  }

  // Hour: simple mode across all reels.
  let bestHour = 0;
  let bestCount = -1;
  for (let h = 0; h < 24; h++) {
    if (hourBuckets[h] > bestCount) {
      bestCount = hourBuckets[h];
      bestHour = h;
    }
  }

  return { bestPostingDay: bestDay, bestPostingHour: bestHour };
}

async function main(): Promise<void> {
  const { dryRun, accountId } = parseArgs();
  const conn = await connect();
  console.log(
    `Backfill featured_accounts best posting time — dryRun=${dryRun}, accountId=${accountId ?? "all"}`
  );

  const accountsQuery = accountId
    ? { sql: `SELECT id, handle FROM featured_accounts WHERE id = ?`, params: [accountId] }
    : { sql: `SELECT id, handle FROM featured_accounts WHERE isActive = 1`, params: [] };
  const [accRows] = await conn.query(accountsQuery.sql, accountsQuery.params);
  const accounts = accRows as AccountRow[];
  console.log(`Found ${accounts.length} account(s).`);

  let written = 0;
  let skipped = 0;
  for (const acc of accounts) {
    const [reelRows] = await conn.query(
      `SELECT postedAt FROM featured_reels WHERE featuredAccountId = ?`,
      [acc.id]
    );
    const reels = (reelRows as { postedAt: Date | string }[]).map((r) => ({
      postedAt: r.postedAt instanceof Date ? r.postedAt : new Date(r.postedAt),
    }));
    const { bestPostingDay, bestPostingHour } = computeBest(reels);

    if (bestPostingDay == null || bestPostingHour == null) {
      console.log(`  [${acc.id}] @${acc.handle}: no reels; skipping`);
      skipped++;
      continue;
    }
    console.log(
      `  [${acc.id}] @${acc.handle}: ${reels.length} reels → ${bestPostingDay} @ ${bestPostingHour}:00 UTC`
    );
    if (!dryRun) {
      await conn.query(
        `UPDATE featured_accounts
            SET bestPostingDay = ?, bestPostingHour = ?
          WHERE id = ?`,
        [bestPostingDay, bestPostingHour, acc.id]
      );
      written++;
    }
  }

  console.log(`\n════ Summary ════`);
  console.log(`  accounts:  ${accounts.length}`);
  console.log(`  written:   ${written}`);
  console.log(`  skipped:   ${skipped} (no reels)`);
  await conn.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
