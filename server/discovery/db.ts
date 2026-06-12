import { and, eq, gte, sql } from "drizzle-orm";
import {
  creatorDiscoverySearches,
  discoverySearches,
} from "../../drizzle/schema";
import { getDb } from "../db";

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function countSucceededSearchesThisMonth(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const monthStart = startOfCurrentMonthUtc();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoverySearches)
    .where(
      and(
        eq(discoverySearches.userId, userId),
        gte(discoverySearches.createdAt, monthStart)
      )
    );

  const raw = rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw) || 0;
}

export async function countCreatorDiscoverySearchesThisMonth(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const monthStart = startOfCurrentMonthUtc();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(creatorDiscoverySearches)
    .where(
      and(
        eq(creatorDiscoverySearches.userId, userId),
        gte(creatorDiscoverySearches.createdAt, monthStart)
      )
    );

  const raw = rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw) || 0;
}

export async function countCombinedDiscoverySearchesThisMonth(
  userId: number
): Promise<number> {
  const [hashtagUsed, creatorUsed] = await Promise.all([
    countSucceededSearchesThisMonth(userId),
    countCreatorDiscoverySearchesThisMonth(userId),
  ]);
  return hashtagUsed + creatorUsed;
}
