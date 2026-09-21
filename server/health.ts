import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type ReadinessResult = {
  ok: boolean;
  checks: { database: "ok" | "unavailable" };
};

async function databaseProbe(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("database_not_configured");
  await db.execute(sql`SELECT 1`);
}

export async function checkReadiness(
  probe: () => Promise<void> = databaseProbe,
  timeoutMs = 2_000
): Promise<ReadinessResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("readiness_timeout")), timeoutMs);
      }),
    ]);
    return { ok: true, checks: { database: "ok" } };
  } catch {
    return { ok: false, checks: { database: "unavailable" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
