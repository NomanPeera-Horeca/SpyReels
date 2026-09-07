import { and, eq, or } from "drizzle-orm";
import { viralPostCandidates, type ViralPostCandidate } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AdaptedCandidate } from "./candidateAdapter";
import { canonicalCandidateKey } from "./personalization";
import * as repo from "./repository";

export type ResolvedPersonalCandidates = {
  adapted: AdaptedCandidate[];
  rows: ViralPostCandidate[];
  reusedCanonical: number;
  insertedCanonical: number;
};

/**
 * Resolve private-source public metadata against the canonical Viral candidate
 * store without overwriting richer existing rows with sparse Radar/Collected
 * snapshots. Only genuinely missing public identities are inserted.
 */
export async function resolvePersonalCandidates(
  candidates: AdaptedCandidate[]
): Promise<ResolvedPersonalCandidates> {
  if (candidates.length === 0) {
    return {
      adapted: [],
      rows: [],
      reusedCanonical: 0,
      insertedCanonical: 0,
    };
  }

  const dedupedByKey = new Map<string, AdaptedCandidate>();
  for (const candidate of candidates) {
    dedupedByKey.set(canonicalCandidateKey(candidate), candidate);
  }
  const deduped = [...dedupedByKey.values()];

  const db = await getDb();
  if (!db) {
    return {
      adapted: [],
      rows: [],
      reusedCanonical: 0,
      insertedCanonical: 0,
    };
  }

  const clauses = deduped.map((candidate) =>
    and(
      eq(viralPostCandidates.platform, candidate.platform),
      eq(viralPostCandidates.sourceId, candidate.sourceId)
    )
  );
  const existing = clauses.length
    ? await db
        .select()
        .from(viralPostCandidates)
        .where(or(...clauses))
    : [];
  const existingByKey = new Map(
    existing.map((row) => [
      canonicalCandidateKey({ platform: row.platform, sourceId: row.sourceId }),
      row,
    ])
  );

  const missing = deduped.filter(
    (candidate) => !existingByKey.has(canonicalCandidateKey(candidate))
  );
  const inserted = missing.length > 0 ? await repo.upsertCandidates(missing) : [];
  const allRowsByKey = new Map(existingByKey);
  for (const row of inserted) {
    allRowsByKey.set(
      canonicalCandidateKey({ platform: row.platform, sourceId: row.sourceId }),
      row
    );
  }

  const adapted: AdaptedCandidate[] = [];
  const rows: ViralPostCandidate[] = [];
  for (const candidate of deduped) {
    const row = allRowsByKey.get(canonicalCandidateKey(candidate));
    if (!row) continue;
    adapted.push(candidate);
    rows.push(row);
  }

  return {
    adapted,
    rows,
    reusedCanonical: existing.length,
    insertedCanonical: inserted.length,
  };
}
