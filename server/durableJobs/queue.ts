import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  DEFAULT_LEASE_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  retryDelaySeconds,
  safeJobError,
  shouldDeadLetter,
} from "./policy";
import type { ClaimedJob, DurableJob, PilotJobType } from "./types";

function coerceJob(row: Record<string, unknown>, claimToken?: string): ClaimedJob {
  const payload =
    typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return {
    ...(row as unknown as DurableJob),
    id: Number(row.id),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.maxAttempts),
    payload,
    claimToken: claimToken ?? String(row.lockedBy ?? ""),
  };
}

export async function enqueueDurableJob(input: {
  jobType: PilotJobType;
  idempotencyKey: string;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const payload = JSON.stringify(input.payload);
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const availableAt = input.availableAt ?? new Date();

  const result = await db.execute(sql`
    INSERT INTO durable_jobs
      (jobType, idempotencyKey, payload, status, maxAttempts, availableAt)
    VALUES
      (${input.jobType}, ${input.idempotencyKey}, ${payload}, 'queued', ${maxAttempts}, ${availableAt})
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      attempt = IF(status IN ('failed', 'dead'), 0, attempt),
      availableAt = IF(status IN ('failed', 'dead'), VALUES(availableAt), availableAt),
      leaseExpiresAt = IF(status IN ('failed', 'dead'), NULL, leaseExpiresAt),
      lockedBy = IF(status IN ('failed', 'dead'), NULL, lockedBy),
      lastError = IF(status IN ('failed', 'dead'), NULL, lastError),
      completedAt = IF(status IN ('failed', 'dead'), NULL, completedAt),
      status = IF(status IN ('failed', 'dead'), 'queued', status)
  `);
  return Number((result[0] as { insertId?: number }).insertId ?? 0);
}

export async function claimNextDurableJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<ClaimedJob | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const leaseSeconds = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const claimToken = `${input.workerId}:${randomUUID()}`;

  const result = await db.execute(sql`
    UPDATE durable_jobs
    SET
      status = 'running',
      attempt = attempt + 1,
      lockedBy = ${claimToken},
      leaseExpiresAt = DATE_ADD(NOW(3), INTERVAL ${leaseSeconds} SECOND),
      updatedAt = NOW(3)
    WHERE id = (
      SELECT id FROM (
        SELECT id
        FROM durable_jobs
        WHERE
          (
            status = 'queued'
            OR (status = 'running' AND leaseExpiresAt < NOW(3))
          )
          AND availableAt <= NOW(3)
          AND attempt < maxAttempts
        ORDER BY availableAt ASC, id ASC
        LIMIT 1
      ) AS claimable
    )
  `);
  if (Number((result[0] as { affectedRows?: number }).affectedRows ?? 0) === 0) {
    return null;
  }

  const rows = await db.execute(sql`
    SELECT *
    FROM durable_jobs
    WHERE lockedBy = ${claimToken} AND status = 'running'
    LIMIT 1
  `);
  const row = (rows[0] as unknown as Record<string, unknown>[])[0];
  return row ? coerceJob(row, claimToken) : null;
}

export async function heartbeatDurableJob(
  job: Pick<ClaimedJob, "id" | "claimToken">,
  leaseSeconds = DEFAULT_LEASE_SECONDS
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    UPDATE durable_jobs
    SET leaseExpiresAt = DATE_ADD(NOW(3), INTERVAL ${leaseSeconds} SECOND)
    WHERE id = ${job.id} AND status = 'running' AND lockedBy = ${job.claimToken}
  `);
  return Number((result[0] as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

export async function completeDurableJob(
  job: Pick<ClaimedJob, "id" | "claimToken">
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    UPDATE durable_jobs
    SET
      status = 'succeeded',
      completedAt = NOW(3),
      leaseExpiresAt = NULL,
      lockedBy = NULL,
      lastError = NULL
    WHERE id = ${job.id} AND status = 'running' AND lockedBy = ${job.claimToken}
  `);
  return Number((result[0] as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

export async function failDurableJob(
  job: Pick<ClaimedJob, "id" | "claimToken" | "attempt" | "maxAttempts">,
  error: unknown
): Promise<"queued" | "dead" | "lost_lease"> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dead = shouldDeadLetter(job.attempt, job.maxAttempts);
  const nextStatus = dead ? "dead" : "queued";
  const delay = retryDelaySeconds(job.attempt);
  const message = safeJobError(error);
  const result = await db.execute(sql`
    UPDATE durable_jobs
    SET
      status = ${nextStatus},
      availableAt = IF(${dead}, availableAt, DATE_ADD(NOW(3), INTERVAL ${delay} SECOND)),
      leaseExpiresAt = NULL,
      lockedBy = NULL,
      lastError = ${message},
      completedAt = IF(${dead}, NOW(3), NULL)
    WHERE id = ${job.id} AND status = 'running' AND lockedBy = ${job.claimToken}
  `);
  if (Number((result[0] as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    return "lost_lease";
  }
  return dead ? "dead" : "queued";
}
