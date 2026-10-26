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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    "Niche is scored out of 30 and is not part of the strategy score. Strategy is out of 100: Goal 25, Audience 20, Pillars 25, Specificity 15, Clarity 10, Evidence 5. The gate is the strategy mean on answerable profiles that received a model suggestion, not a sum that includes niche or fixture fallbacks.",
    "",
    `Decision: ${r.decision.suggested.length} model suggestions, ${r.decision.clarification.length} clarifications, ${r.decision.other.length} other. Required clarification correct ${r.decision.requiredClarificationCorrect}/${r.decision.requiredClarification}. Answerable profiles suggested ${r.decision.answerableSuggested}/${r.decision.answerable}. First-pass results do not include fixture fallback answers. Clarification recovery is the later step where the user answers and the engine drafts audience and pillars.`,
    "",
    "| Case | Goal (source) | Audiences | Pillars | Gates | Niche /30 | Goal /25 | Audience /20 | Pillars /25 | Specific /15 | Clarity /10 | Evidence /5 | Strategy /100 | Reviewer notes |",
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
      `| ${c.caseId} | ${goal} | ${c.audiences.items.map(a => a.who).join("; ") || c.audiences.status} | ${c.pillars.items.map(p => p.title).join("; ") || c.pillars.status} | ${gates} | | | | | | | | | |`
    );
  }
  return lines.join("\n").replace(/—|–/g, ",");
}

function selectedCases() {
  const flag = process.argv.find(arg => arg.startsWith("--cases="));
  if (!flag) return EVAL_CASES;
  const ids = new Set(
    flag
      .slice("--cases=".length)
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  );
  const cases = EVAL_CASES.filter(item => ids.has(item.id));
  if (cases.length !== ids.size) {
    throw new Error("One or more --cases ids are not in the evaluation set.");
  }
  return cases;
}

function outputStem(): string | null {
  const flag = process.argv.find(arg => arg.startsWith("--out="));
  return flag ? flag.slice("--out=".length).trim() : null;
}

function loadLocalEnv(): void {
  const file = path.resolve(import.meta.dirname, "../.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  assertRealRunAllowed(process.env, process.argv);
  const { invokeLLM } = await import("../server/_core/llm");
  const capFlag = process.argv.find(arg => arg.startsWith("--cap="));
  const capUsd = capFlag ? Number(capFlag.slice("--cap=".length)) : undefined;
  if (
    capUsd !== undefined &&
    (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5)
  ) {
    throw new Error("--cap must be a dollar amount between 0 and 5.");
  }
  const report = await runEvaluation({
    cases: selectedCases(),
    invoker: invokeLLM,
    realModel: true,
    capUsd,
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
  const stamp = outputStem() || `run-${report.startedAt.replace(/[:.]/g, "-")}`;
  writeFileSync(
    path.join(dir, `${stamp}.json`),
    JSON.stringify(report, null, 2)
  );
  writeFileSync(path.join(dir, `${stamp}.md`), renderMarkdown(report));
  console.log(JSON.stringify({ file: stamp, totals: report.totals, niches: report.cases.map(c => ({ id: c.caseId, niche: c.niche, cta: c.cta })) }, null, 2));
}

if (process.argv[1]?.endsWith("personalization-intelligence-eval.ts")) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
