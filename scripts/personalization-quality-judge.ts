/**
 * Independent scorer for a personalization eval artifact.
 * It does not generate strategy and it does not use the generator prompts.
 *
 *   pnpm exec tsx scripts/personalization-quality-judge.ts --confirm-spend --in=niche-split-before
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { estimateLlmCost } from "../server/analytics/aiCostModel";
import { EVAL_CASES } from "../server/personalization/intelligence/eval/fixtures";
import type { EvalReport } from "../server/personalization/intelligence/eval/runEval";

function loadLocalEnv(): void {
  const file = path.resolve(import.meta.dirname, "../.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

type Scores = {
  niche: number;
  goal: number;
  audience: number;
  pillars: number;
  specificity: number;
  clarity: number;
  evidence: number;
  reason: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    niche: { type: "integer" },
    goal: { type: "integer" },
    audience: { type: "integer" },
    pillars: { type: "integer" },
    specificity: { type: "integer" },
    clarity: { type: "integer" },
    evidence: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["niche", "goal", "audience", "pillars", "specificity", "clarity", "evidence", "reason"],
  additionalProperties: false,
};

function clamp(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.niche === "number" || typeof record.niche === "string") return record;
  for (const nested of Object.values(record)) {
    const found = asRecord(nested);
    if (found) return found;
  }
  return null;
}

function parseScores(raw: string): Scores | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const text = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  try {
    const value = asRecord(JSON.parse(text));
    if (!value) return null;
    const reason = typeof value.reason === "string" ? value.reason : "";
    return {
      niche: clamp(Number(value.niche), 30),
      goal: clamp(Number(value.goal), 25),
      audience: clamp(Number(value.audience), 20),
      pillars: clamp(Number(value.pillars), 25),
      specificity: clamp(Number(value.specificity), 15),
      clarity: clamp(Number(value.clarity), 10),
      evidence: clamp(Number(value.evidence), 5),
      reason: reason.slice(0, 400),
    };
  } catch {
    return null;
  }
}

async function main() {
  loadLocalEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured.");
  if (!process.argv.includes("--confirm-spend")) throw new Error("Pass --confirm-spend.");
  const inputFlag = process.argv.find(arg => arg.startsWith("--in="));
  if (!inputFlag) throw new Error("Pass --in=<artifact stem>.");
  const stem = inputFlag.slice("--in=".length);
  const dir = path.resolve(import.meta.dirname, "../docs/evals/personalization-intelligence");
  const report = JSON.parse(readFileSync(path.join(dir, `${stem}.json`), "utf8")) as EvalReport;
  const { invokeLLM } = await import("../server/_core/llm");
  const onlyFlag = process.argv.find(arg => arg.startsWith("--only="));
  const only = onlyFlag ? new Set(onlyFlag.slice("--only=".length).split(",")) : null;
  const scored = [];
  let estimatedUsd = 0;
  for (const row of report.cases) {
    if (only && !only.has(row.caseId)) continue;
    const fixture = EVAL_CASES.find(item => item.id === row.caseId);
    const profile = [
      `Name: ${fixture?.displayName ?? ""}`,
      `Bio: ${fixture?.bio ?? ""}`,
      `Captions: ${(fixture?.captions ?? []).slice(0, 6).join(" | ")}`,
      `Notes: ${fixture?.expect.notes ?? ""}`,
    ].join("\n");
    const output = [
      `Niche label: ${row.niche.label ?? "(missing)"}`,
      `Discovery category: ${row.niche.categoryLabel ?? "(none)"}`,
      `Extracted CTA: ${row.cta ?? "(none)"}`,
      `Goal (${row.goal.source}): ${row.goal.text ?? row.goal.status}`,
      `Audiences: ${row.audiences.items.map(item => `${item.who} -> ${item.outcome}`).join("; ") || row.audiences.status}`,
      `Pillars: ${row.pillars.items.map(item => `${item.title}: ${item.description}`).join("; ") || row.pillars.status}`,
    ].join("\n");
    const result = await invokeLLM({
      operation: "personalization_quality_judge",
      temperature: 0,
      maxTokens: 800,
      timeoutMs: 30_000,
      messages: [
        {
          role: "system",
          content: [
            "You score a content-strategy draft against a synthetic creator profile.",
            "You are not writing the strategy. Score only what is shown.",
            "Niche is out of 30. A label that only names a broad catalog bucket, such as Business & Entrepreneurship or Health & Fitness, scores 12 or lower when the profile is more specific. A missing niche scores 0. A specific accurate label scores 24 to 30.",
            "Goal is out of 25. Audience is out of 20. Pillars are out of 25. Specificity is out of 15. Clarity is out of 10. Evidence discipline is out of 5.",
            "Penalize invented products, audiences, and statistics.",
            "The reason is one sentence, 180 characters or fewer.",
            "Return only the JSON object.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `${profile}\n\nDraft:\n${output}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "quality_scores", strict: true, schema: SCHEMA },
      },
    });
    const text = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";
    const scores = parseScores(text);
    if (!scores) {
      console.error(`${row.caseId} raw ${JSON.stringify(text).slice(0, 1200)} finish ${result.choices[0]?.finish_reason ?? ""}`);
    }
    const cost = estimateLlmCost({
      model: result.model,
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
    }).costUsd;
    estimatedUsd += cost;
    scored.push({ caseId: row.caseId, scores, costUsd: Math.round(cost * 1_000_000) / 1_000_000 });
    console.log(`${row.caseId} ${scores ? `niche ${scores.niche} goal ${scores.goal} audience ${scores.audience} pillars ${scores.pillars}` : "unscored"}`);
  }
  const nums = scored.flatMap(row => (row.scores ? [row.scores] : []));
  const mean = (key: keyof Scores) =>
    nums.length ? Math.round((nums.reduce((sum, row) => sum + Number(row[key]), 0) / nums.length) * 10) / 10 : 0;
  const summary = {
    stem,
    cases: scored.length,
    scored: nums.length,
    estimatedUsd: Math.round(estimatedUsd * 1_000_000) / 1_000_000,
    mean: {
      niche: mean("niche"),
      goal: mean("goal"),
      audience: mean("audience"),
      pillars: mean("pillars"),
      specificity: mean("specificity"),
      clarity: mean("clarity"),
      evidence: mean("evidence"),
      strategy: Math.round(
        (mean("goal") + mean("audience") + mean("pillars") + mean("specificity") + mean("clarity") + mean("evidence")) * 10
      ) / 10,
    },
    rows: scored,
  };
  if (!only) writeFileSync(path.join(dir, `${stem}-judge.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.mean));
}

if (process.argv[1]?.endsWith("personalization-quality-judge.ts")) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
