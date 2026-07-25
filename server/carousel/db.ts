import { and, eq, gte, sql } from "drizzle-orm";
import { carouselRemakes } from "../../drizzle/schema";
import { getDb } from "../db";

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Count completed carousel remakes for the user in the current UTC month. */
export async function countCarouselRemakesThisMonth(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const monthStart = startOfCurrentMonthUtc();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(carouselRemakes)
    .where(
      and(
        eq(carouselRemakes.userId, userId),
        eq(carouselRemakes.status, "completed"),
        gte(carouselRemakes.createdAt, monthStart)
      )
    );

  const raw = rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw) || 0;
}
