/**
 * Onboarding v2 service + MySQL stores against a REAL MySQL 8 database.
 * Skipped unless PERSONALIZATION_SCHEMA_TEST_DB is set. Uses its own scratch
 * database (<name>_svc), which is DROPPED and recreated. Never point this at
 * a shared, staging or production database.
 *
 * The AI model and the provider are fakes here: this tests storage, rules
 * and isolation, not AI quality.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InvokeParams, InvokeResult } from "../../_core/llm";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { createAnalysisStore, createRecommendationStore, type Db } from "../db/analysisStore";
import { requestProfileAnalysis } from "../analysis/requestProfileAnalysis";
import { runProfileAnalysis } from "../analysis/runProfileAnalysis";
import { generateRecommendations } from "../intelligence/recommendationService";
import {
  addItem,
  completeOnboarding,
  confirmProfile,
  editItem,
  loadOnboardingState,
  removeItem,
  restoreItem,
  resolveStep,
  saveAttribution,
  saveUseCase,
  listWorkspaceProfiles,
  startNotPostingYet,
  switchActiveProfile,
} from "./onboardingService";
import {
  addPillarSubtopic,
  dismissPillarSubtopic,
  restorePillarSubtopic,
  saveGeneratedSubtopics,
  SubtopicStoreError,
  verifyPillarSubtopicStore,
} from "../subtopics";
import { requestPillarSubtopics } from "../subtopicJobs";
import { homeContextFromState } from "../home/homeService";

const url = process.env.PERSONALIZATION_SCHEMA_TEST_DB;
const root = path.resolve(__dirname, "../../..");
const WS_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WS_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const A = { userId: 1, workspaceId: WS_A };
const B = { userId: 2, workspaceId: WS_B };
const authCtx = (c: typeof A) => ({
  user: { id: c.userId },
  workspaceId: c.workspaceId,
  workspaceRole: "owner",
});

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

function fakeInvoker(outputs: Record<string, unknown>) {
  return async (p: InvokeParams): Promise<InvokeResult> => ({
    id: "x",
    created: 0,
    model: "claude-sonnet-4-6",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(outputs[p.operation ?? ""]) },
        finish_reason: "tool_use",
      },
    ],
    usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 },
  });
}

const GOAL_OUT = {
  decision: "suggest",
  goal: "Help busy parents cook easy weeknight dinners.",
  confidence: "medium",
  evidence_basis: ["bio"],
  clarifying_question: "",
  offer_quote: "",
};
const AUDIENCE_OUT = {
  audiences: [
    { who: "Busy parents", outcome: "cook dinner fast", why: "The bio speaks to them." },
    { who: "New home cooks", outcome: "learn simple recipes", why: "Easy recipes fit them." },
  ],
  confidence: "medium",
};

describe.skipIf(!url)("onboarding v2 service on real MySQL", () => {
  let conn: mysql.Connection;
  let db: Db;
  // Concurrency tests need separate connections (production uses a pool). One connection would
  // serialize them and hide lock bugs.
  let pool: mysql.Pool;
  let poolDb: Db;
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
    await q(readFileSync(path.join(root, "drizzle/0104_pillar_subtopics.sql"), "utf8"));
    db = drizzle(conn) as unknown as Db;
    pool = mysql.createPool({
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: dbName,
      connectionLimit: 4,
    });
    poolDb = drizzle(pool) as unknown as Db;
  });

  afterAll(async () => {
    await pool?.end();
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

  it("starts at the platform step and resumes at 3a after That's me", async () => {
    expect((await loadOnboardingState(db, A)).resumeStep).toBe("platform");
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const state = await loadOnboardingState(db, A);
    expect(state.resumeStep).toBe("use_case");
    expect(state.profile).toMatchObject({ id: profileId, handle: "test.kitchen", status: "confirmed" });
    // Same handle again (reload, double tap) reuses the same row.
    expect((await confirmProfile(db, A, preview("test.kitchen"))).profileId).toBe(profileId);
  });

  it("skip on 3b is stored as unanswered (null), never as Other, and resume moves to Goal", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    await saveUseCase(db, A, "find_viral_videos");
    expect((await loadOnboardingState(db, A)).resumeStep).toBe("attribution");
    await saveAttribution(db, A, null);
    const [rows] = await q("SELECT attributionSource, attributionSkippedAt FROM user_onboarding_answers WHERE userId = 1");
    const row = (rows as Array<{ attributionSource: string | null; attributionSkippedAt: Date | null }>)[0];
    expect(row.attributionSource).toBeNull();
    expect(row.attributionSkippedAt).not.toBeNull();
    expect((await loadOnboardingState(db, A)).resumeStep).toBe("goal");
  });

  it("first analysis: one run per account, real stage states, no duplicate on repeat", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const enqueued: string[] = [];
    const deps = {
      store: createAnalysisStore(db),
      enqueue: async (i: { idempotencyKey: string }) => {
        enqueued.push(i.idempotencyKey);
        return 1;
      },
      newId: randomUUID,
      now: () => new Date(),
    };
    const first = await requestProfileAnalysis(deps, { ctx: authCtx(A), socialProfileId: profileId, requestKind: "initial" });
    const again = await requestProfileAnalysis(deps, { ctx: authCtx(A), socialProfileId: profileId, requestKind: "initial" });
    expect(first.status).toBe("started");
    expect(again).toMatchObject({ status: "reused" });
    const [runs] = await q("SELECT COUNT(*) AS n FROM profile_analysis_runs");
    expect(Number((runs as Array<{ n: number }>)[0].n)).toBe(1);
    expect(new Set(enqueued).size).toBe(1);

    let state = await loadOnboardingState(db, A);
    expect(state.analysis?.status).toBe("queued");
    expect(Object.values(state.analysis!.stages).every(s => s === "waiting")).toBe(true);

    const runId = (first as { runId: string }).runId;
    const outcome = await runProfileAnalysis(
      { payload: { runId, workspaceId: WS_A, socialProfileId: profileId, requestKind: "initial" }, attempt: 1, maxAttempts: 1 },
      {
        store: createAnalysisStore(db),
        source: {
          fetchPosts: async ({ platform, handle, windowStart, windowEnd }) => ({
            snapshot: {
              version: 1,
              platform,
              handle,
              followerCount: 1200,
              windowStart: windowStart.toISOString(),
              windowEnd: windowEnd.toISOString(),
              posts: [
                { postId: "p1", url: null, publishedAt: windowEnd.toISOString(), views: 900, likes: 20, comments: 2, durationSec: 20, caption: "15 minute pasta" },
              ],
            },
            meter: { requests: 2, blockedByBudget: 0, byStatus: { "200": 2 }, budget: 25, estimatedUsd: 0.004 },
          }),
        },
        suggestions: null,
        now: () => new Date(),
      }
    );
    expect(outcome).toMatchObject({ outcome: "finished", status: "succeeded" });
    state = await loadOnboardingState(db, A);
    expect(state.analysis).toMatchObject({ status: "succeeded", postsInWindow: 1 });
    expect(state.analysis!.stages).toMatchObject({ published_content: "done", strongest_performers: "done" });
    const [cost] = await q("SELECT providerCallCount FROM profile_analysis_runs WHERE id = ?", [runId]);
    expect((cost as Array<{ providerCallCount: number }>)[0].providerCallCount).toBe(2);
  });

  it("Goal -> confirm -> Audience; an edit supersedes (history kept) and makes in-flight AI results stale", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const store = createRecommendationStore(db);
    const invoker = fakeInvoker({
      personalization_goal_inference: GOAL_OUT,
      personalization_audience_recommendations: AUDIENCE_OUT,
    });
    const goal = await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "goal" });
    expect(goal.status).toBe("generated");
    let state = await loadOnboardingState(db, A);
    const suggestedGoal = state.items.find(i => i.kind === "goal")!;
    expect(suggestedGoal).toMatchObject({ status: "suggested", source: "ai_suggested" });

    await resolveStep(db, A, "goal", "confirm");
    state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.kind === "goal")!.status).toBe("confirmed");
    expect(state.steps.goal).toBe("confirmed");

    // The engine never regenerates a confirmed goal.
    // Cursor's contract: unchanged inputs return "reused" pointing at the confirmed goal (no new suggestion).
    const again = await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "goal" });
    expect(["reused", "already_confirmed"]).toContain(again.status);
    if (again.status === "reused") expect(again.liveSuggestionIds).toEqual([state.items.find(i => i.kind === "goal")!.id]);

    const aud = await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "audience" });
    expect(aud.status).toBe("generated");
    state = await loadOnboardingState(db, A);
    expect(state.items.filter(i => i.kind === "audience")).toHaveLength(2);

    // User edits the goal: old row superseded, new confirmed row, version bumped.
    const goalId = state.items.find(i => i.kind === "goal")!.id;
    await editItem(db, A, goalId, { text: "Teach busy parents 15 minute dinners." });
    state = await loadOnboardingState(db, A);
    expect(state.version).toBe(2);
    const goals = state.items.filter(i => i.kind === "goal");
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ source: "user_edited", status: "confirmed" });
    const [hist] = await q("SELECT status FROM personalization_items WHERE id = ?", [goalId]);
    expect((hist as Array<{ status: string }>)[0].status).toBe("superseded");

    // A result computed for the OLD goal is dropped at write time (compare-and-write).
    const staleWrite = await store.applyGeneratedSuggestions(profileId, {
      kind: "audience",
      guard: { type: "inputs_unchanged", expected: "0000000000000000" },
      supersedeIds: [],
      inserts: [],
    });
    expect(staleWrite).toBe("stale");
  });

  it("remove: suggestion dismissed, confirmed value kept as history; add is a confirmed user value", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const store = createRecommendationStore(db);
    const invoker = fakeInvoker({
      personalization_goal_inference: GOAL_OUT,
      personalization_audience_recommendations: AUDIENCE_OUT,
    });
    await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "goal" });
    await resolveStep(db, A, "goal", "confirm");
    await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "audience" });
    let state = await loadOnboardingState(db, A);
    const [first] = state.items.filter(i => i.kind === "audience");
    await removeItem(db, A, first.id);
    const { itemId } = await addItem(db, A, "audience", { who: "Students", outcome: "eat well on a budget" });
    state = await loadOnboardingState(db, A);
    const audiences = state.items.filter(i => i.kind === "audience");
    expect(audiences.map(a => a.id)).not.toContain(first.id);
    expect(audiences.find(a => a.id === itemId)).toMatchObject({ status: "confirmed", source: "user_entered" });
    const [d] = await q("SELECT status, dismissedAtVersion FROM personalization_items WHERE id = ?", [first.id]);
    expect((d as Array<{ status: string; dismissedAtVersion: number }>)[0]).toMatchObject({ status: "dismissed", dismissedAtVersion: 1 });
  });

  const addPillar = async (title = "Dinners") => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "pillar", { title, description: "", viewSharePercent: null } as never);
    return { profileId, pillarId: itemId };
  };
  const seedPillar = async () => {
    const { profileId, pillarId } = await addPillar();
    await saveGeneratedSubtopics(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      groups: [{ title: "Dinners", labels: ["One-pan meals", "Budget dinners"], pillarHash: "h1" }],
    });
    return { profileId, pillarId };
  };
  const labelOf = (state: Awaited<ReturnType<typeof loadOnboardingState>>, label: string) =>
    state.pillarSubtopics.find(s => s.label === label)!;
  const scopeOf = (profileId: string, pillarItemId: string) => ({ workspaceId: WS_A, socialProfileId: profileId, pillarItemId });
  const fakeGen = (result: string[] | Error) => {
    const calls = { n: 0 };
    const generate = async () => {
      calls.n++;
      if (result instanceof Error) throw result;
      return { title: "Dinners", labels: result };
    };
    return { generate, calls };
  };
  const backdateJob = (pillarItemId: string) =>
    q("UPDATE pillar_subtopic_jobs SET lastClaimedAt = now() - INTERVAL 2 MINUTE WHERE pillarItemId = ?", [pillarItemId]);

  it("topic ideas are never generated on load or reload; one explicit request generates them once", async () => {
    const { profileId, pillarId } = await addPillar();
    const gen = fakeGen(["One-pan meals", "Budget dinners"]);
    let state = await loadOnboardingState(db, A);
    expect(state.subtopicStore).toEqual({ ready: true, missing: [] });
    expect(state.pillarTopics[pillarId]).toEqual({ state: "never_generated", attempts: 0 });
    await loadOnboardingState(db, A);
    expect(gen.calls.n).toBe(0);

    const scope = scopeOf(profileId, pillarId);
    expect(await requestPillarSubtopics(db, { generate: gen.generate }, scope)).toEqual({ status: "generated", inserted: 2 });
    expect(gen.calls.n).toBe(1);
    state = await loadOnboardingState(db, A);
    expect(state.pillarTopics[pillarId].state).toBe("ready");
    expect(await requestPillarSubtopics(db, { generate: gen.generate }, scope)).toEqual({ status: "already_has_topics" });
    expect(gen.calls.n).toBe(1);
  });

  it("failed generation: no automatic retry, a cooldown, at most three attempts, then exhausted", async () => {
    const { profileId, pillarId } = await addPillar();
    const scope = scopeOf(profileId, pillarId);
    const bad = fakeGen(new Error("model timeout"));
    expect(await requestPillarSubtopics(db, { generate: bad.generate }, scope)).toEqual({ status: "failed" });
    expect((await loadOnboardingState(db, A)).pillarTopics[pillarId]).toEqual({ state: "failed", attempts: 1 });
    await loadOnboardingState(db, A);
    expect(bad.calls.n).toBe(1);

    expect(await requestPillarSubtopics(db, { generate: bad.generate }, scope)).toEqual({ status: "cooldown" });
    expect(bad.calls.n).toBe(1);

    await backdateJob(pillarId);
    expect(await requestPillarSubtopics(db, { generate: bad.generate }, scope)).toEqual({ status: "failed" });
    await backdateJob(pillarId);
    expect(await requestPillarSubtopics(db, { generate: bad.generate }, scope)).toEqual({ status: "failed" });
    expect(bad.calls.n).toBe(3);
    expect((await loadOnboardingState(db, A)).pillarTopics[pillarId]).toEqual({ state: "exhausted", attempts: 3 });

    await backdateJob(pillarId);
    expect(await requestPillarSubtopics(db, { generate: bad.generate }, scope)).toEqual({ status: "exhausted" });
    expect(bad.calls.n).toBe(3);
  });

  it("explicit states: all topics dismissed and an empty success are distinct from never generated", async () => {
    const { profileId, pillarId } = await addPillar();
    const scope = scopeOf(profileId, pillarId);
    const ok = fakeGen(["Budget dinners"]);
    await requestPillarSubtopics(db, { generate: ok.generate }, scope);
    const topic = labelOf(await loadOnboardingState(db, A), "Budget dinners");
    await dismissPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: topic.id });
    expect((await loadOnboardingState(db, A)).pillarTopics[pillarId].state).toBe("all_dismissed");
    expect(await requestPillarSubtopics(db, { generate: ok.generate }, scope)).toEqual({ status: "already_generated" });
    expect(ok.calls.n).toBe(1);

    const { pillarId: emptyId } = await addPillar("Breakfast");
    const empty = fakeGen([]);
    expect(await requestPillarSubtopics(db, { generate: empty.generate }, scopeOf(profileId, emptyId))).toEqual({
      status: "generated",
      inserted: 0,
    });
    expect((await loadOnboardingState(db, A)).pillarTopics[emptyId].state).toBe("no_topics");
    expect(await requestPillarSubtopics(db, { generate: empty.generate }, scopeOf(profileId, emptyId))).toEqual({
      status: "already_generated",
    });
    expect(empty.calls.n).toBe(1);
  });

  it("hourly limit: at most ten pillars claimed per profile in an hour", async () => {
    const gen = fakeGen(["Budget dinners"]);
    let profileId = "";
    for (let i = 0; i < 10; i++) {
      const added = await addPillar(`Topic ${i}`);
      profileId = added.profileId;
      expect(await requestPillarSubtopics(db, { generate: gen.generate }, scopeOf(profileId, added.pillarId))).toMatchObject({
        status: "generated",
      });
    }
    const eleventh = await addPillar("Eleventh");
    expect(await requestPillarSubtopics(db, { generate: gen.generate }, scopeOf(profileId, eleventh.pillarId))).toEqual({
      status: "rate_limited",
    });
    expect(gen.calls.n).toBe(10);
  });

  it("two simultaneous requests for one pillar call the model once", async () => {
    const { profileId, pillarId } = await addPillar();
    const calls = { n: 0 };
    const slow = {
      generate: async () => {
        calls.n++;
        await new Promise(r => setTimeout(r, 150));
        return { title: "Dinners", labels: ["Budget dinners"] };
      },
    };
    const scope = scopeOf(profileId, pillarId);
    const [a, b] = await Promise.all([
      requestPillarSubtopics(poolDb, slow, scope),
      requestPillarSubtopics(poolDb, slow, scope),
    ]);
    expect(calls.n).toBe(1);
    expect([a.status, b.status].sort()).toEqual(["generated", "in_progress"]);
  });

  it("a missing migration column is an explicit error: nothing is shown, nothing is called or written", async () => {
    const { profileId, pillarId } = await addPillar();
    const scope = scopeOf(profileId, pillarId);
    await q("ALTER TABLE pillar_subtopics DROP COLUMN dismissedFromStatus");
    try {
      const state = await loadOnboardingState(db, A);
      expect(state.subtopicStore.ready).toBe(false);
      expect(state.subtopicStore.missing.join(" ")).toMatch(/dismissedFromStatus/);
      expect(state.pillarSubtopics).toEqual([]);
      expect(state.pillarTopics).toEqual({});

      const gen = fakeGen(["Budget dinners"]);
      await expect(requestPillarSubtopics(db, { generate: gen.generate }, scope)).rejects.toThrow(SubtopicStoreError);
      expect(gen.calls.n).toBe(0);
      await expect(
        saveGeneratedSubtopics(db, { workspaceId: WS_A, socialProfileId: profileId, groups: [{ title: "Dinners", labels: ["x y"], pillarHash: "h" }] })
      ).rejects.toThrow(SubtopicStoreError);
      await expect(
        addPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, pillarItemId: pillarId, label: "Lentil soup" })
      ).rejects.toThrow(SubtopicStoreError);
      // The pillar itself still saves (Cursor's requirement): edits are not blocked by the store.
      await expect(
        editItem(db, A, pillarId, { title: "Dinners", description: "Weeknights", viewSharePercent: null } as never)
      ).resolves.toBeDefined();
      expect((await verifyPillarSubtopicStore(db)).ready).toBe(false);
    } finally {
      await q("ALTER TABLE pillar_subtopics ADD COLUMN dismissedFromStatus enum('suggested','confirmed') NULL AFTER status");
    }
    expect(await verifyPillarSubtopicStore(db)).toEqual({ ready: true });
  });

  it("migration 0105 applies to a database that has 0104 only, and verifies", async () => {
    await q("DROP TABLE pillar_subtopic_jobs");
    await q("ALTER TABLE pillar_subtopics DROP COLUMN dismissedFromStatus");
    const before = await verifyPillarSubtopicStore(db);
    expect(before.ready === false && before.missing.join(" ")).toMatch(/migration 0105/);
    await q(readFileSync(path.join(root, "drizzle/0105_pillar_subtopic_recovery.sql"), "utf8"));
    expect(await verifyPillarSubtopicStore(db)).toEqual({ ready: true });
  });

  it("migrations: a missing 0104 table is reported by name; applying 0104 then 0105 restores readiness", async () => {
    const { profileId, pillarId } = await addPillar();
    await q("DROP TABLE pillar_subtopics");
    try {
      const check = await verifyPillarSubtopicStore(db);
      expect(check.ready).toBe(false);
      expect(check.ready === false && check.missing.join(" ")).toMatch(/migration 0104: table pillar_subtopics is missing/);
      const state = await loadOnboardingState(db, A);
      expect(state.subtopicStore.ready).toBe(false);
      await expect(
        requestPillarSubtopics(db, fakeGen(["Budget dinners"]), scopeOf(profileId, pillarId))
      ).rejects.toThrow(SubtopicStoreError);
    } finally {
      await q(readFileSync(path.join(root, "drizzle/0104_pillar_subtopics.sql"), "utf8"));
      await q("ALTER TABLE pillar_subtopics ADD COLUMN dismissedFromStatus enum('suggested','confirmed') NULL AFTER status");
    }
    expect(await verifyPillarSubtopicStore(db)).toEqual({ ready: true });
    expect(await requestPillarSubtopics(db, fakeGen(["Budget dinners"]), scopeOf(profileId, pillarId))).toEqual({
      status: "generated",
      inserted: 1,
    });
  });

  it("same-title edit: topics, dismissals and the generation job follow the pillar's new id", async () => {
    const { profileId, pillarId } = await seedPillar();
    await q(
      "INSERT INTO pillar_subtopic_jobs (id, workspaceId, socialProfileId, pillarItemId, status, attempts, lastClaimedAt) VALUES (UUID(), ?, ?, ?, 'succeeded', 1, now())",
      [WS_A, profileId, pillarId]
    );
    const one = labelOf(await loadOnboardingState(db, A), "One-pan meals");
    await dismissPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id });

    const { itemId: newId } = await editItem(db, A, pillarId, {
      title: "Dinners",
      description: "Weeknight dinners",
      viewSharePercent: null,
    } as never);
    const state = await loadOnboardingState(db, A);
    expect(state.pillarSubtopics.filter(s => s.pillarItemId === newId).map(s => [s.label, s.status]).sort()).toEqual([
      ["Budget dinners", "suggested"],
      ["One-pan meals", "dismissed"],
    ]);
    expect(state.pillarSubtopics.filter(s => s.pillarItemId === pillarId)).toEqual([]);
    const [job] = (await q("SELECT pillarItemId FROM pillar_subtopic_jobs WHERE socialProfileId = ?", [profileId])) as unknown as [Array<{ pillarItemId: string }>];
    expect(job.map(j => j.pillarItemId)).toEqual([newId]);
    expect(state.pillarTopics[newId].state).toBe("ready");
  });

  it("changed-title edit: no topics move; history stays on the old pillar; an earlier dismissal still blocks that label under the old title", async () => {
    const { profileId, pillarId } = await seedPillar();
    const one = labelOf(await loadOnboardingState(db, A), "One-pan meals");
    await dismissPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id });

    const { itemId: renamedId } = await editItem(db, A, pillarId, { title: "Quick dinners", description: "", viewSharePercent: null } as never);
    let state = await loadOnboardingState(db, A);
    expect(state.pillarSubtopics.some(s => s.pillarItemId === renamedId)).toBe(false);
    expect(state.pillarTopics[renamedId]).toEqual({ state: "never_generated", attempts: 0 });
    expect(await loadOnboardingState(db, A).then(s => s.pillarSubtopics.length)).toBe(0); // old pillar is not live
    const [hist] = (await q("SELECT status, dismissedFromStatus FROM pillar_subtopics WHERE pillarItemId = ? AND label = 'One-pan meals'", [pillarId])) as unknown as [Array<{ status: string; dismissedFromStatus: string }>];
    expect(hist[0]).toMatchObject({ status: "dismissed", dismissedFromStatus: "suggested" });

    // Renaming back to the old title: the earlier dismissal still applies to that title.
    const { itemId: backId } = await editItem(db, A, renamedId, { title: "Dinners", description: "", viewSharePercent: null } as never);
    const gen = fakeGen(["One-pan meals", "Lentil soup"]);
    expect(await requestPillarSubtopics(db, { generate: gen.generate }, scopeOf(profileId, backId))).toEqual({
      status: "generated",
      inserted: 1,
    });
    state = await loadOnboardingState(db, A);
    expect(state.pillarSubtopics.filter(s => s.pillarItemId === backId).map(s => s.label)).toEqual(["Lentil soup"]);
  });

  it("undo of a removed pillar brings its topics back on the restored pillar id; a dismissed topic is restored only while its pillar is live", async () => {
    const { profileId, pillarId } = await seedPillar();
    const two = labelOf(await loadOnboardingState(db, A), "Budget dinners");
    await dismissPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: two.id });

    await removeItem(db, A, pillarId);
    expect((await loadOnboardingState(db, A)).items.find(i => i.id === pillarId)).toBeUndefined();
    await expect(
      restorePillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: two.id })
    ).resolves.toEqual({ ok: false, reason: "pillar_not_live" });

    const { itemId: restoredId } = await restoreItem(db, A, pillarId);
    let state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === restoredId)).toMatchObject({ kind: "pillar", status: "confirmed" });
    expect(state.pillarSubtopics.filter(s => s.pillarItemId === restoredId).map(s => [s.label, s.status]).sort()).toEqual([
      ["Budget dinners", "dismissed"],
      ["One-pan meals", "suggested"],
    ]);
    expect(state.pillarSubtopics.filter(s => s.pillarItemId === pillarId)).toEqual([]);

    await expect(
      restorePillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: two.id })
    ).resolves.toEqual({ ok: true, id: two.id, status: "suggested" });
    state = await loadOnboardingState(db, A);
    expect(labelOf(state, "Budget dinners")).toMatchObject({ pillarItemId: restoredId, status: "suggested" });

    await expect(restoreItem(db, A, pillarId)).rejects.toThrow(/already restored|changed/);
  });

  it("exact undo: a dismissed topic returns to the status it had, not one inferred from its source", async () => {
    const { profileId, pillarId } = await seedPillar();
    const one = labelOf(await loadOnboardingState(db, A), "One-pan meals");
    // An AI topic that the user had confirmed: source ai_suggested, status confirmed.
    await q("UPDATE pillar_subtopics SET status = 'confirmed' WHERE id = ?", [one.id]);
    await dismissPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id });
    expect(labelOf(await loadOnboardingState(db, A), "One-pan meals")).toMatchObject({ status: "dismissed", dismissedFromStatus: "confirmed" });
    await expect(
      restorePillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id })
    ).resolves.toEqual({ ok: true, id: one.id, status: "confirmed" });
    expect(labelOf(await loadOnboardingState(db, A), "One-pan meals")).toMatchObject({ status: "confirmed", dismissedFromStatus: null });
    expect(pillarId).toBeTruthy();
  });

  it("exact undo refuses a dismissed topic with no recorded prior status, and another workspace cannot dismiss or restore it", async () => {
    const { profileId } = await seedPillar();
    const one = labelOf(await loadOnboardingState(db, A), "One-pan meals");
    await dismissPillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id });
    await q("UPDATE pillar_subtopics SET dismissedFromStatus = NULL WHERE id = ?", [one.id]);
    await expect(
      restorePillarSubtopic(db, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id })
    ).resolves.toEqual({ ok: false, reason: "unknown_prior_state" });

    await q("UPDATE pillar_subtopics SET dismissedFromStatus = 'suggested' WHERE id = ?", [one.id]);
    await expect(
      restorePillarSubtopic(db, { workspaceId: WS_B, socialProfileId: profileId, subtopicId: one.id })
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    const budget = labelOf(await loadOnboardingState(db, A), "Budget dinners");
    await expect(
      dismissPillarSubtopic(db, { workspaceId: WS_B, socialProfileId: profileId, subtopicId: budget.id })
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(labelOf(await loadOnboardingState(db, A), "Budget dinners").status).toBe("suggested");
  });

  it("concurrent undo and dismiss clicks end in one exact result", async () => {
    const { profileId } = await seedPillar();
    const one = labelOf(await loadOnboardingState(db, A), "One-pan meals");
    const scope = { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id };
    const [d1, d2] = await Promise.all([dismissPillarSubtopic(poolDb, scope), dismissPillarSubtopic(poolDb, scope)]);
    expect(d1.ok && d2.ok).toBe(true);
    expect(labelOf(await loadOnboardingState(db, A), "One-pan meals")).toMatchObject({ status: "dismissed", dismissedFromStatus: "suggested" });
    const [r1, r2] = await Promise.all([
      restorePillarSubtopic(poolDb, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id }),
      restorePillarSubtopic(poolDb, { workspaceId: WS_A, socialProfileId: profileId, subtopicId: one.id }),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    expect(labelOf(await loadOnboardingState(db, A), "One-pan meals")).toMatchObject({ status: "suggested", dismissedFromStatus: null });
  });

  it("audience may have an empty outcome from the single-field editor", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId: audienceId } = await addItem(db, A, "audience", { who: "Students", outcome: "" });
    const state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === audienceId)?.payload).toMatchObject({ who: "Students", outcome: "" });
  });

  it("undo refuses values that the system superseded (regenerated suggestions never come back)", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId: goalId } = await addItem(db, A, "goal", { text: "Grow fast" });
    // Simulate the analysis store superseding an unconfirmed row without a user removal.
    await q("UPDATE personalization_items SET status = 'suggested' WHERE id = ?", [goalId]);
    await q("UPDATE personalization_items SET status = 'superseded' WHERE id = ?", [goalId]);
    await expect(restoreItem(db, A, goalId)).rejects.toThrow(/changed|cannot be restored/);
  });

  it("undo of a removed suggestion returns it only while the answers it was built on are current", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const store = createRecommendationStore(db);
    const invoker = fakeInvoker({
      personalization_goal_inference: GOAL_OUT,
      personalization_audience_recommendations: AUDIENCE_OUT,
    });
    await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "goal" });
    const state = await loadOnboardingState(db, A);
    const suggestion = state.items.find(i => i.kind === "goal" && i.status === "suggested")!;
    await removeItem(db, A, suggestion.id);
    await restoreItem(db, A, suggestion.id);
    const after = await loadOnboardingState(db, A);
    expect(after.items.find(i => i.id === suggestion.id)).toMatchObject({ status: "suggested" });
  });

  it("existing customer data: an audience edited from the single field keeps its stored outcome", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId: a1 } = await addItem(db, A, "audience", { who: "Restaurant owners", outcome: "cut food cost" });
    const { itemId: a2 } = await editItem(db, A, a1, { who: "Restaurant owners in Texas", outcome: "cut food cost" } as never);
    const state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === a2)?.payload).toEqual({
      who: "Restaurant owners in Texas",
      outcome: "cut food cost",
    });
  });

  it("workspace isolation: another workspace cannot read, edit or remove these values", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "goal", { text: "Grow my cooking channel." });
    expect((await loadOnboardingState(db, B)).profile).toBeNull();
    await expect(editItem(db, B, itemId, { text: "hijack" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeItem(db, B, itemId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === itemId)).toMatchObject({ status: "confirmed" });
  });

  it("AI failure never blocks completion: unresolved steps become skipped and the legacy gate flag is set", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    await saveUseCase(db, A, "analyze_creators");
    await saveAttribution(db, A, "friend");
    await addItem(db, A, "goal", { text: "Grow my cooking channel." });
    await resolveStep(db, A, "goal", "confirm");
    const done = await completeOnboarding(db, A);
    expect(done.completed).toBe(true);
    const state = await loadOnboardingState(db, A);
    expect(state.resumeStep).toBe("done");
    expect(state.steps).toEqual({ goal: "confirmed", audience: "skipped", pillars: "skipped" });
    const [u] = await q("SELECT onboardingCompletedAt FROM users WHERE id = 1");
    expect((u as Array<{ onboardingCompletedAt: Date | null }>)[0].onboardingCompletedAt).not.toBeNull();
  });

  it("I don't post yet: no handle, niche saved as the user's value, no analysis", async () => {
    await startNotPostingYet(db, A, { slug: "fitness", label: "Fitness" });
    let state = await loadOnboardingState(db, A);
    expect(state.profile).toMatchObject({ status: "not_posting_yet", handle: null, platform: null });
    expect(state.analysis).toBeNull();
    expect(state.items.find(i => i.kind === "niche")).toMatchObject({ payload: { slug: "fitness" }, status: "confirmed" });
    // Changing the niche edits (supersedes), it does not duplicate.
    await startNotPostingYet(db, A, { slug: "food", label: "Food" });
    state = await loadOnboardingState(db, A);
    expect(state.items.filter(i => i.kind === "niche")).toHaveLength(1);
    expect(state.items.find(i => i.kind === "niche")!.payload).toMatchObject({ slug: "food" });
    expect(state.resumeStep).toBe("use_case");
  });

  it("profiles: a second profile can be added and switched; another workspace cannot switch to it", async () => {
    const first = await confirmProfile(db, A, preview("test.kitchen"));
    const second = await confirmProfile(db, A, { ...preview("test.kitchen.tt"), platform: "tiktok" });
    let list = await listWorkspaceProfiles(db, A);
    expect(list.map(p => [p.platform, p.active])).toEqual([
      ["instagram", false],
      ["tiktok", true],
    ]);
    await switchActiveProfile(db, A, first.profileId);
    list = await listWorkspaceProfiles(db, A);
    expect(list.find(p => p.active)?.id).toBe(first.profileId);
    expect(await listWorkspaceProfiles(db, B)).toEqual([]);
    await expect(switchActiveProfile(db, B, second.profileId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Each profile keeps its own strategy: the switched-to profile starts its own steps.
    expect((await loadOnboardingState(db, A)).profile?.handle).toBe("test.kitchen");
  });

  it("Home context: only confirmed values personalize Home; Finish setup points at the first open step", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    let ctx = homeContextFromState(await loadOnboardingState(db, A));
    expect(ctx).toMatchObject({ nicheLabel: null, personalizationComplete: false, nextStep: "goal" });
    await addItem(db, A, "niche", { slug: "restaurants", label: "Restaurant business" });
    await addItem(db, A, "goal", { text: "Help restaurant owners run better kitchens." });
    await resolveStep(db, A, "goal", "confirm");
    ctx = homeContextFromState(await loadOnboardingState(db, A));
    expect(ctx).toMatchObject({
      nicheLabel: "Restaurant business",
      featuredNicheSlug: "restaurants-cafes",
      personalizationComplete: false,
      nextStep: "audience",
    });
  });
});
