/**
 * Small daily counters kept in viral_processing_spend (the `videos` column),
 * for background jobs capped by "how many per day" rather than by dollars.
 * Keys are a 2-letter prefix plus the UTC day, e.g. "rc20261123" (10 chars,
 * the column holds 10).
 */
import { eq, sql } from "drizzle-orm";
import { viralProcessingSpend } from "../../drizzle/viralLibrarySchema";
import type { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** "rc" + "20261123". Pure; exported for tests. */
export function dailyCounterKey(prefix: string, d = new Date()): string {
  return `${prefix.slice(0, 2)}${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/** A whole-number env setting, or the default when unset or invalid. Pure; exported for tests. */
export function dailyCapFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value != null && value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export async function countToday(db: Db, key: string): Promise<number> {
  const [row] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, key)).limit(1);
  return row?.videos ?? 0;
}

export async function addToCount(db: Db, key: string, n: number): Promise<void> {
  if (n <= 0) return;
  await db
    .insert(viralProcessingSpend)
    .values({ day: key, usd: "0.0000", videos: n })
    .onDuplicateKeyUpdate({ set: { videos: sql`videos + ${n}` } });
}
