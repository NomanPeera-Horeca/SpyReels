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
import type { EvalCase } from "../server/personalization/intelligence/eval/fixtures";
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
  socialProfileId: string;
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

    const [runRows] = await conn.query(
      `SELECT socialProfileId, sourceSnapshot
         FROM profile_analysis_runs
        WHERE socialProfileId IN (?)
        ORDER BY createdAt DESC`,
      [ids]
    );
    const latestSnapshot = new Map<string, AnalysisSourceSnapshot | null>();
    for (const row of runRows as Array<{ socialProfileId: string; sourceSnapshot: unknown }>) {
      if (!latestSnapshot.has(row.socialProfileId)) {
        latestSnapshot.set(row.socialProfileId, json<AnalysisSourceSnapshot>(row.sourceSnapshot));
      }
    }

    const [itemRows] = await conn.query(
      `SELECT socialProfileId, kind, source, status, payload
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
        });
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
        });
        outcomes.push({ id, ...productionOutcome(items, progressByProfile.get(p.id)) });
        continue;
      }
      skipped += 1;
    }

    writeFileSync(out, JSON.stringify(cases));
    console.log(
      JSON.stringify({ linked: linkedN, notPostingYet: notPostingN, skippedWithoutUsableData: skipped })
    );
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
