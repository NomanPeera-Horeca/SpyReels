import { describe, expect, it } from "vitest";
import type {
  AnalysisSourceSnapshot,
  AnalysisStage,
  AnalysisStageStatus,
} from "@shared/personalization/model";
import {
  resolveAnalysisAvailability,
  type AiSuggestion,
  type ItemRecord,
} from "@shared/personalization/state";
import type { PersonalizationCtx } from "../authorization";
import {
  DuplicateRunError,
  ProviderError,
  type AiSuggestionInsert,
  type AnalysisProfile,
  type AnalysisRun,
  type AnalysisStore,
  type DurableEnqueue,
  type ProfileAnalysisPayload,
  type ProfileDataSource,
  type SuggestionEngine,
} from "./contract";
import {
  classifyProviderError,
  createExistingProviderSource,
} from "./existingProviderSource";
import { requestProfileAnalysis } from "./requestProfileAnalysis";
import { runProfileAnalysis } from "./runProfileAnalysis";

/* ------------------------------------------------------------------ */
/* Test doubles that enforce the same rules as the real system         */
/* ------------------------------------------------------------------ */

const WS = "aaaaaaaa-0000-4000-8000-00000000000a";
const OTHER_WS = "bbbbbbbb-0000-4000-8000-00000000000b";

class MemoryStore implements AnalysisStore {
  profiles = new Map<string, AnalysisProfile>();
  runs = new Map<string, AnalysisRun>();
  items: Array<ItemRecord & { socialProfileId: string }> = [];
  version = new Map<string, number>();

  async loadProfile(id: string, ws: string) {
    const p = this.profiles.get(id);
    return p && p.workspaceId === ws ? { ...p } : null;
  }
  async loadRun(id: string, ws: string) {
    const r = this.runs.get(id);
    return r && r.workspaceId === ws ? structuredClone(r) : null;
  }
  async findRunByKey(key: string) {
    return [...this.runs.values()].find(r => r.idempotencyKey === key) ?? null;
  }
  async listRunSummaries(profile: AnalysisProfile) {
    return [...this.runs.values()]
      .filter(r => r.socialProfileId === profile.id)
      .map(r => ({
        id: r.id,
        idempotencyKey: r.idempotencyKey,
        requestKind: r.requestKind,
        status: r.status,
        sameAccountIdentity: true,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }));
  }
  async insertRun(run: Parameters<AnalysisStore["insertRun"]>[0]) {
    // Same two UNIQUE keys as the SQL draft.
    if (
      [...this.runs.values()].some(r => r.idempotencyKey === run.idempotencyKey)
    )
      throw new DuplicateRunError("idempotency_key");
    if (
      [...this.runs.values()].some(
        r =>
          r.socialProfileId === run.socialProfileId &&
          (r.status === "queued" || r.status === "running")
      )
    ) {
      throw new DuplicateRunError("active_slot");
    }
    this.runs.set(run.id, {
      ...run,
      stages: {},
      snapshot: null,
      postsInWindow: null,
      providerCallCount: null,
      errorCode: null,
      completedAt: null,
    });
  }
  async requeueFailedRun(id: string) {
    const r = this.runs.get(id)!;
    if (r.status !== "failed") return;
    r.status = "queued";
    r.errorCode = null;
    r.completedAt = null;
    for (const [stage, status] of Object.entries(r.stages)) {
      if (status === "failed" || status === "skipped")
        r.stages[stage as AnalysisStage] = "waiting";
    }
  }
  async markRunRunning(id: string) {
    this.runs.get(id)!.status = "running";
  }
  async setStage(
    id: string,
    stage: AnalysisStage,
    status: AnalysisStageStatus
  ) {
    this.runs.get(id)!.stages[stage] = status;
  }
  async saveSnapshot(
    id: string,
    snapshot: AnalysisSourceSnapshot,
    calls: number | null
  ) {
    const r = this.runs.get(id)!;
    r.snapshot = structuredClone(snapshot);
    r.postsInWindow = snapshot.posts.length;
    r.providerCallCount = calls;
  }
  async finishRun(
    id: string,
    status: AnalysisRun["status"],
    errorCode: string | null,
    at: Date
  ) {
    Object.assign(this.runs.get(id)!, { status, errorCode, completedAt: at });
  }
  async setProfileStatus(id: string, status: AnalysisProfile["status"]) {
    this.profiles.get(id)!.status = status;
  }
  async loadItems(profileId: string) {
    return this.items
      .filter(i => i.socialProfileId === profileId)
      .map(i => ({ ...i }));
  }
  async loadPersonalizationVersion(profileId: string) {
    return this.version.get(profileId) ?? 1;
  }
  async applySuggestions(
    profileId: string,
    supersede: string[],
    inserts: AiSuggestionInsert[]
  ) {
    for (const i of this.items)
      if (supersede.includes(i.id) && i.socialProfileId === profileId)
        i.status = "superseded";
    for (const n of inserts)
      this.items.push({
        ...n,
        id: `s${this.items.length + 1}`,
        socialProfileId: profileId,
      });
  }
}

/** Mirrors server/durableJobs/queue.ts enqueueDurableJob, including requeueIfTerminal. */
class MemoryQueue {
  jobs = new Map<
    string,
    {
      payload: ProfileAnalysisPayload;
      status: string;
      attempt: number;
      maxAttempts: number;
    }
  >();
  enqueue: DurableEnqueue = async ({
    idempotencyKey,
    payload,
    maxAttempts,
    requeueIfTerminal,
  }) => {
    const existing = this.jobs.get(idempotencyKey);
    if (!existing)
      this.jobs.set(idempotencyKey, {
        payload,
        status: "queued",
        attempt: 0,
        maxAttempts,
      });
    else if (existing.status === "failed" || existing.status === "dead")
      Object.assign(existing, { status: "queued", attempt: 0 });
    else if (requeueIfTerminal && existing.status === "succeeded")
      Object.assign(existing, { status: "queued", attempt: 0, payload });
    return this.jobs.size;
  };
  /** Claims and runs every runnable job until the queue is idle (worker loop). */
  async drain(
    handler: (
      payload: ProfileAnalysisPayload,
      attempt: number,
      max: number
    ) => Promise<unknown>
  ) {
    for (let guard = 0; guard < 50; guard++) {
      const next = [...this.jobs.values()].find(
        j => j.status === "queued" && j.attempt < j.maxAttempts
      );
      if (!next) return;
      next.status = "running";
      next.attempt++;
      try {
        await handler(next.payload, next.attempt, next.maxAttempts);
        next.status = "succeeded";
      } catch {
        next.status = next.attempt >= next.maxAttempts ? "dead" : "queued";
      }
    }
  }
}

class FakeProvider implements ProfileDataSource {
  calls = 0;
  failures: ProviderError[] = [];
  posts = 12;
  async fetchPosts({
    platform,
    handle,
    windowStart,
    windowEnd,
  }: Parameters<ProfileDataSource["fetchPosts"]>[0]) {
    this.calls++;
    const f = this.failures.shift();
    if (f) throw f;
    return {
      snapshot: {
        version: 1 as const,
        platform,
        handle,
        followerCount: 1200,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        posts: Array.from({ length: this.posts }, (_, i) => ({
          postId: `p${i}`,
          url: null,
          publishedAt: windowEnd.toISOString(),
          views: 1000 + i,
          likes: 10,
          comments: 1,
          durationSec: 20,
          caption: `post ${i}`,
        })),
      },
      providerCalls: null,
    };
  }
}

function setup(over: Partial<AnalysisProfile> = {}) {
  const store = new MemoryStore();
  const queue = new MemoryQueue();
  const provider = new FakeProvider();
  let clock = new Date("2026-10-16T12:00:00Z");
  let ids = 0;
  let usageRecorded = 0;
  let usageAllowed = true;
  store.profiles.set("prof-1", {
    id: "prof-1",
    workspaceId: WS,
    platform: "instagram",
    normalizedHandle: "noman_peera",
    platformAccountId: "123",
    status: "confirmed",
    deletedAt: null,
    ...over,
  });
  const ctx: PersonalizationCtx = {
    user: { id: 1 },
    workspaceId: WS,
    workspaceRole: "member",
  };
  const engine: { current: SuggestionEngine | null } = { current: null };
  const request = (
    requestKind: "initial" | "user_refresh" | "background",
    c = ctx
  ) =>
    requestProfileAnalysis(
      {
        store,
        enqueue: queue.enqueue,
        newId: () => `run-${++ids}`,
        now: () => clock,
        checkUsage: async () => usageAllowed,
        recordUsage: async () => {
          usageRecorded++;
        },
      },
      { ctx: c, socialProfileId: "prof-1", requestKind }
    );
  const work = () =>
    queue.drain((payload, attempt, maxAttempts) =>
      runProfileAnalysis(
        { payload, attempt, maxAttempts },
        {
          store,
          source: provider,
          suggestions: engine.current,
          now: () => clock,
        }
      )
    );
  return {
    store,
    queue,
    provider,
    ctx,
    engine,
    request,
    work,
    advance: (minutes: number) =>
      (clock = new Date(clock.getTime() + minutes * 60_000)),
    usage: () => usageRecorded,
    setUsageAllowed: (v: boolean) => (usageAllowed = v),
  };
}

const confirmedItems = (): Array<ItemRecord & { socialProfileId: string }> => [
  {
    id: "c-goal",
    socialProfileId: "prof-1",
    kind: "goal",
    payload: { text: "Sell more ovens" },
    source: "user_entered",
    status: "confirmed",
    evidence: "user_provided",
    analysisRunId: null,
    basedOnVersion: 1,
    dismissedAtVersion: null,
    supersedesItemId: null,
  },
  {
    id: "c-aud",
    socialProfileId: "prof-1",
    kind: "audience",
    payload: { who: "Owners", outcome: "save" },
    source: "user_entered",
    status: "confirmed",
    evidence: "user_provided",
    analysisRunId: null,
    basedOnVersion: 1,
    dismissedAtVersion: null,
    supersedesItemId: null,
  },
  {
    id: "c-pil",
    socialProfileId: "prof-1",
    kind: "pillar",
    payload: { title: "Tours", description: "", viewSharePercent: null },
    source: "user_entered",
    status: "confirmed",
    evidence: "user_provided",
    analysisRunId: null,
    basedOnVersion: 1,
    dismissedAtVersion: null,
    supersedesItemId: null,
  },
];
const confirmedSnapshot = (store: MemoryStore) =>
  JSON.stringify(
    store.items
      .filter(i => i.status === "confirmed")
      .map(i => [i.id, i.kind, i.payload])
  );

/* ------------------------------------------------------------------ */

describe("initial analysis: idempotent, no duplicate provider work", () => {
  it("one run, one job, one provider fetch; lifecycle queued -> running -> succeeded", async () => {
    const t = setup();
    expect(await t.request("initial")).toEqual({
      status: "started",
      runId: "run-1",
    });
    expect(t.store.runs.get("run-1")!.status).toBe("queued");
    await t.work();
    const run = t.store.runs.get("run-1")!;
    expect(run.status).toBe("succeeded");
    expect(run.stages).toEqual({
      published_content: "done",
      strongest_performers: "done",
      hooks_and_topics: "skipped",
      niche_opportunities: "skipped",
    });
    expect(run.postsInWindow).toBe(12);
    expect(t.provider.calls).toBe(1);
  });

  it("double tap / reload while queued reuses the run and the job", async () => {
    const t = setup();
    await t.request("initial");
    expect(await t.request("initial")).toEqual({
      status: "reused",
      runId: "run-1",
    });
    expect(await t.request("initial")).toEqual({
      status: "reused",
      runId: "run-1",
    });
    expect(t.store.runs.size).toBe(1);
    expect(t.queue.jobs.size).toBe(1);
    await t.work();
    expect(t.provider.calls).toBe(1);
  });

  it("'That's me' again after success reuses the finished run: zero new provider calls", async () => {
    const t = setup();
    await t.request("initial");
    await t.work();
    expect(await t.request("initial")).toEqual({
      status: "reused",
      runId: "run-1",
    });
    await t.work();
    expect(t.provider.calls).toBe(1);
  });

  it("two simultaneous creates: the unique keys let exactly one through", async () => {
    const t = setup();
    const [a, b] = await Promise.all([
      t.request("initial"),
      t.request("initial"),
    ]);
    expect([a.status, b.status].sort()).toEqual(["reused", "started"]);
    expect(t.store.runs.size).toBe(1);
  });

  it("a lost enqueue (crash after insert) self-heals on the next request", async () => {
    const t = setup();
    await t.request("initial");
    t.queue.jobs.clear(); // simulate the enqueue never landing
    expect(await t.request("initial")).toEqual({
      status: "reused",
      runId: "run-1",
    });
    expect(t.queue.jobs.size).toBe(1);
    await t.work();
    expect(t.store.runs.get("run-1")!.status).toBe("succeeded");
  });
});

describe("retries and recovery", () => {
  it("a transient provider error is retried by the durable queue on the SAME run", async () => {
    const t = setup();
    t.provider.failures.push(new ProviderError("transient", "timeout"));
    await t.request("initial");
    await t.work();
    expect(t.store.runs.size).toBe(1);
    expect(t.store.runs.get("run-1")!.status).toBe("succeeded");
    // Cost risk made visible: a retry during fetch DOES call the provider again.
    expect(t.provider.calls).toBe(2);
  });

  it("on the last attempt the run is marked failed (never stuck 'running'), and is recoverable", async () => {
    const t = setup();
    t.provider.failures.push(
      ...Array.from(
        { length: 3 },
        () => new ProviderError("rate_limited", "429")
      )
    );
    await t.request("initial");
    await t.work();
    const run = t.store.runs.get("run-1")!;
    expect(run.status).toBe("failed");
    expect(run.errorCode).toBe("provider_unavailable");
    expect(t.provider.calls).toBe(3);

    // User taps again: same run, same key, requeued in place.
    expect(await t.request("initial")).toEqual({
      status: "retrying",
      runId: "run-1",
    });
    await t.work();
    expect(t.store.runs.size).toBe(1);
    expect(t.store.runs.get("run-1")!.status).toBe("succeeded");
  });

  it("a worker crash AFTER the fetch (lease expires, job reclaimed) does not pay the provider again", async () => {
    const t = setup();
    await t.request("initial");
    const store = t.store;
    const original = store.setStage.bind(store);
    let crashed = false;
    store.setStage = async (id, stage, status) => {
      if (!crashed && stage === "published_content" && status === "done") {
        crashed = true;
        throw new Error("process killed");
      }
      return original(id, stage, status);
    };
    await t.work();
    expect(t.store.runs.get("run-1")!.status).toBe("succeeded");
    expect(t.provider.calls).toBe(1);
  });

  it("an analysis run that failed earlier keeps its snapshot so a later retry resumes without fetching", async () => {
    const t = setup();
    t.engine.current = {
      suggest: async () => Promise.reject(new Error("llm down")),
    };
    await t.request("initial");
    await t.work();
    expect(t.store.runs.get("run-1")!.status).toBe("partial");
    expect(t.store.runs.get("run-1")!.snapshot?.posts).toHaveLength(12);
    expect(t.provider.calls).toBe(1);
  });
});

describe("accounts that cannot be analyzed still complete personalization", () => {
  it("private account found during fetch: run failed, profile marked private, no retry storm", async () => {
    const t = setup();
    t.store.items.push(...confirmedItems());
    const before = confirmedSnapshot(t.store);
    t.provider.failures.push(
      new ProviderError("private", "The account is private")
    );
    await t.request("initial");
    await t.work();
    const run = t.store.runs.get("run-1")!;
    expect(run).toMatchObject({
      status: "failed",
      errorCode: "private_account",
    });
    expect(t.provider.calls).toBe(1);
    expect(t.store.profiles.get("prof-1")!.status).toBe("private");
    expect(confirmedSnapshot(t.store)).toBe(before);
    expect(
      resolveAnalysisAvailability({
        profileStatus: "private",
        latestRunStatus: "failed",
        postsInWindow: null,
      })
    ).toBe("private_account");
  });

  for (const status of ["private", "not_posting_yet", "unlinked"] as const) {
    it(`${status}: request is rejected before any job or provider call`, async () => {
      const t = setup({
        status,
        ...(status === "private"
          ? {}
          : { platform: null, normalizedHandle: null }),
      });
      expect(await t.request("initial")).toEqual({
        status: "rejected",
        reason: "not_analyzable",
        retryAfter: undefined,
      });
      expect(t.queue.jobs.size).toBe(0);
      expect(t.provider.calls).toBe(0);
    });
  }

  it("zero public posts: succeeded, later stages skipped, nothing invented", async () => {
    const t = setup();
    t.provider.posts = 0;
    t.engine.current = {
      suggest: async () => {
        throw new Error("must not be called");
      },
    };
    await t.request("initial");
    await t.work();
    const run = t.store.runs.get("run-1")!;
    expect(run.status).toBe("succeeded");
    expect(run.stages).toEqual({
      published_content: "done",
      strongest_performers: "skipped",
      hooks_and_topics: "skipped",
      niche_opportunities: "skipped",
    });
    expect(t.store.items).toEqual([]);
    expect(
      resolveAnalysisAvailability({
        profileStatus: "confirmed",
        latestRunStatus: "succeeded",
        postsInWindow: 0,
      })
    ).toBe("no_public_posts");
  });

  it("few posts (3): real numbers for those posts, no threshold", async () => {
    const t = setup();
    t.provider.posts = 3;
    await t.request("initial");
    await t.work();
    expect(t.store.runs.get("run-1")!).toMatchObject({
      status: "succeeded",
      postsInWindow: 3,
    });
  });
});

describe("suggestions never overwrite confirmed values and never invent numbers", () => {
  it("confirmed goal / audience / pillar survive analysis with suggestions", async () => {
    const t = setup();
    t.store.items.push(...confirmedItems());
    const before = confirmedSnapshot(t.store);
    t.engine.current = {
      suggest: async (): Promise<AiSuggestion[]> => [
        {
          kind: "goal",
          payload: { text: "AI goal" },
          evidence: "profile_inferred",
          analysisRunId: null,
        },
        {
          kind: "pillar",
          payload: {
            title: "Kitchen builds",
            description: "",
            viewSharePercent: 41,
          },
          evidence: "performance_backed",
          analysisRunId: null,
        },
        {
          kind: "pillar",
          payload: { title: "Invented", description: "", viewSharePercent: 77 },
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ],
    };
    await t.request("initial");
    await t.work();
    expect(t.store.runs.get("run-1")!.status).toBe("succeeded");
    expect(confirmedSnapshot(t.store)).toBe(before);
    const added = t.store.items.filter(i => i.source === "ai_suggested");
    expect(added.map(i => [i.kind, i.evidence, i.analysisRunId])).toEqual([
      ["pillar", "performance_backed", "run-1"],
    ]);
  });

  it("a later refresh supersedes old unconfirmed AI suggestions but keeps confirmed ones", async () => {
    const t = setup();
    t.store.items.push(...confirmedItems());
    let round = 0;
    t.engine.current = {
      suggest: async () => [
        {
          kind: "pillar",
          payload: {
            title: `Idea round ${++round}`,
            description: "",
            viewSharePercent: null,
          },
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ],
    };
    await t.request("initial");
    await t.work();
    t.advance(61);
    expect(await t.request("user_refresh")).toEqual({
      status: "started",
      runId: "run-2",
    });
    await t.work();
    const ai = t.store.items.filter(i => i.source === "ai_suggested");
    expect(
      ai.map(i => [(i.payload as { title: string }).title, i.status])
    ).toEqual([
      ["Idea round 1", "superseded"],
      ["Idea round 2", "suggested"],
    ]);
    expect(t.store.items.find(i => i.id === "c-pil")!.status).toBe("confirmed");
    expect(t.store.runs.size).toBe(2); // history kept
  });
});

describe("user refresh and background refresh", () => {
  it("cooldown: refused at 10 minutes, allowed after 60, usage recorded once per created run", async () => {
    const t = setup();
    await t.request("initial");
    await t.work();
    t.advance(10);
    expect(await t.request("user_refresh")).toMatchObject({
      status: "rejected",
      reason: "cooldown",
    });
    t.advance(51);
    expect(await t.request("user_refresh")).toEqual({
      status: "started",
      runId: "run-2",
    });
    expect(await t.request("user_refresh")).toEqual({
      status: "reused",
      runId: "run-2",
    });
    expect(t.usage()).toBe(1);
    await t.work();
    expect(t.provider.calls).toBe(2);
  });

  it("usage limit reached: refused, nothing created, nothing charged", async () => {
    const t = setup();
    t.setUsageAllowed(false);
    expect(await t.request("user_refresh")).toMatchObject({
      status: "rejected",
      reason: "usage_limit",
    });
    expect(t.store.runs.size).toBe(0);
    expect(t.usage()).toBe(0);
  });

  it("background refresh is OFF", async () => {
    const t = setup();
    expect(await t.request("background")).toMatchObject({
      status: "rejected",
      reason: "background_disabled",
    });
    expect(t.queue.jobs.size).toBe(0);
  });
});

describe("workspace isolation", () => {
  it("a member of another workspace cannot start or see an analysis", async () => {
    const t = setup();
    const outsider: PersonalizationCtx = {
      user: { id: 2 },
      workspaceId: OTHER_WS,
      workspaceRole: "owner",
    };
    await expect(t.request("initial", outsider)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(t.store.runs.size).toBe(0);
  });

  it("the handler ignores a payload whose workspace does not own the run", async () => {
    const t = setup();
    await t.request("initial");
    const result = await runProfileAnalysis(
      {
        payload: {
          runId: "run-1",
          workspaceId: OTHER_WS,
          socialProfileId: "prof-1",
          requestKind: "initial",
        },
        attempt: 1,
        maxAttempts: 3,
      },
      {
        store: t.store,
        source: t.provider,
        suggestions: null,
        now: () => new Date(),
      }
    );
    expect(result).toEqual({ outcome: "missing_run" });
    expect(t.provider.calls).toBe(0);
  });
});

describe("existing provider adapter (no new provider)", () => {
  it("maps the existing integrations, excludes out-of-window items, keeps provider numbers as-is", async () => {
    const windowEnd = new Date("2026-10-16T00:00:00Z");
    const windowStart = new Date("2026-04-16T00:00:00Z");
    const source = createExistingProviderSource({
      scrapeReels: async () => ({
        followerCount: 900,
        reels: [
          {
            shortcode: "in",
            caption: "a",
            viewCount: 5000,
            likeCount: 50,
            commentCount: 5,
            reelUrl: "u",
            duration: 15,
            postedAt: new Date("2026-09-01"),
          },
          {
            shortcode: "old",
            caption: "b",
            viewCount: 9,
            likeCount: 1,
            commentCount: 0,
            reelUrl: "u",
            duration: 15,
            postedAt: new Date("2025-01-01"),
          },
          {
            shortcode: "backfill",
            caption: "c",
            viewCount: 9,
            likeCount: 1,
            commentCount: 0,
            reelUrl: "u",
            duration: 15,
            postedAt: new Date("2026-09-02"),
            outsideSpyWindow: true,
          },
        ],
      }),
      scrapeTikTokVideos: async () => ({ followerCount: 0, videos: [] }),
      scrapeYouTubeShorts: async () => ({ subscriberCount: 0, videos: [] }),
    });
    const { snapshot, providerCalls } = await source.fetchPosts({
      platform: "instagram",
      handle: "x",
      windowStart,
      windowEnd,
    });
    expect(snapshot.posts.map(p => p.postId)).toEqual(["in"]);
    expect(snapshot.followerCount).toBe(900);
    expect(providerCalls).toBeNull(); // unknown, not guessed
  });

  it("classifies the existing integrations' error messages", () => {
    expect(
      classifyProviderError(
        new Error(
          "The account @x is private. Only public accounts can be analyzed."
        )
      ).kind
    ).toBe("private");
    expect(
      classifyProviderError(
        new Error(
          'User "@x" not found. Please check the username and try again.'
        )
      ).kind
    ).toBe("not_found");
    expect(
      classifyProviderError(
        new Error("Instagram is temporarily rate limiting access")
      ).kind
    ).toBe("rate_limited");
    expect(classifyProviderError(new Error("HTTP 500")).kind).toBe("transient");
  });
});
