/**
 * Phase 4B real-model evaluation of the personalization engine.
 *
 *   ANTHROPIC_API_KEY=<authorized test key> \
 *     pnpm exec tsx scripts/personalization-intelligence-eval.ts --confirm-spend
 *
 * - Uses the production AI client (server/_core/llm.ts invokeLLM): same
 *   default model routing, prompts and guards as production.
 * - Synthetic profiles only (server/personalization/intelligence/eval/fixtures.ts).
 *   No scraping, no database, no customer data.
 * - Hard cap: $5 (EVAL_SPEND_CAP_USD). Stops before a case that could exceed it.
 * - Refuses to run without a key. It never substitutes scripted answers.
 * - Writes docs/evals/personalization-intelligence/run-<timestamp>.{json,md}.
 *   No keys or headers are ever written. Human rubric scores stay empty.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EVAL_CASES } from "../server/personalization/intelligence/eval/fixtures";
import {
  assertRealRunAllowed,
  runEvaluation,
  type EvalReport,
} from "../server/personalization/intelligence/eval/runEval";
import { GOAL_PROMPT_VERSION } from "../server/personalization/intelligence/goalInference";
import { AUDIENCE_PROMPT_VERSION } from "../server/personalization/intelligence/audienceRecommendations";
import { PILLAR_PROMPT_VERSION } from "../server/personalization/intelligence/pillarRecommendations";

export function renderMarkdown(r: EvalReport): string {
  const lines = [
    `# Personalization engine evaluation (${r.realModel ? "REAL MODEL" : "NOT A REAL-MODEL RUN"})`,
    "",
    `Started ${r.startedAt}. Prompts: ${Object.entries(r.promptVersions)
      .map(([k, v]) => `${k}=${v}`)
      .join(
        ", "
      )}. Cap $${r.capUsd}${r.stoppedByCap ? " (STOPPED BY CAP)" : ""}.`,
    "",
    `Cases ${r.totals.cases}, calls ${r.totals.calls}, retries ${r.totals.retries}, rejections ${r.totals.rejections}, cost $${r.totals.estimatedUsd} (mean $${r.totals.meanUsdPerCase}, max $${r.totals.maxUsdPerCase}, rejected/failed calls $${r.totals.failedCallUsd}), latency mean ${r.totals.meanLatencyMs} ms, p95 ${r.totals.p95LatencyMs} ms.`,
    "",
    "| Case | Goal (source) | Audiences | Pillars | Gates | Goal /25 | Audience /20 | Pillars /25 | Specific /15 | Clarity /10 | Evidence /5 | Total | Reviewer notes |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const c of r.cases) {
    const gates =
      [
        c.gates.unsupportedCommercialGoal ? "COMMERCIAL-INVENTED" : "",
        c.gates.inventedStatistics.length ? "STATS-INVENTED" : "",
        c.gates.clarificationExpectationMet ? "" : "clarify-mismatch",
        c.gates.audienceCountOk ? "" : "audience-count",
        c.gates.pillarCountOk ? "" : "pillar-count",
        c.gates.confirmedPreserved ? "" : "CONFIRMED-OVERWRITTEN",
      ]
        .filter(Boolean)
        .join(", ") || "ok";
    const goal = c.goal.text
      ? `${c.goal.text} (${c.goal.source}${c.goal.question ? `; asked: ${c.goal.question}` : ""})`
      : c.goal.status;
    lines.push(
      `| ${c.caseId} | ${goal} | ${c.audiences.items.map(a => a.who).join("; ") || c.audiences.status} | ${c.pillars.items.map(p => p.title).join("; ") || c.pillars.status} | ${gates} | | | | | | | | |`
    );
  }
  return lines.join("\n").replace(/—|–/g, ",");
}

async function main() {
  assertRealRunAllowed(process.env, process.argv);
  const { invokeLLM } = await import("../server/_core/llm");
  const report = await runEvaluation({
    cases: EVAL_CASES,
    invoker: invokeLLM,
    realModel: true,
    promptVersions: {
      goal: GOAL_PROMPT_VERSION,
      audience: AUDIENCE_PROMPT_VERSION,
      pillars: PILLAR_PROMPT_VERSION,
    },
  });
  const dir = path.resolve(
    import.meta.dirname,
    "../docs/evals/personalization-intelligence"
  );
  mkdirSync(dir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  writeFileSync(
    path.join(dir, `run-${stamp}.json`),
    JSON.stringify(report, null, 2)
  );
  writeFileSync(path.join(dir, `run-${stamp}.md`), renderMarkdown(report));
  console.log(JSON.stringify(report.totals, null, 2));
}

if (process.argv[1]?.endsWith("personalization-intelligence-eval.ts")) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
