import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { watermarkJobs, type WatermarkJob } from "../../drizzle/schema";
import { getDb } from "../db";

export async function findCompletedWatermarkJob(
  sourceClipUrl: string
): Promise<WatermarkJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(watermarkJobs)
    .where(
      and(
        eq(watermarkJobs.sourceClipUrl, sourceClipUrl),
        eq(watermarkJobs.status, "completed")
      )
    )
    .orderBy(desc(watermarkJobs.id))
    .limit(1);
  return rows[0];
}

/** Reuse an in-flight job for the same source so we do not queue duplicates. */
export async function findActiveWatermarkJob(
  sourceClipUrl: string
): Promise<WatermarkJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(watermarkJobs)
    .where(
      and(
        eq(watermarkJobs.sourceClipUrl, sourceClipUrl),
        inArray(watermarkJobs.status, ["pending", "processing"])
      )
    )
    .orderBy(asc(watermarkJobs.id))
    .limit(1);
  return rows[0];
}

export async function createWatermarkJob(input: {
  sourceClipUrl: string;
  userId?: number | null;
  sessionId?: string | null;
}): Promise<WatermarkJob> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(watermarkJobs).values({
    sourceClipUrl: input.sourceClipUrl,
    status: "pending",
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new Error("Failed to create watermark job");
  const row = await getWatermarkJobById(id);
  if (!row) throw new Error(`Watermark job ${id} missing after insert`);
  return row;
}

export async function getWatermarkJobById(
  id: number
): Promise<WatermarkJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(watermarkJobs)
    .where(eq(watermarkJobs.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim the oldest pending job. Returns null when the queue is empty
 * or another worker already claimed the candidate.
 */
export async function claimNextPendingWatermarkJob(): Promise<WatermarkJob | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const candidates = await db
    .select()
    .from(watermarkJobs)
    .where(eq(watermarkJobs.status, "pending"))
    .orderBy(asc(watermarkJobs.createdAt), asc(watermarkJobs.id))
    .limit(1);
  const candidate = candidates[0];
  if (!candidate) return null;

  const updated = await db
    .update(watermarkJobs)
    .set({ status: "processing", errorMessage: null })
    .where(
      and(
        eq(watermarkJobs.id, candidate.id),
        eq(watermarkJobs.status, "pending")
      )
    );
  const affected = Number(updated[0]?.affectedRows ?? 0);
  if (affected < 1) return null;

  const claimed = await getWatermarkJobById(candidate.id);
  return claimed ?? null;
}

export async function markWatermarkJobCompleted(
  id: number,
  outputUrl: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(watermarkJobs)
    .set({
      status: "completed",
      outputUrl,
      errorMessage: null,
    })
    .where(eq(watermarkJobs.id, id));
}

export async function markWatermarkJobFailed(
  id: number,
  errorMessage: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(watermarkJobs)
    .set({
      status: "failed",
      errorMessage: errorMessage.slice(0, 2000),
    })
    .where(eq(watermarkJobs.id, id));
}

export async function tryMarkWatermarkEmailSent(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updated = await db
    .update(watermarkJobs)
    .set({ emailSentAt: new Date() })
    .where(
      and(
        eq(watermarkJobs.id, id),
        eq(watermarkJobs.status, "completed"),
        isNull(watermarkJobs.emailSentAt)
      )
    );
  return Number(updated[0]?.affectedRows ?? 0) > 0;
}

export async function listStaleProcessingWatermarkJobs(
  before: Date
): Promise<WatermarkJob[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(watermarkJobs)
    .where(
      and(
        eq(watermarkJobs.status, "processing"),
        lt(watermarkJobs.updatedAt, before)
      )
    );
}
