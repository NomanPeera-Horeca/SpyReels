/**
 * Topic-idea jobs and exact Undo against a REAL MySQL 8 database.
 * Skipped unless PERSONALIZATION_SCHEMA_TEST_DB is set. Uses its own scratch
 * database (<name>_svc), which is DROPPED and recreated. Never point this at
 * a shared, staging or production database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import type { Db } from "./db/analysisStore";
import { addItem, confirmProfile, loadOnboardingState, removeItem } from "./onboarding/onboardingService";
import { requestPillarSubtopics, SUBTOPIC_LIMITS, type TopicGenerator } from "./subtopicJobs";
import {
  addPillarSubtopic,
  dismissPillarSubtopic,
  restorePillarSubtopic,
  SubtopicStoreError,
  verifyPillarSubtopicStore,
} from "./subtopics";

const url = process.env.PERSONALIZATION_SCHEMA_TEST_DB;
const root = path.resolve(__dirname, "../..");
const WS_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WS_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const A = { userId: 1, workspaceId: WS_A };

const preview = (handle: string): PublicProfilePreview => ({
  platform: "instagram",
  handle,
  displayName: "Test Kitchen",
  bio: "Easy weeknight dinners for busy parents",
  category: null,
  externalUrl: null,
  avatarUrl: null,
  bannerUrl: null,
  isVerified: false,
  isPrivate: false,
  postCount: 40,
  followerCount: 1200,
  followingCount: 10,
  likeCount: null,
  videoCount: null,
  recentPosts: [],
});

describe.skipIf(!url)("pillar topic jobs and exact Undo on real MySQL", () => {
  let conn: mysql.Connection;
  let db: Db;
  const q = (sql: string, params: unknown[] = []) => conn.query(sql, params);

  beforeAll(async () => {
    const u = new URL(url!);
    const dbName = `${u.pathname.replace(/^\//, "")}_svc`;
    if (!/^[a-z0-9_]+$/i.test(dbName) || /prod|staging|railway/i.test(url!)) {
      throw new Error("Refusing to use this database for a destructive test");
    }
    conn = await mysql.createConnection({
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      multipleStatements: true,
    });
    await q(`DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\`; USE \`${dbName}\`;`);
    const ddl = readFileSync(path.join(root, "drizzle/0042_workspaces_phase1_create.sql"), "utf8");
    const pick = (name: string) => {
      const start = ddl.indexOf(`CREATE TABLE \`${name}\``);
      const end = ddl.indexOf(";", ddl.indexOf(") ENGINE=", start));
      return ddl.slice(start, end + 1);
    };
    await q(
      "CREATE TABLE `users` (`id` int AUTO_INCREMENT NOT NULL PRIMARY KEY, `email` varchar(320), `onboardingCompletedAt` timestamp NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;"
    );
    await q(pick("workspaces"));
    await q(pick("workspace_members"));
    await q(readFileSync(path.join(root, "docs/architecture/drafts/onboarding_v2_personalization.sql"), "utf8"));
    db = drizzle(conn) as unknown as Db;
  });

  afterAll(async () => {
    await conn?.end();
  });

  beforeEach(async () => {
    await q("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [
      "pillar_subtopic_jobs",
      "pillar_subtopics",
      "personalization_items",
      "personalization_progress",
      "profile_analysis_stages",
      "profile_analysis_runs",
      "workspace_member_active_profiles",
      "social_profiles",
      "user_onboarding_answers",
      "workspace_members",
      "workspaces",
      "users",
    ]) {
      await q(`DELETE FROM \`${t}\``);
    }
    await q("SET FOREIGN_KEY_CHECKS = 1");
    await q("INSERT INTO users (id, email) VALUES (1,'a@x.test'),(2,'b@x.test')");
    await q("INSERT INTO workspaces (id, name, ownerUserId) VALUES (?, 'A', 1), (?, 'B', 2)", [WS_A, WS_B]);
    await q(
      "INSERT INTO workspace_members (id, workspaceId, userId, role) VALUES (UUID(), ?, 1, 'owner'), (UUID(), ?, 2, 'owner')",
      [WS_A, WS_B]
    );
  });

  const setup = async (title = "Menu engineering") => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "pillar", { title, description: "Costs", viewSharePercent: null });
    return { scope: { workspaceId: WS_A, socialProfileId: profileId }, pillarItemId: itemId, profileId };
  };
  const counter = () => {
    const calls = { n: 0 };
    const gen = (labels: string[]): TopicGenerator => async () => {
      calls.n++;
      return { labels };
    };
    return { calls, gen };
  };
  const jobOf = async (pillarItemId: string) => {
    const [rows] = await q(
      "SELECT status, attempts, lastError FROM pillar_subtopic_jobs WHERE pillarItemId = ?",
      [pillarItemId]
    );
    return (rows as Array<{ status: string; attempts: number; lastError: string | null }>)[0];
  };
  /** Moves a job's claim into the past so the next attempt is not on cooldown. */
  const rewind = (pillarItemId: string) =>
    q(
      "UPDATE pillar_subtopic_jobs SET lastClaimedAt = now() - INTERVAL 2 HOUR, lockedUntil = NULL WHERE pillarItemId = ?",
      [pillarItemId]
    );

  it("no model call and an explicit error while migration 0105 is missing", async () => {
    const { scope, pillarItemId } = await setup();
    await q("DROP TABLE pillar_subtopic_jobs");
    try {
      const { calls, gen } = counter();
      expect((await verifyPillarSubtopicStore(db)).ready).toBe(false);
      await expect(requestPillarSubtopics(db, { generate: gen(["Food cost"]) }, { ...scope, pillarItemId })).rejects.toBeInstanceOf(
        SubtopicStoreError
      );
      expect(calls.n).toBe(0);
    } finally {
      await q(readFileSync(path.join(root, "drizzle/0105_pillar_subtopic_jobs.sql"), "utf8"));
    }
    expect((await verifyPillarSubtopicStore(db)).ready).toBe(true);
  });

  it("a pillar gets one successful attempt; a succeeded job is never called again, even with no topics", async () => {
    const { scope, pillarItemId } = await setup();
    const { calls, gen } = counter();
    expect(await requestPillarSubtopics(db, { generate: gen([]) }, { ...scope, pillarItemId })).toEqual({
      status: "generated",
      inserted: 0,
    });
    expect(await requestPillarSubtopics(db, { generate: gen(["Food cost"]) }, { ...scope, pillarItemId })).toEqual({
      status: "already_generated",
    });
    expect(calls.n).toBe(1);
  });

  it("failures are bounded: cooldown, then 3 attempts, then exhausted; only a short code is stored", async () => {
    const { scope, pillarItemId } = await setup();
    let calls = 0;
    const failing: TopicGenerator = async () => {
      calls++;
      throw Object.assign(new Error("secret user text"), { code: "ETIMEDOUT" });
    };
    const input = { ...scope, pillarItemId };
    expect(await requestPillarSubtopics(db, { generate: failing }, input)).toEqual({ status: "failed" });
    expect(await jobOf(pillarItemId)).toMatchObject({ status: "failed", attempts: 1, lastError: "ETIMEDOUT" });
    expect(await requestPillarSubtopics(db, { generate: failing }, input)).toEqual({ status: "cooldown" });
    expect(calls).toBe(1);
    for (const expected of [2, 3]) {
      await rewind(pillarItemId);
      expect(await requestPillarSubtopics(db, { generate: failing }, input)).toEqual({ status: "failed" });
      expect((await jobOf(pillarItemId)).attempts).toBe(expected);
    }
    await rewind(pillarItemId);
    expect(await requestPillarSubtopics(db, { generate: failing }, input)).toEqual({ status: "exhausted" });
    expect(calls).toBe(SUBTOPIC_LIMITS.maxAttempts);
  });

  it("a second request while one is running does not call the model", async () => {
    const { scope, pillarItemId } = await setup();
    const inner = counter();
    const outer: TopicGenerator = async () => {
      const nested = await requestPillarSubtopics(db, { generate: inner.gen(["Food cost"]) }, { ...scope, pillarItemId });
      expect(nested).toEqual({ status: "in_progress" });
      return { labels: [] };
    };
    expect(await requestPillarSubtopics(db, { generate: outer }, { ...scope, pillarItemId })).toEqual({
      status: "generated",
      inserted: 0,
    });
    expect(inner.calls.n).toBe(0);
  });

  it("at most 10 pillars per profile per hour are claimed; the 11th is refused without a call", async () => {
    const { scope, profileId } = await setup("Pillar 0");
    const ids: string[] = [];
    for (let i = 0; i < SUBTOPIC_LIMITS.claimsPerProfilePerHour + 1; i++) {
      const { itemId } = i === 0 ? { itemId: (await loadOnboardingState(db, A)).items.find(x => x.kind === "pillar")!.id } : await addItem(db, A, "pillar", { title: `Pillar ${i}`, description: "d", viewSharePercent: null });
      ids.push(itemId);
    }
    const { calls, gen } = counter();
    for (const id of ids.slice(0, SUBTOPIC_LIMITS.claimsPerProfilePerHour)) {
      expect((await requestPillarSubtopics(db, { generate: gen([]) }, { ...scope, socialProfileId: profileId, pillarItemId: id })).status).toBe("generated");
    }
    expect(await requestPillarSubtopics(db, { generate: gen([]) }, { ...scope, socialProfileId: profileId, pillarItemId: ids[10] })).toEqual({
      status: "rate_limited",
    });
    expect(calls.n).toBe(SUBTOPIC_LIMITS.claimsPerProfilePerHour);
  });

  it("Undo restores exactly the recorded status, and refuses when that status is unknown", async () => {
    const { scope, pillarItemId } = await setup();
    const { gen } = counter();
    await requestPillarSubtopics(db, { generate: gen(["Food cost", "Menu pricing"]) }, { ...scope, pillarItemId });
    const suggested = (await loadOnboardingState(db, A)).pillarSubtopics.find(t => t.label === "Food cost")!;
    expect((await dismissPillarSubtopic(db, { ...scope, subtopicId: suggested.id })).ok).toBe(true);
    expect((await restorePillarSubtopic(db, { ...scope, subtopicId: suggested.id })).ok).toBe(true);
    const back = (await loadOnboardingState(db, A)).pillarSubtopics.find(t => t.id === suggested.id)!;
    expect(back.status).toBe("suggested");

    // A row with no recorded prior status is refused, not guessed as "suggested".
    const other = (await loadOnboardingState(db, A)).pillarSubtopics.find(t => t.label === "Menu pricing")!;
    await q("UPDATE pillar_subtopics SET status = 'dismissed', dismissedFromStatus = NULL WHERE id = ?", [other.id]);
    expect(await restorePillarSubtopic(db, { ...scope, subtopicId: other.id })).toEqual({
      ok: false,
      reason: "unknown_prior_state",
    });
    const [still] = await q("SELECT status FROM pillar_subtopics WHERE id = ?", [other.id]);
    expect((still as Array<{ status: string }>)[0].status).toBe("dismissed");
  });

  it("Undo of a user-entered topic returns it to confirmed", async () => {
    const { scope, pillarItemId } = await setup();
    const added = await addPillarSubtopic(db, { ...scope, pillarItemId, label: "Plate sizes" });
    expect(added.ok).toBe(true);
    const id = (added as { id: string }).id;
    await dismissPillarSubtopic(db, { ...scope, subtopicId: id });
    expect(await restorePillarSubtopic(db, { ...scope, subtopicId: id })).toEqual({ ok: true, id });
    const [row] = await q("SELECT status FROM pillar_subtopics WHERE id = ?", [id]);
    expect((row as Array<{ status: string }>)[0].status).toBe("confirmed");
  });

  it("Undo is refused while the owning pillar is no longer live", async () => {
    const { scope, pillarItemId } = await setup();
    const { gen } = counter();
    await requestPillarSubtopics(db, { generate: gen(["Food cost"]) }, { ...scope, pillarItemId });
    const food = (await loadOnboardingState(db, A)).pillarSubtopics.find(t => t.label === "Food cost")!;
    await dismissPillarSubtopic(db, { ...scope, subtopicId: food.id });
    await removeItem(db, A, pillarItemId);
    expect(await restorePillarSubtopic(db, { ...scope, subtopicId: food.id })).toEqual({
      ok: false,
      reason: "pillar_not_live",
    });
  });
});
