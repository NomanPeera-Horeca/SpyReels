import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { transcriptions } from "../drizzle/schema";
import { getDb } from "./db";
import { alertOwnerThrottled } from "./monitoring/alerts";

const PROCESSING_STALE_MS = 10 * 60 * 1000;
const ZOMBIE_MESSAGE = "Transcription timed out, please retry.";

/**
 * Mark stale `processing` transcriptions as failed. Rows with `startedAt` set
 * use `updatedAt` (touches during the run). Rows still waiting for a slot do
 * not update `updatedAt`, so we use `queuedAt` for those. Post-launch: run
 * from a real cron or worker if you scale to multiple app instances.
 */
export async function sweepZombieTranscriptions(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const before = new Date(Date.now() - PROCESSING_STALE_MS);
  const rows = await db
    .select({ id: transcriptions.id })
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.status, "processing"),
        or(
          and(isNotNull(transcriptions.startedAt), lt(transcriptions.updatedAt, before)),
          and(isNull(transcriptions.startedAt), lt(transcriptions.queuedAt, before))
        )
      )
    );
  for (const r of rows) {
    await db
      .update(transcriptions)
      .set({ status: "failed", errorMessage: ZOMBIE_MESSAGE })
      .where(eq(transcriptions.id, r.id));
  }
  if (rows.length > 0) {
    console.log(
      `[transcriptionSweeper] marked ${rows.length} stale processing row(s) as failed`
    );
    alertOwnerThrottled({
      kind: "sweeper",
      message: `${rows.length} stale transcription(s) auto-failed (process likely died mid-run)`,
    });
  }
  return rows.length;
}

export function startTranscriptionZombieSweeper(): void {
  const INTERVAL_MS = 2 * 60 * 1000;
  setInterval(() => {
    sweepZombieTranscriptions().catch((e) => {
      console.error("[transcriptionSweeper]", e);
      alertOwnerThrottled({ kind: "sweeper", message: "transcriptionSweeper crashed", error: e });
    });
  }, INTERVAL_MS);
  void sweepZombieTranscriptions();
}
