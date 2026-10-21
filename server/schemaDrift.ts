import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { alertOwnerThrottled } from "./monitoring/alerts";

/**
 * Curated production expectations that have already burned us when missing.
 * Keep this list small and user-impacting. Full schema.ts vs information_schema
 * audits stay as offline tooling.
 */
export const CRITICAL_SCHEMA_EXPECTATIONS: ReadonlyArray<{
  table: string;
  column?: string;
  index?: string;
  feature: string;
}> = [
  {
    table: "saved_reels",
    column: "platform",
    feature: "Viral Posts → Saved Reels library sync",
  },
  {
    table: "saved_reels",
    column: "sourceId",
    feature: "Viral Posts → Saved Reels library sync",
  },
  {
    table: "saved_reels",
    index: "idx_saved_reels_workspace_user_platform_source",
    feature: "Viral Posts → Saved Reels library sync",
  },
  {
    table: "viral_post_saves",
    feature: "Viral Posts starring",
  },
  {
    table: "viral_post_candidates",
    column: "platform",
    feature: "Viral Posts feed",
  },
  {
    table: "viral_post_candidates",
    column: "sourceId",
    feature: "Viral Posts feed",
  },
  {
    table: "personalization_items",
    column: "dismissedFromStatus",
    feature: "Onboarding suggestions",
  },
];

export type SchemaDriftFinding = {
  kind: "missing_table" | "missing_column" | "missing_index";
  table: string;
  column?: string;
  index?: string;
  feature: string;
};

export function summarizeSchemaDrift(findings: SchemaDriftFinding[]): string {
  if (findings.length === 0) return "no critical schema drift";
  return findings
    .slice(0, 8)
    .map((f) => {
      if (f.kind === "missing_table") return `missing table ${f.table}`;
      if (f.kind === "missing_column") {
        return `missing ${f.table}.${f.column}`;
      }
      return `missing index ${f.index} on ${f.table}`;
    })
    .join("; ");
}

export async function collectCriticalSchemaDrift(): Promise<SchemaDriftFinding[]> {
  const db = await getDb();
  if (!db) return [];

  const findings: SchemaDriftFinding[] = [];

  for (const expectation of CRITICAL_SCHEMA_EXPECTATIONS) {
    const tableRows = await db.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${expectation.table}
      LIMIT 1
    `);
    const tables = tableRows[0] as unknown as Array<{ TABLE_NAME?: string }>;
    if (!Array.isArray(tables) || tables.length === 0) {
      findings.push({
        kind: "missing_table",
        table: expectation.table,
        feature: expectation.feature,
      });
      continue;
    }

    if (expectation.column) {
      const colRows = await db.execute(sql`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${expectation.table}
          AND COLUMN_NAME = ${expectation.column}
        LIMIT 1
      `);
      const cols = colRows[0] as unknown as Array<{ COLUMN_NAME?: string }>;
      if (!Array.isArray(cols) || cols.length === 0) {
        findings.push({
          kind: "missing_column",
          table: expectation.table,
          column: expectation.column,
          feature: expectation.feature,
        });
      }
    }

    if (expectation.index) {
      const idxRows = await db.execute(sql`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${expectation.table}
          AND INDEX_NAME = ${expectation.index}
        LIMIT 1
      `);
      const idxs = idxRows[0] as unknown as Array<{ INDEX_NAME?: string }>;
      if (!Array.isArray(idxs) || idxs.length === 0) {
        findings.push({
          kind: "missing_index",
          table: expectation.table,
          index: expectation.index,
          feature: expectation.feature,
        });
      }
    }
  }

  return findings;
}

/** Boot-time / periodic: alert owner on critical drift; never throws. */
export async function checkCriticalSchemaDriftAndAlert(): Promise<void> {
  try {
    if (process.env.NODE_ENV !== "production") return;
    const findings = await collectCriticalSchemaDrift();
    if (findings.length === 0) {
      console.info("[schemaDrift] critical expectations ok");
      return;
    }
    const summary = summarizeSchemaDrift(findings);
    console.error("[schemaDrift] critical drift:", summary, findings);
    alertOwnerThrottled({
      kind: "schema_drift",
      message: summary,
    });
  } catch (error) {
    console.error("[schemaDrift] check failed:", error);
    alertOwnerThrottled({
      kind: "schema_drift",
      message: "critical schema drift check failed",
      error,
    });
  }
}
