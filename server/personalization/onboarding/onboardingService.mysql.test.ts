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
import { upstreamInputsHash } from "@shared/personalization/state";
import {
  addItem,
  completeOnboarding,
  confirmProfile,
  editItem,
  loadOnboardingState,
  removeItem,
  resolveStep,
  restorePersonalizationItem,
  saveAttribution,
  saveUseCase,
  listWorkspaceProfiles,
  startNotPostingYet,
  switchActiveProfile,
} from "./onboardingService";
import { homeContextFromState, videoMatchText } from "../home/homeService";
import {
  addPillarSubtopic,
  dismissPillarSubtopic,
  restorePillarSubtopic,
  saveGeneratedSubtopics,
} from "../subtopics";

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

    // The engine never writes a second goal for the same answers.
    const again = await generateRecommendations({ store, invoker }, { ctx: authCtx(A), socialProfileId: profileId, step: "goal" });
    expect(["reused", "already_confirmed"]).toContain(again.status);
    expect((await loadOnboardingState(db, A)).items.filter(i => i.kind === "goal")).toEqual([
      expect.objectContaining({ id: suggestedGoal.id, status: "confirmed" }),
    ]);

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

    // Same inputs hash, older version: the version alone rejects the write.
    const currentHash = upstreamInputsHash("audience", await store.loadItems(profileId));
    const [beforeRows] = await q("SELECT COUNT(*) AS n FROM personalization_items WHERE socialProfileId = ? AND kind = 'audience'", [profileId]);
    const before = Number((beforeRows as Array<{ n: number }>)[0].n);
    expect(await store.applyGeneratedSuggestions(profileId, {
      kind: "audience",
      guard: { type: "inputs_unchanged", expected: currentHash },
      expectedVersion: 1,
      supersedeIds: [],
      inserts: [],
    })).toBe("stale");
    expect(await store.applyGeneratedSuggestions(profileId, {
      kind: "audience",
      guard: { type: "inputs_unchanged", expected: currentHash },
      expectedVersion: state.version,
      supersedeIds: [],
      inserts: [],
    })).toBe("applied");
    const [afterRows] = await q("SELECT COUNT(*) AS n FROM personalization_items WHERE socialProfileId = ? AND kind = 'audience'", [profileId]);
    expect(Number((afterRows as Array<{ n: number }>)[0].n)).toBe(before);
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

  it("profiles: a second profile can be added and switched; another workspace cannot switch to it", async () => {
    const first = await confirmProfile(db, A, preview("test.kitchen"));
    const second = await confirmProfile(db, A, { ...preview("test.kitchen.tt"), platform: "tiktok" });
    let list = await listWorkspaceProfiles(db, A);
    // createdAt is second precision, so two profiles saved together have no stable order.
    expect(list.map(p => [p.platform, p.active]).sort()).toEqual([
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
    await addItem(db, A, "goal", { text: "Help fitness coaches sign clients." });
    await resolveStep(db, A, "goal", "confirm");
    ctx = homeContextFromState(await loadOnboardingState(db, A));
    expect(ctx).toMatchObject({
      nicheLabel: "Restaurant business",
      featuredNicheSlug: "restaurants-cafes",
      personalizationComplete: false,
      nextStep: "audience",
    });
    expect(ctx.description).toContain("fitness");
    expect(ctx.goalText).toContain("fitness");
    expect(ctx.pillarTitles).toEqual([]);
    expect(videoMatchText(ctx)).toBe("Restaurant business");
    expect(ctx.nicheLabel).not.toContain("fitness");
  });

  it("pillar edits keep subtopic ids and dismissal, and Undo does not resurrect them", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "pillar", {
      title: "Menu engineering",
      description: "How to price plates",
      viewSharePercent: null,
    });
    expect(await saveGeneratedSubtopics(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      groups: [{
        title: "Menu engineering",
        labels: ["Food cost", "Menu pricing", "Weekly specials"],
        pillarHash: "pillar-hash",
      }],
    })).toBe(3);
    let state = await loadOnboardingState(db, A);
    const topics = state.pillarSubtopics.filter(t => t.pillarItemId === itemId);
    expect(topics.map(t => t.label).sort()).toEqual(["Food cost", "Menu pricing", "Weekly specials"]);
    const food = topics.find(t => t.label === "Food cost")!;
    const pricing = topics.find(t => t.label === "Menu pricing")!;
    expect((await dismissPillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      subtopicId: food.id,
    })).ok).toBe(true);

    // Same title, new description: topics move with their ids and statuses.
    const renamed = await editItem(db, A, itemId, {
      title: "Menu engineering",
      description: "How to price plates",
      viewSharePercent: null,
    });
    const described = await editItem(db, A, renamed.itemId, {
      title: "Menu engineering",
      description: "What to charge for each plate",
      viewSharePercent: null,
    });
    state = await loadOnboardingState(db, A);
    const moved = state.pillarSubtopics.filter(t => t.pillarItemId === described.itemId);
    expect(moved.map(t => t.id).sort()).toEqual(topics.map(t => t.id).sort());
    expect(moved.find(t => t.id === food.id)?.status).toBe("dismissed");
    expect(moved.find(t => t.id === pricing.id)?.status).toBe("suggested");
    expect(state.pillarSubtopics.filter(t => t.pillarItemId === itemId)).toEqual([]);
    expect(await saveGeneratedSubtopics(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      groups: [{ title: "Menu engineering", labels: ["Food cost", "Menu pricing"], pillarHash: "retry" }],
    })).toBe(0);
    expect((await addPillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      pillarItemId: described.itemId,
      label: "Food cost",
    })).ok).toBe(false);

    await removeItem(db, A, described.itemId);
    state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === described.itemId)).toBeUndefined();
    const parked = state.pillarSubtopics.filter(t => t.pillarItemId === described.itemId);
    expect(parked.find(t => t.id === food.id)?.status).toBe("dismissed");
    expect(parked.find(t => t.id === pricing.id)?.status).toBe("suggested");

    await restorePersonalizationItem(db, A, described.itemId);
    state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === described.itemId)).toMatchObject({
      status: "confirmed",
      kind: "pillar",
    });
    const restored = state.pillarSubtopics.filter(t => t.pillarItemId === described.itemId);
    expect(restored.find(t => t.id === food.id)?.status).toBe("dismissed");
    expect(restored.find(t => t.id === pricing.id)?.status).toBe("suggested");

    expect((await restorePillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      subtopicId: food.id,
    })).ok).toBe(true);
    state = await loadOnboardingState(db, A);
    const afterOne = state.pillarSubtopics.filter(t => t.pillarItemId === described.itemId);
    expect(afterOne.find(t => t.id === food.id)?.status).toBe("suggested");
    const specials = afterOne.find(t => t.label === "Weekly specials")!;
    await dismissPillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      subtopicId: specials.id,
    });
    expect((await restorePillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      subtopicId: food.id,
    })).ok).toBe(true);
    state = await loadOnboardingState(db, A);
    const finalTopics = state.pillarSubtopics.filter(t => t.pillarItemId === described.itemId);
    expect(finalTopics.find(t => t.id === specials.id)?.status).toBe("dismissed");
    expect(finalTopics.find(t => t.id === food.id)?.status).toBe("suggested");
  });

  it("a changed pillar title keeps old topics as history, lets the new title generate, and keeps dismissals for the old title", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "pillar", {
      title: "Menu engineering",
      description: "Costs",
      viewSharePercent: null,
    });
    const save = (title: string, labels: string[], pillarHash: string) =>
      saveGeneratedSubtopics(db, {
        workspaceId: WS_A,
        socialProfileId: profileId,
        groups: [{ title, labels, pillarHash }],
      });
    expect(await save("Menu engineering", ["Food cost", "Menu pricing"], "h1")).toBe(2);
    let state = await loadOnboardingState(db, A);
    const oldTopics = state.pillarSubtopics.filter(t => t.pillarItemId === itemId);
    const food = oldTopics.find(t => t.label === "Food cost")!;
    expect((await dismissPillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      subtopicId: food.id,
    })).ok).toBe(true);

    const renamed = await editItem(db, A, itemId, {
      title: "Plate pricing",
      description: "Costs",
      viewSharePercent: null,
    });
    state = await loadOnboardingState(db, A);
    expect(state.pillarSubtopics.filter(t => t.pillarItemId === renamed.itemId)).toEqual([]);
    const history = state.pillarSubtopics.filter(t => t.pillarItemId === itemId);
    expect(history.map(t => t.id).sort()).toEqual(oldTopics.map(t => t.id).sort());
    expect(history.find(t => t.id === food.id)?.status).toBe("dismissed");

    // The dismissal was for the old title only, so the new title may generate its own topics.
    expect(await save("Plate pricing", ["Food cost", "Plate sizes"], "h2")).toBe(2);

    // Renaming back: the dismissed label stays blocked under the old title.
    const back = await editItem(db, A, renamed.itemId, {
      title: "Menu engineering",
      description: "Costs",
      viewSharePercent: null,
    });
    expect(await save("Menu engineering", ["Food cost"], "h3")).toBe(0);
    state = await loadOnboardingState(db, A);
    expect(state.pillarSubtopics.filter(t => t.pillarItemId === back.itemId)).toEqual([]);
  });

  it("subtopic writes are isolated by workspace and collapse concurrent duplicates", async () => {
    const { profileId } = await confirmProfile(db, A, preview("test.kitchen"));
    await confirmProfile(db, B, preview("other.kitchen"));
    const { itemId } = await addItem(db, A, "pillar", {
      title: "Menu engineering",
      description: "How to price plates",
      viewSharePercent: null,
    });
    const added = await addPillarSubtopic(db, {
      workspaceId: WS_A,
      socialProfileId: profileId,
      pillarItemId: itemId,
      label: "Food cost",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const bState = await loadOnboardingState(db, B);
    expect(bState.pillarSubtopics).toEqual([]);
    expect(await dismissPillarSubtopic(db, {
      workspaceId: WS_B,
      socialProfileId: bState.profile!.id,
      subtopicId: added.id,
    })).toEqual({ ok: false, reason: "not_found" });
    expect(await restorePillarSubtopic(db, {
      workspaceId: WS_B,
      socialProfileId: bState.profile!.id,
      subtopicId: added.id,
    })).toEqual({ ok: false, reason: "not_found" });
    await expect(restorePersonalizationItem(db, B, itemId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const still = (await loadOnboardingState(db, A)).pillarSubtopics.find(t => t.id === added.id);
    expect(still?.status).toBe("confirmed");

    const u = new URL(url!);
    const dbName = `${u.pathname.replace(/^\//, "")}_svc`;
    const conn2 = await mysql.createConnection({
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: dbName,
    });
    const db2 = drizzle(conn2) as unknown as Db;
    try {
      const input = {
        workspaceId: WS_A,
        socialProfileId: profileId,
        groups: [{ title: "Menu engineering", labels: ["Menu pricing", "Weekly specials"], pillarHash: "race" }],
      };
      await Promise.all([
        saveGeneratedSubtopics(db, input),
        saveGeneratedSubtopics(db2, input),
      ]);
    } finally {
      await conn2.end();
    }
    const labels = (await loadOnboardingState(db, A)).pillarSubtopics
      .filter(t => t.pillarItemId === itemId)
      .map(t => t.label)
      .sort();
    expect(labels).toEqual(["Food cost", "Menu pricing", "Weekly specials"]);
  });

  it("a pillar edit still saves when the subtopic table is absent", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "pillar", {
      title: "Menu engineering",
      description: "How to price plates",
      viewSharePercent: null,
    });
    await q("DROP TABLE pillar_subtopics");
    try {
      const edited = await editItem(db, A, itemId, {
        title: "Plate pricing",
        description: "How to price plates",
        viewSharePercent: null,
      });
      const state = await loadOnboardingState(db, A);
      expect(state.items.find(i => i.id === edited.itemId)).toMatchObject({ status: "confirmed" });
      expect(state.pillarSubtopics).toEqual([]);
    } finally {
      await q(readFileSync(path.join(root, "drizzle/0104_pillar_subtopics.sql"), "utf8"));
    }
  });

  it("does not restore a superseded row that the user did not delete", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId } = await addItem(db, A, "audience", { who: "Owners", outcome: "save time" });
    await q(
      "UPDATE personalization_items SET status = 'superseded', dismissedFromStatus = NULL WHERE id = ?",
      [itemId]
    );
    await expect(restorePersonalizationItem(db, A, itemId)).rejects.toMatchObject({ code: "CONFLICT" });
    const [rows] = await q("SELECT status FROM personalization_items WHERE id = ?", [itemId]);
    expect((rows as Array<{ status: string }>)[0].status).toBe("superseded");
  });

  it("audience may have an empty outcome from the single-field editor", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId: audienceId } = await addItem(db, A, "audience", { who: "Students", outcome: "" });
    const state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === audienceId)?.payload).toMatchObject({ who: "Students", outcome: "" });
  });

  it("an audience edited from the single field keeps its stored outcome", async () => {
    await confirmProfile(db, A, preview("test.kitchen"));
    const { itemId: a1 } = await addItem(db, A, "audience", { who: "Restaurant owners", outcome: "cut food cost" });
    const { itemId: a2 } = await editItem(db, A, a1, { who: "Restaurant owners in Texas", outcome: "cut food cost" });
    const state = await loadOnboardingState(db, A);
    expect(state.items.find(i => i.id === a2)?.payload).toEqual({
      who: "Restaurant owners in Texas",
      outcome: "cut food cost",
    });
  });
});
