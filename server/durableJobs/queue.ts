import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
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

function jobTypeListSql(types: PilotJobType[]): SQL {
  return sql.join(
    types.map((type) => sql`${type}`),
    sql`, `
  );
}

const CLAIM_BACKOFF_MS = [0, 40, 120, 280];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectedRows(result: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(result)) return [];
  const packet = result[0];
  return Array.isArray(packet) ? (packet as Array<Record<string, unknown>>) : [];
}

/** Deadlock and lock-wait are transient. The claim rolls back and can be retried. */
export function isTransientLockConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    const code = typeof record.code === "string" ? record.code : "";
    const errno = typeof record.errno === "number" ? record.errno : NaN;
    const message = typeof record.message === "string" ? record.message : "";
    if (
      code === "ER_LOCK_DEADLOCK" ||
      code === "ER_LOCK_WAIT_TIMEOUT" ||
      errno === 1213 ||
      errno === 1205 ||
      message.includes("Deadlock found") ||
      message.includes("Lock wait timeout")
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function claimTypeFilterSql(input: {
  includeJobTypes?: PilotJobType[];
  excludeJobTypes?: PilotJobType[];
}): SQL {
  if (input.includeJobTypes && input.includeJobTypes.length > 0) {
    return sql`AND jobType IN (${jobTypeListSql(input.includeJobTypes)})`;
  }
  if (input.excludeJobTypes && input.excludeJobTypes.length > 0) {
    return sql`AND jobType NOT IN (${jobTypeListSql(input.excludeJobTypes)})`;
  }
  return sql``;
}

export async function enqueueDurableJob(input: {
  jobType: PilotJobType;
  idempotencyKey: string;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
  /**
   * Creator Radar refreshes are intentionally re-runnable. When true, a new
   * enqueue after succeeded/failed/dead (or still queued) updates payload and
   * returns the job to queued. Active running leases are left alone.
   */
  requeueIfTerminal?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const payload = JSON.stringify(input.payload);
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const availableAt = input.availableAt ?? new Date();
  const requeue = Boolean(input.requeueIfTerminal);

  const result = await db.execute(sql`
    INSERT INTO durable_jobs
      (jobType, idempotencyKey, payload, status, maxAttempts, availableAt)
    VALUES
      (${input.jobType}, ${input.idempotencyKey}, ${payload}, 'queued', ${maxAttempts}, ${availableAt})
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      payload = IF(
        ${requeue} AND status IN ('queued', 'failed', 'dead', 'succeeded'),
        VALUES(payload),
        payload
      ),
      attempt = IF(
        (${requeue} AND status IN ('failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        0,
        attempt
      ),
      availableAt = IF(
        (${requeue} AND status IN ('queued', 'failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        VALUES(availableAt),
        availableAt
      ),
      leaseExpiresAt = IF(
        (${requeue} AND status IN ('failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        NULL,
        leaseExpiresAt
      ),
      lockedBy = IF(
        (${requeue} AND status IN ('failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        NULL,
        lockedBy
      ),
      lastError = IF(
        (${requeue} AND status IN ('failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        NULL,
        lastError
      ),
      completedAt = IF(
        (${requeue} AND status IN ('failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        NULL,
        completedAt
      ),
      status = IF(
        (${requeue} AND status IN ('failed', 'dead', 'succeeded'))
          OR status IN ('failed', 'dead'),
        'queued',
        status
      )
  `);
  return Number((result[0] as { insertId?: number }).insertId ?? 0);
}

export async function countActiveDurableJobs(
  jobType: PilotJobType
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS activeCount
    FROM durable_jobs
    WHERE jobType = ${jobType} AND status IN ('queued', 'running')
  `);
  const row = (rows[0] as unknown as Array<{ activeCount?: number | string }>)[0];
  return Number(row?.activeCount ?? 0);
}

export async function requeueDeadDurableJobByKey(input: {
  jobType: PilotJobType;
  idempotencyKey: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    UPDATE durable_jobs
    SET
      status = 'queued',
      attempt = 0,
      availableAt = NOW(3),
      leaseExpiresAt = NULL,
      lockedBy = NULL,
      lastError = NULL,
      completedAt = NULL,
      updatedAt = NOW(3)
    WHERE
      jobType = ${input.jobType}
      AND idempotencyKey = ${input.idempotencyKey}
      AND status IN ('failed', 'dead')
  `);
  return Number((result[0] as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

export async function claimNextDurableJob(input: {
  workerId: string;
  leaseSeconds?: number;
  includeJobTypes?: PilotJobType[];
  excludeJobTypes?: PilotJobType[];
}): Promise<ClaimedJob | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const leaseSeconds = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const claimToken = `${input.workerId}:${randomUUID()}`;
  const typeFilter = claimTypeFilterSql(input);

  // The previous single-statement UPDATE ... WHERE id = (SELECT ... LIMIT 1)
  // deadlocked two workers (ER_LOCK_DEADLOCK, errno 1213). One worker won the
  // row and the other threw, which exited the process. A range
  // SELECT ... ORDER BY ... LIMIT 1 FOR UPDATE also hides the next queued row
  // from the second worker. Read the candidate ids, then lock one primary key.
  // SKIP LOCKED on that key returns nothing when another worker already owns
  // it, so the second worker takes the next id.
  const claimOnce = async (): Promise<ClaimedJob | null> =>
    db.transaction(async (tx) => {
      const candidates = await tx.execute(sql`
        SELECT id
        FROM durable_jobs
        WHERE
          (
            status = 'queued'
            OR (status = 'running' AND leaseExpiresAt < NOW(3))
          )
          AND availableAt <= NOW(3)
          AND attempt < maxAttempts
          ${typeFilter}
        ORDER BY availableAt ASC, id ASC
        LIMIT 16
      `);
      for (const candidate of selectedRows(candidates)) {
        const id = Number(candidate.id ?? 0);
        if (!id) continue;
        const locked = await tx.execute(sql`
          SELECT id
          FROM durable_jobs
          WHERE
            id = ${id}
            AND (
              status = 'queued'
              OR (status = 'running' AND leaseExpiresAt < NOW(3))
            )
            AND availableAt <= NOW(3)
            AND attempt < maxAttempts
          FOR UPDATE SKIP LOCKED
        `);
        if (!selectedRows(locked)[0]) continue;
        await tx.execute(sql`
          UPDATE durable_jobs
          SET
            status = 'running',
            attempt = attempt + 1,
            lockedBy = ${claimToken},
            leaseExpiresAt = DATE_ADD(NOW(3), INTERVAL ${leaseSeconds} SECOND),
            updatedAt = NOW(3)
          WHERE
            id = ${id}
            AND (
              status = 'queued'
              OR (status = 'running' AND leaseExpiresAt < NOW(3))
            )
            AND availableAt <= NOW(3)
            AND attempt < maxAttempts
        `);
        const rows = await tx.execute(sql`
          SELECT *
          FROM durable_jobs
          WHERE id = ${id} AND lockedBy = ${claimToken} AND status = 'running'
          LIMIT 1
        `);
        const row = selectedRows(rows)[0];
        if (row) return coerceJob(row, claimToken);
      }
      return null;
    }, { isolationLevel: "read committed" });

  for (let attempt = 0; attempt < CLAIM_BACKOFF_MS.length; attempt += 1) {
    if (CLAIM_BACKOFF_MS[attempt] > 0) await delay(CLAIM_BACKOFF_MS[attempt]);
    try {
      return await claimOnce();
    } catch (error) {
      const last = attempt === CLAIM_BACKOFF_MS.length - 1;
      if (!isTransientLockConflict(error)) throw error;
      if (last) {
        console.warn("[durableJobs] claim lock conflict, skipping this poll");
        return null;
      }
    }
  }
  return null;
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
