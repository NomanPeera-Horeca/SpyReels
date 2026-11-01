/**
 * Starter-question test: for each "I don't post yet" customer with a known
 * picked niche, adds a copy (id + "S") that also has starter answers. The
 * answers are simulated from that niche using the onboarding chips a creator
 * would tap; customers who picked "Other" are left out.
 *
 *   --make --in=<cases.json> --out=<cases.json>   prints ids=...
 *   --compare --judge=<judge stem>                prints before/after per customer
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EvalCase } from "../server/personalization/intelligence/eval/fixtures";
import type { StarterAnswers } from "../shared/personalization/starterQuestions";

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const BY_NICHE: Record<string, StarterAnswers> = {
  fitness: { topic: "Fitness and weight loss", audience: "Gym beginners", purpose: "grow_audience" },
  personal_finance: { topic: "Personal finance", audience: "9 to 5 workers wanting to quit", purpose: "personal_brand" },
  business: { topic: "Entrepreneurship", audience: "Small business owners", purpose: "get_clients" },
  food: { topic: "Cooking and recipes", audience: "New parents", purpose: "share_entertain" },
  beauty: { topic: "Everyday makeup and skincare", audience: "25 to 35 year old women", purpose: "grow_audience" },
  tech_ai: { topic: "Tech and AI", audience: "Small business owners", purpose: "personal_brand" },
  real_estate: { topic: "Real estate", audience: "First-time home buyers", purpose: "get_clients" },
  travel: { topic: "Budget travel tips", audience: "College students", purpose: "share_entertain" },
};

function make() {
  const cases = JSON.parse(readFileSync(arg("in")!, "utf8")) as EvalCase[];
  const out: EvalCase[] = [];
  for (const c of cases) {
    if (c.profileStatus !== "not_posting_yet" || !c.typedNiche) continue;
    const slug = c.typedNiche.slug;
    if (slug === "other") continue;
    // A niche typed in the creator's own words is their topic answer.
    const answers = BY_NICHE[slug] ?? { topic: c.typedNiche.label, purpose: "grow_audience" as const };
    out.push(c, { ...c, id: `${c.id}S`, starter: answers });
  }
  writeFileSync(arg("out")!, JSON.stringify(out));
  console.log(JSON.stringify({ customers: out.length / 2 }));
  console.log(`ids=${out.map(c => c.id).join(",")}`);
}

function compare() {
  const dir = path.resolve(import.meta.dirname, "../docs/evals/personalization-intelligence");
  type Row = { caseId: string; scores: Record<string, number | string> | null };
  const judge = JSON.parse(readFileSync(path.join(dir, `${arg("judge")}.json`), "utf8")) as { rows: Row[] };
  const by = new Map(judge.rows.filter(r => r.scores).map(r => [r.caseId, r.scores!]));
  const strategy = (s: Record<string, number | string>) =>
    ["goal", "audience", "pillars", "specificity", "clarity", "evidence"].reduce((n, k) => n + Number(s[k] ?? 0), 0);
  const pairs = [...by.keys()].filter(id => !id.endsWith("S") && by.has(`${id}S`));
  const rows = pairs.map(id => ({ id, without: strategy(by.get(id)!), with: strategy(by.get(`${id}S`)!), reasonWith: by.get(`${id}S`)!.reason }));
  const mean = (k: "without" | "with") => Math.round((rows.reduce((n, r) => n + r[k], 0) / Math.max(1, rows.length)) * 10) / 10;
  console.log(JSON.stringify({
    customers: rows.length,
    meanWithoutAnswers: mean("without"),
    meanWithAnswers: mean("with"),
    better: rows.filter(r => r.with > r.without).length,
    worse: rows.filter(r => r.with < r.without).length,
  }));
  for (const r of rows) console.log(JSON.stringify(r));
}

if (process.argv.includes("--make")) make();
else if (process.argv.includes("--compare")) compare();
else throw new Error("Pass --make or --compare.");
