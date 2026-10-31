/**
 * Real-model evaluation runner for the personalization engine (Phase 4B).
 *
 * Runs the PRODUCTION path for each synthetic case:
 *   evidence -> generateRecommendations(goal) -> confirm the AI goal ->
 *   generateRecommendations(audience) -> confirm the AI audiences ->
 *   generateRecommendations(pillars)
 *   A clarification or a failed step stops that case. Fixture fallback answers
 *   are not substituted, so they cannot hide an AI failure.
 * through the existing invokeLLM (default model routing, prompts, guards).
 *
 * It never substitutes scripted answers for a real run: realRun() refuses
 * without ANTHROPIC_API_KEY and an explicit spend confirmation. Tests inject
 * a fake invoker only to test the runner itself, and the artifact records
 * `realModel: false` in that case.
 *
 * Hard spending cap: before each case, spent + worst-case cost of a case must
 * stay under the cap, otherwise the run stops and reports it.
 *
 * Human rubric scores (100 points) are NOT computed here: the artifact
 * leaves them empty for reviewers. Only objective gates are automated.
 */
import {
  categorySelectsRestaurantPillars,
  poolNicheForCategory,
} from "@shared/personalization/contentTaxonomy";
import { estimateLlmCost } from "../../../analytics/aiCostModel";
import type {
  AnalysisSourceSnapshot,
  ItemPayloadByKind,
  PersonalizationItemKind,
} from "@shared/personalization/model";
import {
  upstreamInputsHash,
  type ItemRecord,
} from "@shared/personalization/state";
import type { InvokeParams, InvokeResult } from "../../../_core/llm";
import type { PersonalizationCtx } from "../../authorization";
import { EVAL_CASES } from "./fixtures";
import { buildCreatorEvidence, verbatimCta } from "../evidence";
import {
  inventsCommercialObjective,
  unsupportedNumbers,
  claimsPerformance,
} from "../guards";
import {
  generateRecommendations,
  type GeneratedInsert,
  type GenerationProfile,
  type RecommendationResult,
  type RecommendationStore,
} from "../recommendationService";
import type { LlmInvoker } from "../structuredLlm";
import type { EvalCase } from "./fixtures";

export const EVAL_SPEND_CAP_USD = 5;
/**
 * Worst case per case: 3 steps x 2 attempts, each with ~2.5k input and the
 * step's max output tokens, priced on the default model.
 */
export function worstCaseCaseUsd(model = "claude-sonnet-4-6"): number {
  const steps = [160, 400, 600, 700];
  return steps.reduce(
    (sum, maxOut) =>
      sum +
      2 *
        estimateLlmCost({ model, inputTokens: 2500, outputTokens: maxOut })
          .costUsd,
    0
  );
}

export type CallRecord = {
  caseId: string;
  operation: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedUsd: number;
  error: string | null;
  /** The model answered but a guard rejected the answer (paid for, not used). */
  rejected: boolean;
};

export type CaseRecord = {
  caseId: string;
  category: string;
  goal: {
    status: string;
    text: string | null;
    source: "ai" | "user_typed" | "none";
    question: string | null;
    confidence: string | null;
  };
  audiences: {
    status: string;
    items: Array<{ who: string; outcome: string }>;
    usedFallback: boolean;
  };
  pillars: {
    status: string;
    items: Array<{ title: string; description: string }>;
  };
  niche: {
    status: string;
    label: string | null;
    slug: string | null;
    categoryLabel: string | null;
  };
  routing: {
    pool: string | null;
    restaurantPillars: boolean;
  };
  /** Verbatim call to action taken from the bio. Null when none is present. */
  cta: string | null;
  rejections: Array<{ step: string; reason: string }>;
  calls: number;
  retries: number;
  /** Sum of model-call latencies. Parallel calls are counted separately. */
  latencyMs: number;
  /** Clock time for the case, including parallel niche and goal work. */
  wallClockMs: number;
  estimatedUsd: number;
  gates: {
    unsupportedCommercialGoal: boolean;
    inventedStatistics: string[];
    clarificationExpectationMet: boolean;
    audienceCountOk: boolean;
    pillarCountOk: boolean;
    confirmedPreserved: boolean;
  };
  /** Filled by human reviewers (rubric out of 100). */
  humanScores: null;
};

export type BenchmarkDecision = {
  /** First-pass model suggestions. Fixture answers are not included. */
  suggested: string[];
  /** The model or the evidence gate asked a question. */
  clarification: string[];
  /** Failed or unfinished for another reason. */
  other: string[];
  requiredClarificationCorrect: number;
  requiredClarification: number;
  answerableSuggested: number;
  answerable: number;
};

export type EvalReport = {
  realModel: boolean;
  startedAt: string;
  promptVersions: Record<string, string>;
  capUsd: number;
  stoppedByCap: boolean;
  cases: CaseRecord[];
  calls: CallRecord[];
  totals: {
    cases: number;
    calls: number;
    retries: number;
    rejections: number;
    estimatedUsd: number;
    meanUsdPerCase: number;
    maxUsdPerCase: number;
    meanLatencyMs: number;
    p95LatencyMs: number;
    meanWallClockMs: number;
    p95WallClockMs: number;
    failedCallUsd: number;
  };
  decision: BenchmarkDecision;
};

/**
 * Separates first-pass suggestion, clarification, and answerable profiles.
 * A stored fallback goal does not count as a suggestion.
 */
export function benchmarkDecision(
  cases: Array<{ caseId: string; goal: { status: string; source: string } }>,
  fixtures: Array<{ id: string; expect: { clarification: "required" | "allowed" | "no" } }> = EVAL_CASES
): BenchmarkDecision {
  const expectById = new Map(fixtures.map(item => [item.id, item.expect.clarification]));
  const suggested = cases
    .filter(item => item.goal.status === "generated" && item.goal.source === "ai")
    .map(item => item.caseId);
  const clarification = cases
    .filter(item => item.goal.status === "needs_clarification")
    .map(item => item.caseId);
  const known = new Set([...suggested, ...clarification]);
  const other = cases.filter(item => !known.has(item.caseId)).map(item => item.caseId);
  const required = cases.filter(item => expectById.get(item.caseId) === "required");
  const answerable = cases.filter(item => expectById.get(item.caseId) !== "required");
  return {
    suggested,
    clarification,
    other,
    requiredClarificationCorrect: required.filter(item =>
      clarification.includes(item.caseId)
    ).length,
    requiredClarification: required.length,
    answerableSuggested: answerable.filter(item => suggested.includes(item.caseId)).length,
    answerable: answerable.length,
  };
}

const WS = "eval-workspace";
const ctx: PersonalizationCtx = {
  user: { id: 1 },
  workspaceId: WS,
  workspaceRole: "owner",
};

class EvalStore implements RecommendationStore {
  items: ItemRecord[] = [];
  private seq = 0;
  constructor(
    private profile: GenerationProfile,
    private snapshot: AnalysisSourceSnapshot | null
  ) {}
  async loadProfile(id: string, ws: string) {
    return id === this.profile.id && ws === this.profile.workspaceId
      ? this.profile
      : null;
  }
  async loadLatestSnapshot() {
    return this.snapshot;
  }
  async loadItems() {
    return this.items.map(i => ({ ...i }));
  }
  async loadPersonalizationVersion() {
    return 1;
  }
  async applyGeneratedSuggestions(
    _p: string,
    input: Parameters<RecommendationStore["applyGeneratedSuggestions"]>[1]
  ) {
    const ok =
      input.guard.type === "no_confirmed"
        ? !this.items.some(
            i => i.kind === input.kind && i.status === "confirmed"
          )
        : upstreamInputsHash(input.kind, this.items) === input.guard.expected;
    if (!ok) return "stale" as const;
    for (const i of this.items)
      if (input.supersedeIds.includes(i.id)) i.status = "superseded";
    for (const ins of input.inserts as GeneratedInsert[])
      this.items.push({ ...ins, id: `ai-${++this.seq}` });
    return "applied" as const;
  }
  typed<K extends PersonalizationItemKind>(
    kind: K,
    payload: ItemPayloadByKind[K]
  ) {
    this.items.push({
      id: `user-${++this.seq}`,
      kind,
      payload,
      source: "user_entered",
      status: "confirmed",
      evidence: "user_provided",
      analysisRunId: null,
      basedOnVersion: 1,
      dismissedAtVersion: null,
      supersedesItemId: null,
    });
  }
  confirmSuggested(kind: PersonalizationItemKind, limit: number) {
    let n = 0;
    for (const i of this.items) {
      if (i.kind === kind && i.status === "suggested" && n < limit) {
        i.status = "confirmed";
        n++;
      }
    }
    return n;
  }
}

function snapshotFor(c: EvalCase): AnalysisSourceSnapshot | null {
  if (c.snapshot !== undefined) return c.snapshot;
  if (!c.captions) return null;
  return {
    version: 1,
    platform: c.platform ?? "instagram",
    handle: "synthetic",
    followerCount: null,
    windowStart: "",
    windowEnd: "",
    // Synthetic view counts in descending order: they only rank posts for
    // context; no number is ever shown or claimed.
    posts: c.captions.map((caption, i) => ({
      postId: String(i),
      url: null,
      publishedAt: null,
      views: 1000 - i * 10,
      likes: null,
      comments: null,
      durationSec: null,
      caption,
    })),
    profileEvidence: {
      username: "synthetic",
      displayName: c.displayName,
      bio: c.bio,
      category: null,
      cta: verbatimCta(c.bio),
      websiteUrl: null,
      captions: c.captions.slice(0, 6),
    },
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

export async function runEvaluation(input: {
  cases: EvalCase[];
  invoker: LlmInvoker;
  realModel: boolean;
  capUsd?: number;
  promptVersions: Record<string, string>;
  now?: () => number;
}): Promise<EvalReport> {
  const capUsd = input.capUsd ?? EVAL_SPEND_CAP_USD;
  const now = input.now ?? (() => Date.now());
  const calls: CallRecord[] = [];
  const cases: CaseRecord[] = [];
  let spent = 0;
  let stoppedByCap = false;
  const worst = worstCaseCaseUsd();

  for (const c of input.cases) {
    if (spent + worst > capUsd) {
      stoppedByCap = true;
      break;
    }
    const caseCalls: CallRecord[] = [];
    const rejections: CaseRecord["rejections"] = [];
    let step = "goal";
    const caseStarted = now();
    const invoker: LlmInvoker = async (
      params: InvokeParams
    ): Promise<InvokeResult> => {
      const t0 = now();
      const base = { caseId: c.id, operation: params.operation ?? "unknown" };
      try {
        const r = await input.invoker(params);
        const inTok = r.usage?.prompt_tokens ?? 0;
        const outTok = r.usage?.completion_tokens ?? 0;
        const rec: CallRecord = {
          ...base,
          model: r.model,
          inputTokens: inTok,
          outputTokens: outTok,
          latencyMs: now() - t0,
          estimatedUsd: estimateLlmCost({
            model: r.model,
            inputTokens: inTok,
            outputTokens: outTok,
          }).costUsd,
          error: null,
          rejected: false,
        };
        caseCalls.push(rec);
        return r;
      } catch (err) {
        caseCalls.push({
          ...base,
          model: null,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: now() - t0,
          estimatedUsd: 0,
          error: err instanceof Error ? err.name : "error",
          rejected: false,
        });
        throw err;
      }
    };
    const deps = (s: EvalStore) => ({
      store: s,
      invoker,
      onRejected: (reason: string) => {
        rejections.push({ step, reason });
        const last = caseCalls[caseCalls.length - 1];
        if (last) last.rejected = true;
      },
    });

    const store = new EvalStore(
      {
        id: "p",
        workspaceId: WS,
        deletedAt: null,
        status: c.profileStatus ?? (c.captions === null ? "private" : "confirmed"),
        platform: c.platform,
        displayName: c.displayName,
        bio: c.bio,
      },
      snapshotFor(c)
    );
    if (c.language) store.typed("language", c.language);
    if (c.typedNiche) store.typed("niche", c.typedNiche);

    // Goal
    const g: RecommendationResult = await generateRecommendations(deps(store), {
      ctx,
      socialProfileId: "p",
      step: "goal",
    });
    const goal: CaseRecord["goal"] = {
      status: g.status,
      text: null,
      source: "none",
      question: null,
      confidence: null,
    };
    if (g.status === "generated") {
      const row = store.items.find(
        i => i.kind === "goal" && i.status === "suggested"
      )!;
      goal.text = (row.payload as ItemPayloadByKind["goal"]).text;
      goal.source = "ai";
      goal.confidence = row.confidence ?? null;
      store.confirmSuggested("goal", 1);
    } else if (g.status === "needs_clarification") {
      goal.question = g.question;
      goal.source = "none";
    }
    const userValuesBefore = JSON.stringify(
      store.items.filter(i => i.source === "user_entered")
    );

    // Audience and pillars run only from an AI goal. A fixture fallback is not inserted.
    let a: RecommendationResult = {
      status: "needs_clarification",
      question: goal.question ?? "",
      reason: "insufficient_evidence",
      usage: null,
    };
    let usedFallback = false;
    let suggestedAudiences: ItemPayloadByKind["audience"][] = [];
    let p: RecommendationResult = a;
    let pillars: ItemPayloadByKind["pillar"][] = [];
    if (g.status === "generated") {
      step = "audience";
      a = await generateRecommendations(deps(store), {
        ctx,
        socialProfileId: "p",
        step: "audience",
      });
      suggestedAudiences = store.items
        .filter(i => i.kind === "audience" && i.status === "suggested")
        .map(i => i.payload as ItemPayloadByKind["audience"]);
      if (a.status === "generated") {
        store.confirmSuggested("audience", 2);
        step = "pillars";
        p = await generateRecommendations(deps(store), {
          ctx,
          socialProfileId: "p",
          step: "pillars",
        });
        pillars = store.items
          .filter(i => i.kind === "pillar" && i.status === "suggested")
          .map(i => i.payload as ItemPayloadByKind["pillar"]);
      }
    }

    // Objective gates
    const evidence = buildCreatorEvidence({
      platform: c.platform,
      displayName: c.displayName,
      bio: c.bio,
      snapshot: snapshotFor(c),
      items: [],
    });
    const allText = [
      goal.source === "ai" ? (goal.text ?? "") : "",
      ...suggestedAudiences.map(x => `${x.who} ${x.outcome}`),
      ...pillars.map(x => `${x.title} ${x.description}`),
    ].join(" ");
    const inventedStatistics = [
      ...unsupportedNumbers(allText, evidence.corpus),
      ...(pillars.some(
        x =>
          claimsPerformance(`${x.title} ${x.description}`) ||
          x.viewSharePercent !== null
      )
        ? ["performance claim"]
        : []),
    ];
    const askedOrNot =
      goal.question !== null || g.status === "needs_clarification";
    const clarificationExpectationMet =
      c.expect.clarification === "required"
        ? askedOrNot
        : c.expect.clarification === "no"
          ? g.status === "generated"
          : true;

    const caseUsd = caseCalls.reduce((s, x) => s + x.estimatedUsd, 0);
    spent += caseUsd;
    calls.push(...caseCalls);
    const nicheRow = store.items.find(
      i => i.kind === "niche" && i.status !== "superseded" && i.status !== "dismissed"
    );
    const nichePayload = nicheRow
      ? (nicheRow.payload as ItemPayloadByKind["niche"])
      : null;
    cases.push({
      caseId: c.id,
      category: c.category,
      goal,
      audiences: {
        status: a.status,
        items: suggestedAudiences.map(x => ({
          who: x.who,
          outcome: x.outcome,
        })),
        usedFallback,
      },
      pillars: {
        status: p.status,
        items: pillars.map(x => ({
          title: x.title,
          description: x.description,
        })),
      },
      niche: {
        status: nicheRow?.status ?? "missing",
        label: nichePayload?.label ?? null,
        slug: nichePayload?.slug ?? null,
        categoryLabel: nichePayload?.categoryLabel ?? null,
      },
      routing: {
        pool: poolNicheForCategory(nichePayload?.categoryLabel),
        restaurantPillars: categorySelectsRestaurantPillars(nichePayload?.categoryLabel),
      },
      cta: verbatimCta(c.bio),
      rejections,
      calls: caseCalls.length,
      retries: caseCalls.filter((call, index) =>
        caseCalls.findIndex(earlier => earlier.operation === call.operation) !== index
      ).length,
      latencyMs: caseCalls.reduce((s, x) => s + x.latencyMs, 0),
      wallClockMs: now() - caseStarted,
      estimatedUsd: Math.round(caseUsd * 1_000_000) / 1_000_000,
      gates: {
        unsupportedCommercialGoal:
          goal.source === "ai" &&
          inventsCommercialObjective(goal.text ?? "", c.expect.commercial),
        inventedStatistics,
        clarificationExpectationMet,
        audienceCountOk:
          a.status !== "generated" ||
          (suggestedAudiences.length >= 1 && suggestedAudiences.length <= 3),
        pillarCountOk:
          p.status !== "generated" ||
          (pillars.length >= 3 && pillars.length <= 5),
        confirmedPreserved:
          JSON.stringify(
            store.items
              .filter(i => i.source === "user_entered")
              .slice(0, JSON.parse(userValuesBefore).length)
          ) === userValuesBefore,
      },
      humanScores: null,
    });
  }

  const caseCosts = cases.map(c => c.estimatedUsd);
  const latencies = calls.map(c => c.latencyMs);
  const walls = cases.map(c => c.wallClockMs);
  const total = caseCosts.reduce((s, x) => s + x, 0);
  return {
    realModel: input.realModel,
    startedAt: new Date().toISOString(),
    promptVersions: input.promptVersions,
    capUsd,
    stoppedByCap,
    cases,
    calls,
    totals: {
      cases: cases.length,
      calls: calls.length,
      retries: cases.reduce((s, c) => s + c.retries, 0),
      rejections: cases.reduce((s, c) => s + c.rejections.length, 0),
      estimatedUsd: Math.round(total * 1_000_000) / 1_000_000,
      meanUsdPerCase: cases.length
        ? Math.round((total / cases.length) * 1_000_000) / 1_000_000
        : 0,
      maxUsdPerCase: caseCosts.length ? Math.max(...caseCosts) : 0,
      meanLatencyMs: latencies.length
        ? Math.round(latencies.reduce((s, x) => s + x, 0) / latencies.length)
        : 0,
      p95LatencyMs: percentile(latencies, 95),
      meanWallClockMs: walls.length
        ? Math.round(walls.reduce((s, x) => s + x, 0) / walls.length)
        : 0,
      p95WallClockMs: percentile(walls, 95),
      failedCallUsd:
        Math.round(
          calls
            .filter(x => x.rejected || x.error !== null)
            .reduce((sum, x) => sum + x.estimatedUsd, 0) * 1_000_000
        ) / 1_000_000,
    },
    decision: benchmarkDecision(cases),
  };
}

/** Real run guard: never runs (and never fakes) without credentials and explicit spend approval. */
export function assertRealRunAllowed(
  env: NodeJS.ProcessEnv,
  argv: string[]
): void {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Real evaluation blocked: ANTHROPIC_API_KEY is not configured for this environment."
    );
  }
  if (!argv.includes("--confirm-spend")) {
    throw new Error(
      `Real evaluation needs --confirm-spend (hard cap $${EVAL_SPEND_CAP_USD}).`
    );
  }
}
