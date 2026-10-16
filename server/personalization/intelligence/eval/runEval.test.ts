/**
 * Tests the evaluation RUNNER only (refusal, spending cap, recording, gates,
 * fallbacks). A fake model is used, so nothing here measures AI quality and
 * reports from fake runs are stamped "NOT A REAL-MODEL RUN".
 */
import { describe, expect, it } from "vitest";
import type { InvokeParams, InvokeResult } from "../../../_core/llm";
import { renderMarkdown } from "../../../../scripts/personalization-intelligence-eval";
import { EVAL_CASES } from "./fixtures";
import {
  assertRealRunAllowed,
  runEvaluation,
  worstCaseCaseUsd,
} from "./runEval";

function fakeModel(over: Partial<Record<string, unknown[]>> = {}) {
  const queues: Record<string, unknown[]> = { ...over } as Record<
    string,
    unknown[]
  >;
  const defaults: Record<string, unknown> = {
    personalization_goal_inference: {
      decision: "suggest",
      goal: "Share useful tips with people who follow this account.",
      confidence: "medium",
      evidence_basis: ["bio"],
      clarifying_question: "",
      offer_quote: "",
    },
    personalization_audience_recommendations: {
      audiences: [
        {
          who: "People new to the topic",
          outcome: "learn the basics",
          why: "They need simple guidance.",
        },
        {
          who: "Curious viewers",
          outcome: "discover ideas",
          why: "They browse for new ideas.",
        },
      ],
      confidence: "medium",
    },
    personalization_pillar_recommendations: {
      pillars: [
        { title: "Quick tips", serves: "Gives viewers simple wins." },
        { title: "Common mistakes", serves: "Helps viewers avoid errors." },
        { title: "Behind the scenes", serves: "Builds trust with viewers." },
      ],
      confidence: "medium",
    },
  };
  let calls = 0;
  const invoker = async (p: InvokeParams): Promise<InvokeResult> => {
    calls++;
    const op = p.operation ?? "";
    const next = queues[op]?.length ? queues[op].shift() : defaults[op];
    if (next instanceof Error) throw next;
    return {
      id: "x",
      created: 0,
      model: "claude-sonnet-4-6",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: typeof next === "string" ? next : JSON.stringify(next),
          },
          finish_reason: "tool_use",
        },
      ],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 150,
        total_tokens: 1150,
      },
    };
  };
  return { invoker, calls: () => calls };
}

const PROMPTS = {
  goal: "goal-v1",
  audience: "audience-v1",
  pillars: "pillars-v1",
};

describe("evaluation set", () => {
  it("has 30 synthetic cases in the required category mix", () => {
    const counts: Record<string, number> = {};
    for (const c of EVAL_CASES)
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    expect(EVAL_CASES).toHaveLength(30);
    expect(EVAL_CASES.every(c => c.synthetic === true)).toBe(true);
    expect(counts).toEqual({
      restaurant_local: 5,
      fitness_health: 4,
      personal_brand: 4,
      entertainment: 4,
      travel_lifestyle_family: 4,
      education_services: 3,
      small_new: 3,
      ambiguous_multilingual: 3,
    });
    expect(new Set(EVAL_CASES.map(c => c.id)).size).toBe(30);
  });

  it("covers zero posts, fewer than 10 posts, established histories, private, multilingual, commercial and non-commercial", () => {
    expect(
      EVAL_CASES.some(c => c.captions !== null && c.captions.length === 0)
    ).toBe(true);
    expect(
      EVAL_CASES.some(
        c =>
          c.captions !== null && c.captions.length > 0 && c.captions.length < 10
      )
    ).toBe(true);
    expect(EVAL_CASES.some(c => (c.captions?.length ?? 0) >= 10)).toBe(true);
    expect(EVAL_CASES.some(c => c.captions === null)).toBe(true);
    expect(EVAL_CASES.some(c => c.language && c.language.code !== "en")).toBe(
      true
    );
    expect(EVAL_CASES.some(c => c.expect.commercial)).toBe(true);
    expect(EVAL_CASES.some(c => !c.expect.commercial)).toBe(true);
    expect(EVAL_CASES.some(c => c.expect.clarification === "required")).toBe(
      true
    );
  });
});

describe("real-run guard (never fakes a real evaluation)", () => {
  it("refuses without an API key", () => {
    expect(() => assertRealRunAllowed({}, ["--confirm-spend"])).toThrow(
      /ANTHROPIC_API_KEY/
    );
  });
  it("refuses without explicit spend confirmation", () => {
    expect(() => assertRealRunAllowed({ ANTHROPIC_API_KEY: "k" }, [])).toThrow(
      /--confirm-spend/
    );
  });
});

describe("runner mechanics (fake model)", () => {
  it("runs all three steps per case through the production orchestrator and records every call", async () => {
    const m = fakeModel();
    const r = await runEvaluation({
      cases: EVAL_CASES.slice(0, 3),
      invoker: m.invoker,
      realModel: false,
      promptVersions: PROMPTS,
    });
    expect(r.cases).toHaveLength(3);
    expect(
      r.calls.every(
        c =>
          c.model === "claude-sonnet-4-6" &&
          c.inputTokens === 1000 &&
          c.outputTokens === 150
      )
    ).toBe(true);
    expect(r.totals.estimatedUsd).toBeGreaterThan(0);
    expect(r.cases.every(c => c.humanScores === null)).toBe(true);
  });

  it("stops before a case that could break the spending cap", async () => {
    const m = fakeModel();
    const cap = worstCaseCaseUsd() * 2.5;
    const r = await runEvaluation({
      cases: EVAL_CASES,
      invoker: m.invoker,
      realModel: false,
      capUsd: cap,
      promptVersions: PROMPTS,
    });
    expect(r.stoppedByCap).toBe(true);
    expect(r.totals.estimatedUsd).toBeLessThanOrEqual(cap);
    expect(r.cases.length).toBeLessThan(30);
  });

  it("the full 30-case worst case fits under the $5 cap", () => {
    expect(worstCaseCaseUsd() * 30).toBeLessThan(5);
  });

  it("records rejected answers, their cost, and the retry", async () => {
    const m = fakeModel({
      personalization_goal_inference: [
        {
          decision: "suggest",
          goal: "Help 10,000 people.",
          confidence: "high",
          evidence_basis: ["bio"],
          clarifying_question: "",
          offer_quote: "",
        },
      ],
    });
    const r = await runEvaluation({
      cases: [EVAL_CASES[0]],
      invoker: m.invoker,
      realModel: false,
      promptVersions: PROMPTS,
    });
    expect(r.cases[0].rejections[0]).toMatchObject({ step: "goal" });
    expect(r.cases[0].retries).toBe(1);
    expect(r.totals.failedCallUsd).toBeGreaterThan(0);
  });

  it("when the engine asks to clarify, continues with what the user would type", async () => {
    const zeroPost = EVAL_CASES.find(
      c => c.expect.clarification === "required"
    )!;
    const m = fakeModel();
    const r = await runEvaluation({
      cases: [zeroPost],
      invoker: m.invoker,
      realModel: false,
      promptVersions: PROMPTS,
    });
    expect(r.cases[0].goal).toMatchObject({
      source: "user_typed",
      text: zeroPost.fallbackGoal,
    });
    expect(r.cases[0].gates.clarificationExpectationMet).toBe(true);
    expect(r.cases[0].gates.confirmedPreserved).toBe(true);
  });

  it("AI outage is recorded as a failure, not a crash, and the run continues", async () => {
    const m = fakeModel({
      personalization_audience_recommendations: [new Error("529 overloaded")],
    });
    const r = await runEvaluation({
      cases: EVAL_CASES.slice(0, 2),
      invoker: m.invoker,
      realModel: false,
      promptVersions: PROMPTS,
    });
    expect(r.cases[0].audiences).toMatchObject({
      status: "failed",
      usedFallback: true,
    });
    expect(r.cases).toHaveLength(2);
  });

  it("a fake run is stamped as NOT a real-model run in the report", async () => {
    const m = fakeModel();
    const r = await runEvaluation({
      cases: [EVAL_CASES[0]],
      invoker: m.invoker,
      realModel: false,
      promptVersions: PROMPTS,
    });
    expect(renderMarkdown(r)).toContain("NOT A REAL-MODEL RUN");
  });
});
