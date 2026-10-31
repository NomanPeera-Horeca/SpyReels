/**
 * Compares two judge files on the same customers.
 *
 *   pnpm exec tsx scripts/personalization-judge-compare.ts --before=before-real-judge-posts --after=phase1-real-judge-posts
 *
 * Prints sub-score means, paired better/worse counts, how many reasons say a
 * detail was invented, and image coverage. No profile text is printed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type Scores = Record<"niche" | "goal" | "audience" | "pillars" | "specificity" | "clarity" | "evidence", number> & {
  reason: string;
};
type Row = { caseId: string; scores: Scores | null; posts?: number; images?: number };

const dir = path.resolve(import.meta.dirname, "../docs/evals/personalization-intelligence");
const arg = (name: string) => {
  const flag = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!flag) throw new Error(`Pass --${name}=<judge file stem>.`);
  return flag.slice(name.length + 3);
};
const load = (stem: string) =>
  new Map(
    (JSON.parse(readFileSync(path.join(dir, `${stem}.json`), "utf8")) as { rows: Row[] }).rows
      .filter(row => row.scores)
      .map(row => [row.caseId, row])
  );

const strategy = (s: Scores) => s.goal + s.audience + s.pillars + s.specificity + s.clarity + s.evidence;
const INVENTED = /invent|fabricat|unsupported|not supported|no (caption|profile|bio)[^.]*(evidence|support)|lack[^.]*evidence/i;

const before = load(arg("before"));
const after = load(arg("after"));
const ids = [...before.keys()].filter(id => after.has(id)).sort();
const mean = (rows: Map<string, Row>, pick: (s: Scores) => number) =>
  Math.round((ids.reduce((sum, id) => sum + pick(rows.get(id)!.scores!), 0) / ids.length) * 10) / 10;
const summary = (rows: Map<string, Row>) => ({
  strategy: mean(rows, strategy),
  niche: mean(rows, s => s.niche),
  goal: mean(rows, s => s.goal),
  audience: mean(rows, s => s.audience),
  pillars: mean(rows, s => s.pillars),
  specificity: mean(rows, s => s.specificity),
  invented: ids.filter(id => INVENTED.test(rows.get(id)!.scores!.reason)).length,
});
const deltas = ids.map(id => ({
  id,
  before: strategy(before.get(id)!.scores!),
  after: strategy(after.get(id)!.scores!),
}));
const withImages = ids.filter(id => (after.get(id)!.images ?? 0) > 0);
const deltaMean = (list: typeof deltas) =>
  list.length ? Math.round((list.reduce((sum, d) => sum + d.after - d.before, 0) / list.length) * 10) / 10 : 0;

console.log(JSON.stringify({
  customers: ids.length,
  before: summary(before),
  after: summary(after),
  meanDelta: deltaMean(deltas),
  better: deltas.filter(d => d.after > d.before).length,
  worse: deltas.filter(d => d.after < d.before).length,
  same: deltas.filter(d => d.after === d.before).length,
  customersWithImages: withImages.length,
  meanDeltaWithImages: deltaMean(deltas.filter(d => withImages.includes(d.id))),
  meanDeltaWithoutImages: deltaMean(deltas.filter(d => !withImages.includes(d.id))),
  imagesPerCustomer: Math.round((ids.reduce((sum, id) => sum + (after.get(id)!.images ?? 0), 0) / ids.length) * 10) / 10,
}));
for (const d of deltas) {
  console.log(JSON.stringify({
    ...d,
    images: after.get(d.id)!.images ?? 0,
    beforeReason: before.get(d.id)!.scores!.reason,
    afterReason: after.get(d.id)!.scores!.reason,
  }));
}
