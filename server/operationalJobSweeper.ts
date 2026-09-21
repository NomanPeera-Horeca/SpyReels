import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
  carouselRemakes,
  creatorDiscoveryJobs,
  discoveryJobs,
  exportJobs,
  monthlyUsage,
  recreatedScripts,
  scriptIdeas,
  viralityDiagnosticJobs,
  videoBrollGenerations,
} from "../drizzle/schema";
import { getDb } from "./db";
import { alertOwnerThrottled } from "./monitoring/alerts";

export const OPERATIONAL_JOB_STALE_MS = 20 * 60 * 1000;
export const OPERATIONAL_JOB_ZOMBIE_MESSAGE =
  "This job was interrupted. Please retry.";

export const STALE_SCRIPT_IDEA_STATUSES = ["queued", "validating", "processing"] as const;
export const STALE_RECREATED_SCRIPT_STATUSES = ["pending", "processing"] as const;
export const STALE_DISCOVERY_STATUSES = ["pending", "running"] as const;
export const STALE_CAROUSEL_STATUSES = ["pending", "processing"] as const;

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
    .select({
      id: exportJobs.id,
      userId: exportJobs.userId,
      status: exportJobs.status,
      createdAt: exportJobs.createdAt,
    })
    .from(exportJobs)
    .where(
      and(
        inArray(exportJobs.status, ["pending", "processing"]),
        lt(exportJobs.updatedAt, before)
      )
    );
  for (const row of staleExports) {
    const recovered = await db.transaction(async (tx) => {
      const result = await tx
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
      if (Number(result[0]?.affectedRows ?? 0) === 0) return false;

      const usageMonth = row.createdAt.toISOString().slice(0, 7);
      await tx
        .update(monthlyUsage)
        .set({
          exportCount: sql`GREATEST(0, ${monthlyUsage.exportCount} - 1)`,
        })
        .where(
          and(
            eq(monthlyUsage.userId, row.userId),
            eq(monthlyUsage.usageMonth, usageMonth)
          )
        );
      return true;
    });
    if (recovered) swept += 1;
  }

  const staleScriptIdeas = await db
    .select({ id: scriptIdeas.id, status: scriptIdeas.status })
    .from(scriptIdeas)
    .where(
      and(
        inArray(scriptIdeas.status, [...STALE_SCRIPT_IDEA_STATUSES]),
        lt(scriptIdeas.updatedAt, before)
      )
    );
  for (const row of staleScriptIdeas) {
    const result = await db
      .update(scriptIdeas)
      .set(staleOperationalJobRecovery())
      .where(
        and(
          eq(scriptIdeas.id, row.id),
          eq(scriptIdeas.status, row.status),
          lt(scriptIdeas.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  const staleRecreatedScripts = await db
    .select({ id: recreatedScripts.id, status: recreatedScripts.status })
    .from(recreatedScripts)
    .where(
      and(
        inArray(recreatedScripts.status, [...STALE_RECREATED_SCRIPT_STATUSES]),
        lt(recreatedScripts.updatedAt, before)
      )
    );
  for (const row of staleRecreatedScripts) {
    const result = await db
      .update(recreatedScripts)
      .set(staleOperationalJobRecovery())
      .where(
        and(
          eq(recreatedScripts.id, row.id),
          eq(recreatedScripts.status, row.status),
          lt(recreatedScripts.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  const staleCreatorDiscovery = await db
    .select({ id: creatorDiscoveryJobs.id, status: creatorDiscoveryJobs.status })
    .from(creatorDiscoveryJobs)
    .where(
      and(
        inArray(creatorDiscoveryJobs.status, [...STALE_DISCOVERY_STATUSES]),
        lt(creatorDiscoveryJobs.updatedAt, before)
      )
    );
  for (const row of staleCreatorDiscovery) {
    const result = await db
      .update(creatorDiscoveryJobs)
      .set(staleOperationalJobRecovery())
      .where(
        and(
          eq(creatorDiscoveryJobs.id, row.id),
          eq(creatorDiscoveryJobs.status, row.status),
          lt(creatorDiscoveryJobs.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  const staleLegacyDiscovery = await db
    .select({ id: discoveryJobs.id, status: discoveryJobs.status })
    .from(discoveryJobs)
    .where(
      and(
        inArray(discoveryJobs.status, [...STALE_DISCOVERY_STATUSES]),
        lt(discoveryJobs.updatedAt, before)
      )
    );
  for (const row of staleLegacyDiscovery) {
    const result = await db
      .update(discoveryJobs)
      .set(staleOperationalJobRecovery())
      .where(
        and(
          eq(discoveryJobs.id, row.id),
          eq(discoveryJobs.status, row.status),
          lt(discoveryJobs.updatedAt, before)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) > 0) swept += 1;
  }

  const staleCarousels = await db
    .select({ id: carouselRemakes.id, status: carouselRemakes.status })
    .from(carouselRemakes)
    .where(
      and(
        inArray(carouselRemakes.status, [...STALE_CAROUSEL_STATUSES]),
        lt(carouselRemakes.updatedAt, before)
      )
    );
  for (const row of staleCarousels) {
    const result = await db
      .update(carouselRemakes)
      .set({
        ...staleOperationalJobRecovery(),
        progressStage: null,
      })
      .where(
        and(
          eq(carouselRemakes.id, row.id),
          eq(carouselRemakes.status, row.status),
          lt(carouselRemakes.updatedAt, before)
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
