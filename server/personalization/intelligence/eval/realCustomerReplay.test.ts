/**
 * Real-customer replay plumbing. A fake model is used: this checks that a
 * replay reads the customer's stored data and that the export refuses a
 * login that can write. It does not measure AI quality.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { InvokeParams, InvokeResult } from "../../../_core/llm";
import { grantsAreReadOnly } from "../../../../scripts/personalization-real-customers-export";
import { judgeProfileText, loadEvalCases } from "./caseSource";
import { EVAL_CASES, type EvalCase } from "./fixtures";
import { runEvaluation } from "./runEval";

function recordingModel() {
  const prompts: string[] = [];
  const answers: Record<string, unknown> = {
    personalization_niche: { label: "Supplement brand building", category: "Business" },
    personalization_goal_inference: {
      decision: "suggest",
      goal: "Show how a supplement brand is built from the inside.",
      confidence: "medium",
      evidence_basis: ["bio"],
      clarifying_question: "",
      offer_quote: "",
    },
    personalization_audience_recommendations: {
      audiences: [{ who: "Aspiring supplement brand founders", outcome: "launch a product brand", why: "They follow the build." }],
      confidence: "medium",
    },
    personalization_pillar_recommendations: {
      pillars: [
        { title: "Warehouse Tours", serves: "Shows founders how a supplement brand runs." },
        { title: "Brand Building Lessons", serves: "Teaches founders what built the brand." },
        { title: "Founder Training Routine", serves: "Shows the routine behind the founder." },
      ],
      confidence: "medium",
    },
  };
  const invoker = async (p: InvokeParams): Promise<InvokeResult> => {
    prompts.push(p.messages.map(m => String(m.content)).join("\n"));
    return {
      id: "x",
      created: 0,
      model: "claude-sonnet-4-6",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(answers[p.operation ?? ""] ?? {}) },
          finish_reason: "tool_use",
        },
      ],
      usage: { prompt_tokens: 1000, completion_tokens: 150, total_tokens: 1150 },
    };
  };
  return { invoker, prompts };
}

const realCase: EvalCase = {
  id: "R001",
  category: "real_customer",
  synthetic: false,
  platform: "instagram",
  displayName: "Replay Founder",
  bio: "Owner @replaysupps. How I built a supplement brand.",
  captions: [],
  snapshot: {
    version: 1,
    platform: "instagram",
    handle: "replay",
    followerCount: null,
    windowStart: "",
    windowEnd: "",
    posts: [],
    profileEvidence: {
      username: "replay",
      displayName: "Replay Founder",
      bio: "Owner @replaysupps. How I built a supplement brand.",
      category: "Digital creator",
      cta: null,
      websiteUrl: null,
      captions: ["Inside our warehouse on launch day"],
    },
  },
  profileStatus: "confirmed",
  expect: { commercial: false, clarification: "allowed", goalThemes: [], notes: "Real SpyReels customer replay." },
  fallbackGoal: "",
  fallbackAudiences: [],
};

describe("real-customer replay", () => {
  it("sends the stored lookup evidence to the model instead of synthetic captions", async () => {
    const model = recordingModel();
    const report = await runEvaluation({
      cases: [realCase],
      invoker: model.invoker,
      realModel: false,
      promptVersions: { goal: "g", audience: "a", pillars: "p" },
    });
    expect(report.cases[0]?.caseId).toBe("R001");
    expect(report.cases[0]?.goal.status).toBe("generated");
    const goalPrompt = model.prompts.find(text => text.includes("PURPOSE")) ?? "";
    expect(goalPrompt).toContain("Inside our warehouse on launch day");
    expect(goalPrompt).toContain("Digital creator");
    expect(goalPrompt).not.toContain("synthetic");
  });

  it("replays a not-posting customer from the niche they picked", async () => {
    const model = recordingModel();
    const report = await runEvaluation({
      cases: [
        {
          ...realCase,
          id: "N001",
          platform: null,
          displayName: null,
          bio: null,
          snapshot: null,
          profileStatus: "not_posting_yet",
          typedNiche: { slug: "home_baking", label: "Home baking" },
        },
      ],
      invoker: model.invoker,
      realModel: false,
      promptVersions: { goal: "g", audience: "a", pillars: "p" },
    });
    expect(report.cases[0]?.caseId).toBe("N001");
    expect(model.prompts.some(text => text.includes("Home baking"))).toBe(true);
  });

  it("loads cases from a runtime file and keeps the 30 synthetic cases as the default", () => {
    expect(loadEvalCases([])).toBe(EVAL_CASES);
    const dir = mkdtempSync(path.join(tmpdir(), "replay-"));
    const file = path.join(dir, "cases.json");
    writeFileSync(file, JSON.stringify([realCase]));
    const cases = loadEvalCases([`--fixtures=${file}`]);
    expect(cases.map(c => c.id)).toEqual(["R001"]);
    expect(judgeProfileText(cases[0])).toContain("Category: Digital creator");
    expect(judgeProfileText(cases[0])).toContain("Inside our warehouse on launch day");
    writeFileSync(file, "[]");
    expect(() => loadEvalCases([`--fixtures=${file}`])).toThrow(/non-empty/);
  });

  it("accepts only SELECT or USAGE grants", () => {
    expect(
      grantsAreReadOnly([
        "GRANT USAGE ON *.* TO `spyreels_eval`@`%`",
        "GRANT SELECT ON `railway`.* TO `spyreels_eval`@`%`",
      ])
    ).toBe(true);
    expect(grantsAreReadOnly(["GRANT SELECT, INSERT ON `railway`.* TO `x`@`%`"])).toBe(false);
    expect(grantsAreReadOnly(["GRANT ALL PRIVILEGES ON *.* TO `root`@`%` WITH GRANT OPTION"])).toBe(false);
    expect(grantsAreReadOnly(["GRANT SELECT, UPDATE ON `railway`.`users` TO `x`@`%`"])).toBe(false);
    expect(grantsAreReadOnly([])).toBe(false);
  });
});
