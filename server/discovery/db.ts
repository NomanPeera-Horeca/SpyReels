import { and, eq, gte, sql } from "drizzle-orm";
import {
  discoveryResults,
  discoverySearches,
  type InsertDiscoveryResult,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type { ScoredCreator } from "./pipeline";

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
        eq(discoverySearches.succeeded, true),
        gte(discoverySearches.createdAt, monthStart)
      )
    );

  const raw = rows[0]?.count ?? 0;
  return typeof raw === "number" ? raw : Number(raw) || 0;
}

export async function createDiscoverySearch(input: {
  userId: number;
  descriptionText: string;
  routedNiche: string | null;
  routingConfidence: number | null;
  clarified: boolean;
  resultCount: number | null;
  apifyCostUsd: number | null;
  claudeCostUsd: number | null;
  succeeded: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(discoverySearches).values({
    userId: input.userId,
    descriptionText: input.descriptionText,
    routedNiche: input.routedNiche,
    routingConfidence:
      input.routingConfidence != null
        ? String(input.routingConfidence)
        : null,
    clarified: input.clarified,
    resultCount: input.resultCount,
    apifyCostUsd:
      input.apifyCostUsd != null ? String(input.apifyCostUsd) : null,
    claudeCostUsd:
      input.claudeCostUsd != null ? String(input.claudeCostUsd) : null,
    succeeded: input.succeeded,
  });

  return result[0].insertId;
}

export async function createDiscoveryResults(
  searchId: number,
  creators: ScoredCreator[]
): Promise<void> {
  if (creators.length === 0) {
    return;
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const rows: InsertDiscoveryResult[] = creators.map((creator) => ({
    searchId,
    rankPosition: creator.rankPosition,
    instagramHandle: creator.instagramHandle,
    followerCount: creator.followerCount,
    engagementRate:
      creator.engagementRate != null ? String(creator.engagementRate) : null,
    nicheFitScore: String(creator.nicheFitScore),
    whyMatchSummary: creator.whyMatchSummary,
  }));

  await db.insert(discoveryResults).values(rows);
}
