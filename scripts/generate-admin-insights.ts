import * as dotenv from "dotenv";
import { desc } from "drizzle-orm";
import { aiInsights } from "../drizzle/schema";
import { getDb } from "../server/db";

dotenv.config();

/**
 * Phase 1 Prompt 7: extend this job to pull last-7d metrics, call Claude, and INSERT rows.
 * For now we only log and optionally insert a smoke row when the table is empty.
 */
async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL missing or database unreachable.");
  }

  const latest = await db.select({ id: aiInsights.id }).from(aiInsights).orderBy(desc(aiInsights.id)).limit(1);

  if (latest.length > 0) {
    console.log("ai_insights already has rows; skipping smoke insert. Replace this with real generation.");
    return;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await db.insert(aiInsights).values({
    title: "Admin insights cron (stub)",
    body: "Replace scripts/generate-admin-insights.ts with the Phase 1 Prompt 7 Claude pipeline.",
    ctaPath: "/admin/traffic",
    insightDate: today,
  });

  console.log("Inserted one stub ai_insights row.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
