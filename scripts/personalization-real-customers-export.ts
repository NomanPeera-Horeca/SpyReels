/**
 * Builds real-customer replay cases for the personalization evaluation.
 *
 *   EVAL_DB_READONLY_URL=<read-only MySQL URL> \
 *     pnpm exec tsx scripts/personalization-real-customers-export.ts --out=/tmp/real-cases.json
 *
 * Guardrails:
 * - Reads EVAL_DB_READONLY_URL only. DATABASE_URL is never used.
 * - Refuses to run unless the login has read-only grants (SELECT/USAGE only),
 *   and reads inside a READ ONLY transaction.
 * - Public profile facts only: display name, bio, category, captions, the
 *   niche a customer picked. No emails, users, billing or account data.
 * - The cases file goes to --out (a runner temp path). It is never committed.
 * - Logs print anonymized ids (R001, N001) and counts, never profile text.
 */
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import type {
  AnalysisSourceSnapshot,
  LanguagePayload,
  NichePayload,
  SocialPlatform,
} from "../shared/personalization/model";
import type { EvalCase, ProductionShown } from "../server/personalization/intelligence/eval/fixtures";
import { detectCommercialSignals } from "../server/personalization/intelligence/evidence";

const WRITE_PRIVILEGE =
  /\b(ALL PRIVILEGES|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INDEX|REFERENCES|TRIGGER|EXECUTE|EVENT|LOCK TABLES|GRANT OPTION|SUPER|FILE|RELOAD|SHUTDOWN|PROCESS|CREATE USER)\b/i;

/** True when every grant line is SELECT or USAGE only. */
export function grantsAreReadOnly(grants: string[]): boolean {
  return grants.length > 0 && grants.every(line => !WRITE_PRIVILEGE.test(line.replace(/^GRANT\s+/i, "").split(/\s+ON\s+/i)[0] ?? ""));
}

type ProfileRow = {
  id: string;
  platform: SocialPlatform | null;
  displayName: string | null;
  bio: string | null;
  status: "confirmed" | "not_posting_yet";
};

type ItemRow = {
  id: string;
  socialProfileId: string;
  supersedesItemId: string | null;
  createdAt: Date | string;
  kind: string;
  source: "ai_suggested" | "user_entered" | "user_edited";
  status: "suggested" | "confirmed" | "dismissed" | "superseded";
  payload: unknown;
};

type ProgressRow = {
  socialProfileId: string;
  goalStatus: string;
  audienceStatus: string;
  pillarsStatus: string;
};

function json<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

const live = (row: ItemRow) => row.status === "suggested" || row.status === "confirmed";

/** Anonymized production outcome for one customer. Counts and labels only. */
function productionOutcome(items: ItemRow[], progress: ProgressRow | undefined) {
  const goal = items.find(i => i.kind === "goal" && i.status === "confirmed");
  const goalOutcome = !goal
    ? "none"
    : goal.source === "ai_suggested"
      ? "ai_kept"
      : goal.source === "user_edited"
        ? "ai_edited"
        : "typed";
  const count = (kind: string, pick: (i: ItemRow) => boolean) =>
    items.filter(i => i.kind === kind && pick(i)).length;
  return {
    steps: progress
      ? `${progress.goalStatus}/${progress.audienceStatus}/${progress.pillarsStatus}`
      : "none",
    goal: goalOutcome,
    audiencesAiKept: count("audience", i => i.source === "ai_suggested" && i.status === "confirmed"),
    audiencesAiUnconfirmed: count("audience", i => i.source === "ai_suggested" && i.status === "suggested"),
    audiencesTyped: count("audience", i => i.source !== "ai_suggested" && live(i)),
    pillarsAiKept: count("pillar", i => i.source === "ai_suggested" && i.status === "confirmed"),
    pillarsAiUnconfirmed: count("pillar", i => i.source === "ai_suggested" && i.status === "suggested"),
    pillarsTyped: count("pillar", i => i.source !== "ai_suggested" && live(i)),
  };
}

/**
 * What the AI first showed this customer during onboarding: per kind, the
 * earliest batch of ai_suggested rows (any status, so later edits, deletes
 * and regenerations do not hide the original wording).
 */
export function productionShown(items: ItemRow[]): ProductionShown {
  const firstBatch = (kind: string) => {
    const rows = items
      .filter(i => i.kind === kind && i.source === "ai_suggested")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (!rows.length) return [];
    const start = new Date(rows[0]!.createdAt).getTime();
    return rows.filter(r => new Date(r.createdAt).getTime() - start <= 120_000);
  };
  const text = (row: ItemRow | undefined, key: string) => {
    const v = (row?.payload as Record<string, unknown> | null)?.[key];
    return typeof v === "string" ? v : null;
  };
  return {
    niche: text(firstBatch("niche")[0], "label"),
    goal: text(firstBatch("goal")[0], "text"),
    audiences: firstBatch("audience").map(r => ({ who: text(r, "who") ?? "", outcome: text(r, "outcome") ?? "" })),
    pillars: firstBatch("pillar").map(r => ({ title: text(r, "title") ?? "", description: text(r, "description") ?? "" })),
  };
}

/** Fate of every AI suggestion ever shown: kept, edited, deleted, or left untouched. Counts only. */
export function suggestionFates(items: ItemRow[]) {
  const editedIds = new Set(
    items.filter(i => i.source === "user_edited" && i.supersedesItemId).map(i => i.supersedesItemId!)
  );
  const fates: Record<string, { shown: number; kept: number; edited: number; deleted: number; untouched: number; regenerated: number }> = {};
  for (const i of items.filter(i => i.source === "ai_suggested" && ["goal", "audience", "pillar"].includes(i.kind))) {
    const f = (fates[i.kind] ??= { shown: 0, kept: 0, edited: 0, deleted: 0, untouched: 0, regenerated: 0 });
    f.shown += 1;
    if (editedIds.has(i.id)) f.edited += 1;
    else if (i.status === "confirmed") f.kept += 1;
    else if (i.status === "dismissed") f.deleted += 1;
    else if (i.status === "suggested") f.untouched += 1;
    else f.regenerated += 1;
  }
  return fates;
}

async function main() {
  const url = process.env.EVAL_DB_READONLY_URL?.trim();
  if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL.trim()) {
    throw new Error("EVAL_DB_READONLY_URL must be a separate read-only login, not DATABASE_URL.");
  }
  const outFlag = process.argv.find(arg => arg.startsWith("--out="));
  const out = outFlag?.slice("--out=".length).trim();
  if (!out) throw new Error("Pass --out=<path for the temporary cases file>.");

  const conn = await mysql.createConnection({ uri: url });
  try {
    const [grantRows] = await conn.query("SHOW GRANTS FOR CURRENT_USER()");
    const grants = (grantRows as Array<Record<string, string>>).map(row => Object.values(row)[0] ?? "");
    if (!grantsAreReadOnly(grants)) {
      throw new Error("Refusing to run: this login can write. Use a SELECT-only user.");
    }
    await conn.query("START TRANSACTION READ ONLY");

    const [profileRows] = await conn.query(
      `SELECT id, platform, displayName, bio, status
         FROM social_profiles
        WHERE deletedAt IS NULL AND status IN ('confirmed', 'not_posting_yet')
        ORDER BY createdAt, id`
    );
    const profiles = profileRows as ProfileRow[];
    const ids = profiles.map(p => p.id);
    if (ids.length === 0) throw new Error("No confirmed or not-posting profiles found.");

    // Pick the newest run id first so the JSON snapshot is not part of the sort
    // (sorting rows that carry it overflows MySQL's sort buffer), then load
    // only those snapshots by primary key.
    const [runIdRows] = await conn.query(
      `SELECT id, socialProfileId
         FROM profile_analysis_runs
        WHERE socialProfileId IN (?)
        ORDER BY createdAt DESC, id DESC`,
      [ids]
    );
    const latestRunId = new Map<string, string>();
    for (const row of runIdRows as Array<{ id: string; socialProfileId: string }>) {
      if (!latestRunId.has(row.socialProfileId)) latestRunId.set(row.socialProfileId, row.id);
    }
    const latestSnapshot = new Map<string, AnalysisSourceSnapshot | null>();
    const runIds = [...latestRunId.values()];
    if (runIds.length) {
      const [runRows] = await conn.query(
        `SELECT socialProfileId, sourceSnapshot FROM profile_analysis_runs WHERE id IN (?)`,
        [runIds]
      );
      for (const row of runRows as Array<{ socialProfileId: string; sourceSnapshot: unknown }>) {
        latestSnapshot.set(row.socialProfileId, json<AnalysisSourceSnapshot>(row.sourceSnapshot));
      }
    }

    const [itemRows] = await conn.query(
      `SELECT id, socialProfileId, supersedesItemId, createdAt, kind, source, status, payload
         FROM personalization_items
        WHERE socialProfileId IN (?)`,
      [ids]
    );
    const itemsByProfile = new Map<string, ItemRow[]>();
    for (const row of itemRows as ItemRow[]) {
      const list = itemsByProfile.get(row.socialProfileId) ?? [];
      list.push({ ...row, payload: json(row.payload) });
      itemsByProfile.set(row.socialProfileId, list);
    }

    const [progressRows] = await conn.query(
      `SELECT socialProfileId, goalStatus, audienceStatus, pillarsStatus
         FROM personalization_progress
        WHERE socialProfileId IN (?)`,
      [ids]
    );
    const progressByProfile = new Map(
      (progressRows as ProgressRow[]).map(row => [row.socialProfileId, row])
    );
    await conn.query("ROLLBACK");

    const cases: EvalCase[] = [];
    const fateTotals: Record<string, Record<string, number>> = {};
    const addFates = (items: ItemRow[]) => {
      for (const [kind, f] of Object.entries(suggestionFates(items))) {
        const t = (fateTotals[kind] ??= {});
        for (const [k, v] of Object.entries(f)) t[k] = (t[k] ?? 0) + v;
      }
    };
    const outcomes: Array<{ id: string } & ReturnType<typeof productionOutcome>> = [];
    let linkedN = 0;
    let notPostingN = 0;
    let skipped = 0;
    for (const p of profiles) {
      const items = itemsByProfile.get(p.id) ?? [];
      const userValue = (kind: string) =>
        items.find(i => i.kind === kind && live(i) && i.source !== "ai_suggested");
      const language = userValue("language")?.payload as LanguagePayload | undefined;
      const base = {
        category: "real_customer" as const,
        synthetic: false,
        ...(language ? { language } : {}),
        expect: {
          commercial: detectCommercialSignals({
            bio: p.bio,
            brandDescription: null,
            displayName: p.displayName,
          }),
          clarification: "allowed" as const,
          goalThemes: [],
          notes: "Real SpyReels customer replay. No reviewer notes.",
        },
        fallbackGoal: "",
        fallbackAudiences: [],
      };
      if (p.status === "confirmed" && p.platform) {
        const id = `R${String(++linkedN).padStart(3, "0")}`;
        const snapshot = latestSnapshot.get(p.id) ?? null;
        cases.push({
          ...base,
          id,
          platform: p.platform,
          displayName: p.displayName,
          bio: p.bio,
          captions: (snapshot?.posts ?? []).map(post => post.caption ?? "").filter(Boolean),
          snapshot,
          profileStatus: "confirmed",
          productionShown: productionShown(items),
        });
        addFates(items);
        outcomes.push({ id, ...productionOutcome(items, progressByProfile.get(p.id)) });
        continue;
      }
      const niche = userValue("niche")?.payload as NichePayload | undefined;
      if (p.status === "not_posting_yet" && niche?.label) {
        const id = `N${String(++notPostingN).padStart(3, "0")}`;
        cases.push({
          ...base,
          id,
          platform: null,
          displayName: null,
          bio: null,
          captions: [],
          snapshot: null,
          profileStatus: "not_posting_yet",
          typedNiche: niche,
          productionShown: productionShown(items),
        });
        addFates(items);
        outcomes.push({ id, ...productionOutcome(items, progressByProfile.get(p.id)) });
        continue;
      }
      skipped += 1;
    }

    writeFileSync(out, JSON.stringify(cases));
    console.log(
      JSON.stringify({ linked: linkedN, notPostingYet: notPostingN, skippedWithoutUsableData: skipped })
    );
    console.log(JSON.stringify({ suggestionFates: fateTotals }));
    console.log("Production outcomes (anonymized):");
    for (const row of outcomes) console.log(JSON.stringify(row));
  } finally {
    await conn.end();
  }
}

if (process.argv[1]?.endsWith("personalization-real-customers-export.ts")) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
