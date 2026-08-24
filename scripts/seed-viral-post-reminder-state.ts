/**
 * Seed viral_post_reminder_state for every user missing a row.
 * Run: pnpm exec tsx scripts/seed-viral-post-reminder-state.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";

function countFromExecute(result: unknown): number {
  const rows = (result as [{ c: number | string | bigint }[]])[0];
  return Number(rows?.[0]?.c ?? 0);
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.log(
      JSON.stringify({
        error: "Database not available",
        usersCount: 0,
        reminderStateCount: 0,
        matched: false,
      })
    );
    process.exit(0);
  }

  await db.execute(sql`
    INSERT INTO viral_post_reminder_state (user_id, reminder_stage, last_reminder_sent_at, last_feed_generated_at)
    SELECT id, 0, NOW(), NULL
    FROM users
    WHERE id NOT IN (SELECT user_id FROM viral_post_reminder_state)
  `);

  const usersCount = countFromExecute(
    await db.execute(sql`SELECT COUNT(*) AS c FROM users`)
  );
  const reminderStateCount = countFromExecute(
    await db.execute(sql`SELECT COUNT(*) AS c FROM viral_post_reminder_state`)
  );

  console.log(
    JSON.stringify(
      {
        usersCount,
        reminderStateCount,
        matched: usersCount === reminderStateCount,
      },
      null,
      2
    )
  );
  process.exit(0);
}

await main();
