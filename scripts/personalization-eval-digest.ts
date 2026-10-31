/**
 * Prints one line per evaluated case (outputs, rejections, judge score) and
 * the aggregate numbers, so a run can be reviewed from the CI log alone.
 *
 *   pnpm exec tsx scripts/personalization-eval-digest.ts --in=<artifact stem>
 *
 * Reads the run and judge artifacts only. Never prints profile bios.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EvalReport } from "../server/personalization/intelligence/eval/runEval";

type JudgeRow = {
  caseId: string;
  scores: {
    niche: number;
    goal: number;
    audience: number;
    pillars: number;
    specificity: number;
    clarity: number;
    evidence: number;
    reason: string;
  } | null;
};

function main() {
  const flag = process.argv.find(arg => arg.startsWith("--in="));
  if (!flag) throw new Error("Pass --in=<artifact stem>.");
  const stem = flag.slice("--in=".length);
  const dir = path.resolve(import.meta.dirname, "../docs/evals/personalization-intelligence");
  const report = JSON.parse(readFileSync(path.join(dir, `${stem}.json`), "utf8")) as EvalReport;
  const judgeFile = path.join(dir, `${stem}-judge.json`);
  const judged = existsSync(judgeFile)
    ? (JSON.parse(readFileSync(judgeFile, "utf8")) as { rows: JudgeRow[] }).rows
    : [];
  const scoreById = new Map(judged.map(row => [row.caseId, row.scores]));

  const status = { goal: new Map<string, number>(), audience: new Map<string, number>(), pillars: new Map<string, number>() };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const rejectionReasons = new Map<string, number>();
  const strategy: number[] = [];

  console.log(`=== ${stem}: ${report.cases.length} cases ===`);
  for (const c of report.cases) {
    bump(status.goal, c.goal.status);
    bump(status.audience, c.audiences.status);
    bump(status.pillars, c.pillars.status);
    for (const r of c.rejections) bump(rejectionReasons, `${r.step}: ${r.reason.replace(/\s*\(.*\)$/, "")}`);
    const s = scoreById.get(c.caseId) ?? null;
    const total = s ? s.goal + s.audience + s.pillars + s.specificity + s.clarity + s.evidence : null;
    if (total !== null) strategy.push(total);
    console.log(
      JSON.stringify({
        id: c.caseId,
        niche: c.niche.label,
        goal: c.goal.text ?? `(${c.goal.status}${c.goal.question ? `: ${c.goal.question}` : ""})`,
        audiences: c.audiences.items.length ? c.audiences.items.map(a => `${a.who} -> ${a.outcome}`) : `(${c.audiences.status})`,
        pillars: c.pillars.items.length ? c.pillars.items.map(p => p.title) : `(${c.pillars.status})`,
        rejections: c.rejections.map(r => `${r.step}: ${r.reason}`),
        score: s
          ? { strategy: total, niche: s.niche, goal: s.goal, audience: s.audience, pillars: s.pillars, specificity: s.specificity, reason: s.reason }
          : null,
      })
    );
  }
  const mean = strategy.length ? Math.round((strategy.reduce((a, b) => a + b, 0) / strategy.length) * 10) / 10 : null;
  console.log(
    JSON.stringify({
      summary: stem,
      cases: report.cases.length,
      stoppedByCap: report.stoppedByCap,
      estimatedUsd: report.totals.estimatedUsd,
      goal: Object.fromEntries(status.goal),
      audience: Object.fromEntries(status.audience),
      pillars: Object.fromEntries(status.pillars),
      judgedCases: strategy.length,
      meanStrategyOutOf100: mean,
      atLeast75: strategy.filter(v => v >= 75).length,
      rejectionReasons: Object.fromEntries([...rejectionReasons].sort((a, b) => b[1] - a[1])),
    })
  );
}

main();
