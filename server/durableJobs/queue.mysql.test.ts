/**
 * Real two-connection claim proof. Skipped unless PERSONALIZATION_SCHEMA_TEST_DB
 * points at a local MySQL server. Creates and drops spyreels_queue_claim on
 * that server. Refuses a URL that contains prod, staging, or railway.
 * No model call and no production write.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PILOT_JOB_TYPES } from "./types";
import {
  claimNextDurableJob,
  completeDurableJob,
  enqueueDurableJob,
  failDurableJob,
} from "./queue";
import {
  claimInlineRecommendation,
  finishInlineRecommendation,
  type RecommendationPayload,
} from "../personalization/jobs";

const source = process.env.PERSONALIZATION_SCHEMA_TEST_DB;
const DB_NAME = "spyreels_queue_claim";

function assertIsolated(url: string): void {
  const lower = url.toLowerCase();
  if (lower.includes("prod") || lower.includes("staging") || lower.includes("railway")) {
    throw new Error("Refusing a non-local database URL");
  }
}

function queueUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${DB_NAME}`;
  return parsed.toString();
}

const payload: RecommendationPayload = {
  workspaceId: "aaaaaaaa-0000-4000-8000-00000000000a",
  userId: 1,
  socialProfileId: "profile-1",
  step: "goal",
};

describe.skipIf(!source)("durable claim ownership", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let admin: mysql.Connection;

  beforeAll(async () => {
    if (!source) return;
    assertIsolated(source);
    admin = await mysql.createConnection(source);
    await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await admin.query(
      `CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    const sql = readFileSync(
      path.resolve(__dirname, "../../drizzle/0096b_durable_jobs.sql"),
      "utf8"
    );
    const setup = await mysql.createConnection(queueUrl(source));
    await setup.query(sql);
    await setup.end();
    process.env.DATABASE_URL = queueUrl(source);
  });

  afterAll(async () => {
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
      await admin.end();
    }
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  async function reset(): Promise<void> {
    await admin.query(`DELETE FROM \`${DB_NAME}\`.durable_jobs`);
  }

  async function rows(): Promise<Array<Record<string, unknown>>> {
    const [result] = await admin.query(`SELECT * FROM \`${DB_NAME}\`.durable_jobs ORDER BY id`);
    return result as Array<Record<string, unknown>>;
  }

  it("lets two workers claim different jobs and never the same job", async () => {
    await reset();
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-a",
      payload,
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-a",
      payload,
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-b",
      payload: { ...payload, step: "audience" },
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    expect(await rows()).toHaveLength(2);

    const claims = await Promise.all([
      claimNextDurableJob({ workerId: "web-a", leaseSeconds: 300 }),
      claimNextDurableJob({ workerId: "web-b", leaseSeconds: 300 }),
    ]);
    const ids = claims.map((job) => job?.id ?? null);
    expect(ids.filter(Boolean)).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const stored = await rows();
    expect(stored.every((row) => row.status === "running")).toBe(true);
    expect(new Set(stored.map((row) => row.lockedBy)).size).toBe(2);
  });

  it("reclaims an expired lease once and does not let the old owner finish it", async () => {
    await reset();
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-recover",
      payload,
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    const first = await claimNextDurableJob({ workerId: "worker-1", leaseSeconds: 300 });
    expect(first?.attempt).toBe(1);
    await admin.query(
      `UPDATE \`${DB_NAME}\`.durable_jobs SET leaseExpiresAt = DATE_SUB(NOW(3), INTERVAL 5 SECOND) WHERE id = ?`,
      [first?.id]
    );
    const second = await claimNextDurableJob({ workerId: "worker-2", leaseSeconds: 300 });
    expect(second?.id).toBe(first?.id);
    expect(second?.attempt).toBe(2);
    expect(second?.claimToken).not.toBe(first?.claimToken);
    expect(await completeDurableJob(first!)).toBe(false);
    expect(await completeDurableJob(second!)).toBe(true);
    expect((await rows())[0]?.status).toBe("succeeded");
    expect(await claimNextDurableJob({ workerId: "worker-3" })).toBeNull();
  });

  it("retries a failed durable job and keeps a succeeded job finished", async () => {
    await reset();
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-fail",
      payload,
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    const claimed = await claimNextDurableJob({ workerId: "worker-fail", leaseSeconds: 300 });
    expect(await failDurableJob(claimed!, new Error("model failed"))).toBe("queued");
    expect((await rows())[0]?.status).toBe("queued");
    await admin.query(
      `UPDATE \`${DB_NAME}\`.durable_jobs SET availableAt = NOW(3) WHERE id = ?`,
      [claimed?.id]
    );
    const again = await claimNextDurableJob({ workerId: "worker-fail-2", leaseSeconds: 300 });
    expect(again?.id).toBe(claimed?.id);
    expect(again?.attempt).toBe(2);
    expect(await failDurableJob(again!, new Error("model failed again"))).toBe("dead");

    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-done",
      payload,
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    const done = await claimNextDurableJob({ workerId: "worker-done", leaseSeconds: 300 });
    expect(await completeDurableJob(done!)).toBe(true);
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: "job-done",
      payload,
      maxAttempts: 2,
      requeueIfTerminal: false,
    });
    const stored = (await rows()).find((row) => row.idempotencyKey === "job-done");
    expect(stored?.status).toBe("succeeded");
  });

  it("gives inline ownership to one of two callers and records one model failure", async () => {
    await reset();
    const key = "personalization_recommendations:profile-1:goal:v1:evidence:aopen";
    const [first, second] = await Promise.all([
      claimInlineRecommendation(key, payload),
      claimInlineRecommendation(key, payload),
    ]);
    const owners = [first, second].filter((claim) => claim.owned);
    expect(owners).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
    const failed = await finishInlineRecommendation(key, owners[0].token, payload, {
      status: "failed",
      kind: "timeout",
      usage: { model: null, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 },
    });
    expect(failed).toBe(true);
    const repeat = await claimInlineRecommendation(key, payload);
    expect(repeat.owned).toBe(false);
    expect((await rows())[0]?.status).toBe("failed");

    const nextKey = "personalization_recommendations:profile-1:goal:v1:evidence:aconfirmed";
    const confirmed = await claimInlineRecommendation(nextKey, payload);
    expect(confirmed.owned).toBe(true);
    expect(await rows()).toHaveLength(2);
  });

  it("reclaims an expired inline lease once and blocks the old owner", async () => {
    await reset();
    const key = "personalization_recommendations:profile-1:goal:v1:evidence:alease";
    const first = await claimInlineRecommendation(key, payload);
    expect(first.owned).toBe(true);
    const firstRow = (await rows())[0];
    expect(Number(firstRow?.attempt)).toBe(1);

    await admin.query(
      `UPDATE \`${DB_NAME}\`.durable_jobs SET leaseExpiresAt = DATE_SUB(NOW(3), INTERVAL 5 SECOND) WHERE idempotencyKey = ?`,
      [key]
    );
    const second = await claimInlineRecommendation(key, payload);
    expect(second.owned).toBe(true);
    expect(second.token).not.toBe(first.token);
    const reclaimed = (await rows())[0];
    expect(reclaimed?.status).toBe("running");
    expect(reclaimed?.lockedBy).toBe(second.token);
    expect(Number(reclaimed?.attempt)).toBe(2);
    expect(
      await finishInlineRecommendation(key, first.token, payload, { status: "already_confirmed" })
    ).toBe(false);
    expect((await rows())[0]?.status).toBe("running");
    expect((await rows())[0]?.lockedBy).toBe(second.token);

    await admin.query(
      `UPDATE \`${DB_NAME}\`.durable_jobs SET leaseExpiresAt = DATE_SUB(NOW(3), INTERVAL 5 SECOND) WHERE idempotencyKey = ?`,
      [key]
    );
    const third = await claimInlineRecommendation(key, payload);
    expect(third.owned).toBe(false);
    const capped = (await rows())[0];
    expect(Number(capped?.attempt)).toBe(2);
    expect(capped?.lockedBy).toBe(second.token);
    expect(
      await finishInlineRecommendation(key, second.token, payload, { status: "already_confirmed" })
    ).toBe(true);
    expect((await rows())[0]?.status).toBe("succeeded");
    expect((await rows())[0]?.lockedBy).toBeNull();
  });

  it("claims each durable job type once and keeps type filters", async () => {
    await reset();
    for (const jobType of PILOT_JOB_TYPES) {
      await enqueueDurableJob({
        jobType,
        idempotencyKey: `type:${jobType}`,
        payload: { jobType },
        maxAttempts: 2,
        requeueIfTerminal: false,
      });
    }
    const claimed = await Promise.all(
      PILOT_JOB_TYPES.map((jobType, index) =>
        claimNextDurableJob({ workerId: `worker-${index}`, leaseSeconds: 300 })
      )
    );
    const types = claimed.map((job) => job?.jobType);
    expect(types.filter(Boolean)).toHaveLength(PILOT_JOB_TYPES.length);
    expect(new Set(types)).toEqual(new Set(PILOT_JOB_TYPES));
    expect(new Set(claimed.map((job) => job?.id)).size).toBe(PILOT_JOB_TYPES.length);

    await reset();
    await enqueueDurableJob({
      jobType: "creator_radar_refresh",
      idempotencyKey: "type:radar",
      payload: {},
      maxAttempts: 2,
    });
    await enqueueDurableJob({
      jobType: "script_generation",
      idempotencyKey: "type:script",
      payload: {},
      maxAttempts: 2,
    });
    const script = await claimNextDurableJob({
      workerId: "filtered",
      leaseSeconds: 300,
      excludeJobTypes: ["creator_radar_refresh"],
    });
    expect(script?.jobType).toBe("script_generation");
    const radar = (await rows()).find((row) => row.jobType === "creator_radar_refresh");
    expect(radar?.status).toBe("queued");
    const onlyAnalysis = await claimNextDurableJob({
      workerId: "analysis",
      leaseSeconds: 300,
      includeJobTypes: ["profile_analysis"],
    });
    expect(onlyAnalysis).toBeNull();
  });
});
