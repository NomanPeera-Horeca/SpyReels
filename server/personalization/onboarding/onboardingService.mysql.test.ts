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
  resolveStep,
  saveAttribution,
  saveUseCase,
  startNotPostingYet,
} from "./onboardingService";

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
    expect((await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "goal" })).status).toBe("already_confirmed");

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
});
