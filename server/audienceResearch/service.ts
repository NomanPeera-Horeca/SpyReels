import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  AUDIENCE_SIGNAL_CACHE_DAYS,
  type AudienceSignalRecord,
} from "@shared/audienceResearch";
import { audienceSignals } from "../../drizzle/schema";
import { getDb } from "../db";
import { fetchAudienceSignalsFromWeb } from "./fetchSignals";

const CACHE_MS = AUDIENCE_SIGNAL_CACHE_DAYS * 24 * 60 * 60 * 1000;

function mapRow(row: typeof audienceSignals.$inferSelect): AudienceSignalRecord {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    snippet: row.snippet,
    sourceUrl: row.sourceUrl,
    score: row.score,
    fetchedAt: row.fetchedAt,
  };
}

async function readCachedSignals(
  workspaceId: string,
  nicheSlug: string
): Promise<AudienceSignalRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const cutoff = new Date(Date.now() - CACHE_MS);
  const rows = await db
    .select()
    .from(audienceSignals)
    .where(
      and(
        eq(audienceSignals.workspaceId, workspaceId),
        eq(audienceSignals.nicheSlug, nicheSlug),
        gte(audienceSignals.fetchedAt, cutoff)
      )
    )
    .orderBy(desc(audienceSignals.score))
    .limit(15);

  return rows.map(mapRow);
}

async function persistSignals(
  workspaceId: string,
  nicheSlug: string,
  signals: AudienceSignalRecord[]
): Promise<AudienceSignalRecord[]> {
  const db = await getDb();
  if (!db) return signals;

  await db
    .delete(audienceSignals)
    .where(
      and(
        eq(audienceSignals.workspaceId, workspaceId),
        eq(audienceSignals.nicheSlug, nicheSlug)
      )
    );

  if (!signals.length) return [];

  await db.insert(audienceSignals).values(
    signals.map((signal) => ({
      workspaceId,
      nicheSlug,
      source: signal.source,
      title: signal.title.slice(0, 512),
      snippet: signal.snippet?.slice(0, 4000) ?? null,
      sourceUrl: signal.sourceUrl.slice(0, 1024),
      score: signal.score,
    }))
  );

  return readCachedSignals(workspaceId, nicheSlug);
}

export async function getOrFetchAudienceSignals(args: {
  workspaceId: string;
  nicheSlug: string;
  nicheLabel: string;
  targetAudience: string;
  forceRefresh?: boolean;
}): Promise<{ signals: AudienceSignalRecord[]; fromCache: boolean }> {
  if (!args.forceRefresh) {
    const cached = await readCachedSignals(args.workspaceId, args.nicheSlug);
    if (cached.length > 0) {
      return { signals: cached, fromCache: true };
    }
  }

  const fetched = await fetchAudienceSignalsFromWeb({
    nicheSlug: args.nicheSlug,
    nicheLabel: args.nicheLabel,
    targetAudience: args.targetAudience,
  });

  const stored = await persistSignals(args.workspaceId, args.nicheSlug, fetched);
  return { signals: stored.length ? stored : fetched, fromCache: false };
}

export async function getAudienceSignalsByIds(
  workspaceId: string,
  ids: number[]
): Promise<AudienceSignalRecord[]> {
  if (!ids.length) return [];

  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(audienceSignals)
    .where(
      and(
        eq(audienceSignals.workspaceId, workspaceId),
        inArray(audienceSignals.id, ids)
      )
    )
    .orderBy(desc(audienceSignals.score));

  return rows.map(mapRow);
}
