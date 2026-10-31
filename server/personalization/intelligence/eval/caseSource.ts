/**
 * Which evaluation cases a run uses.
 *
 * Default: the 30 committed synthetic profiles (fixtures.ts).
 * `--fixtures=<path>`: a JSON array of EvalCase written at run time, used for
 * real-customer replays. That file lives only on the runner and is never
 * committed, so customer profile text stays out of the repository.
 */
import { readFileSync } from "node:fs";
import { EVAL_CASES, type EvalCase } from "./fixtures";

export function fixturesPathFromArgv(argv: string[]): string | null {
  const flag = argv.find(arg => arg.startsWith("--fixtures="));
  const value = flag?.slice("--fixtures=".length).trim();
  return value ? value : null;
}

export function loadEvalCases(argv: string[]): EvalCase[] {
  const file = fixturesPathFromArgv(argv);
  if (!file) return EVAL_CASES;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("--fixtures must point to a non-empty JSON array of cases.");
  }
  const cases = parsed as EvalCase[];
  for (const c of cases) {
    if (typeof c?.id !== "string" || !c.id || !c.expect) {
      throw new Error("--fixtures contains a case without an id or expectations.");
    }
  }
  return cases;
}

/** Profile text shown to the independent judge. Real replays read their stored snapshot. */
export function judgeProfileText(c: EvalCase | undefined): string {
  const evidence = c?.snapshot?.profileEvidence ?? null;
  const postCaptions = (c?.snapshot?.posts ?? [])
    .map(post => (post.caption ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const captions = c?.snapshot
    ? (postCaptions.length ? postCaptions : (evidence?.captions ?? []))
    : (c?.captions ?? []);
  return [
    `Name: ${c?.displayName ?? evidence?.displayName ?? ""}`,
    `Bio: ${c?.bio ?? evidence?.bio ?? ""}`,
    evidence?.category ? `Category: ${evidence.category}` : null,
    c?.typedNiche ? `Niche the creator picked: ${c.typedNiche.label}` : null,
    `Captions: ${captions.slice(0, 6).join(" | ")}`,
    `Notes: ${c?.expect.notes ?? ""}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
