/** Row <-> domain mapping shared by the personalization drizzle stores. */
import type { ItemRecord } from "@shared/personalization/state";
import type { PersonalizationItemRow } from "../../../drizzle/personalizationSchema";

export function toItemRecord(row: PersonalizationItemRow): ItemRecord {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload as ItemRecord["payload"],
    source: row.source,
    status: row.status,
    evidence: row.evidence,
    analysisRunId: row.analysisRunId,
    basedOnVersion: row.basedOnVersion,
    dismissedAtVersion: row.dismissedAtVersion,
    supersedesItemId: row.supersedesItemId,
    basedOnInputsHash: row.basedOnInputsHash,
    confidence: row.confidence,
    generationMeta: row.generationMeta ?? null,
  };
}

/** mysql2 duplicate-key error, optionally for one named unique key. */
export function isDuplicateKey(err: unknown, keyName?: string): boolean {
  const e = err as { code?: string; sqlMessage?: string; cause?: unknown } | null;
  if (!e) return false;
  if (e.code === "ER_DUP_ENTRY") {
    return keyName ? String(e.sqlMessage ?? "").includes(keyName) : true;
  }
  return e.cause ? isDuplicateKey(e.cause, keyName) : false;
}
