import { and, eq, inArray, lt } from "drizzle-orm";
import {
  exportJobs,
  viralityDiagnosticJobs,
  videoBrollGenerations,
} from "../drizzle/schema";
import { getDb } from "./db";
import { alertOwnerThrottled } from "./monitoring/alerts";

export const OPERATIONAL_JOB_STALE_MS = 20 * 60 * 1000;
export const OPERATIONAL_JOB_ZOMBIE_MESSAGE =
  "This job was interrupted. Please retry.";

export type OperationalRecovery = {
  status: "failed";
  errorMessage: string;
};

export function staleOperationalJobRecovery(): OperationalRecovery {
  return {
    status: "failed",
    errorMessage: OPERATIONAL_JOB_ZOMBIE_MESSAGE,
  };
}

/**
 * Terminalize fire-and-forget work interrupted by a deploy or process crash.
 * Every write is compare-and-set against both state and stale timestamp, so a
 * live job that heartbeats after the scan cannot be overwritten.
 */
export async function sweepZombieOperationalJobs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const before = new Date(Date.now() - OPERATIONAL_JOB_STALE_MS);
  let swept = 0;

  const staleExports = await db
    .select({ id: exportJobs.id, status: exportJobs.status })
    .from(exportJobs)
    .where(
      and(
        inArray(exportJobs.status, ["pending", "processing"]),
        lt(exportJobs.updatedAt, before)
      )
    );
  for (const row of staleExports) {
    const result = await db
      .update(exportJobs)
      .set({
        ...staleOperationalJobRecovery(),
        currentStep: "failed",
        progressLabel: "Export interrupted — retry",
      })
      .where(
        and(
          eq(exportJobs.id, row.id),
          eq(exportJobs.status, row.status),
          lt(exportJobs.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  const staleDiagnostics = await db
    .select({ id: viralityDiagnosticJobs.id, status: viralityDiagnosticJobs.status })
    .from(viralityDiagnosticJobs)
    .where(
      and(
        inArray(viralityDiagnosticJobs.status, ["pending", "running"]),
        lt(viralityDiagnosticJobs.updatedAt, before)
      )
    );
  for (const row of staleDiagnostics) {
    const result = await db
      .update(viralityDiagnosticJobs)
      .set(staleOperationalJobRecovery())
      .where(
        and(
          eq(viralityDiagnosticJobs.id, row.id),
          eq(viralityDiagnosticJobs.status, row.status),
          lt(viralityDiagnosticJobs.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  const staleBroll = await db
    .select({ id: videoBrollGenerations.id, status: videoBrollGenerations.status })
    .from(videoBrollGenerations)
    .where(
      and(
        inArray(videoBrollGenerations.status, [
          "uploading",
          "transcribing",
          "analyzing",
        ]),
        lt(videoBrollGenerations.updatedAt, before)
      )
    );
  for (const row of staleBroll) {
    const result = await db
      .update(videoBrollGenerations)
      .set({
        ...staleOperationalJobRecovery(),
        internalErrorDetail: "process_interrupted_or_timed_out",
      })
      .where(
        and(
          eq(videoBrollGenerations.id, row.id),
          eq(videoBrollGenerations.status, row.status),
          lt(videoBrollGenerations.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  if (swept > 0) {
    console.log(
      `[operationalJobSweeper] marked ${swept} stale job(s) as failed`
    );
    alertOwnerThrottled({
      kind: "sweeper",
      message: `${swept} stale operational job(s) auto-failed`,
    });
  }
  return swept;
}

export function startOperationalJobZombieSweeper(): void {
  const intervalMs = 2 * 60 * 1000;
  setInterval(() => {
    sweepZombieOperationalJobs().catch((error) => {
      console.error("[operationalJobSweeper]", error);
      alertOwnerThrottled({
        kind: "sweeper",
        message: "operationalJobSweeper crashed",
        error,
      });
    });
  }, intervalMs);
  void sweepZombieOperationalJobs();
}
