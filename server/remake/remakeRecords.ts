/**
 * Remake request records (PR 3): what the creator chose in the Remake popup,
 * a duplicate guard, and a draft publication row per saved remake.
 *
 * Needs drizzle/0118_remake_request_records.sql. Before it runs, every write
 * here is skipped and remakes work exactly as before. Writes never throw.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { prismFormat } from "../../shared/remakeFormats";
import type { RemakeTreatment } from "../recreate/remakeTreatment";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Every choice the popup can send. Own-winner choices arrive with PR 4. */
export const REMAKE_CHOICES = [
  "use_my_idea",
  "keep_topic",
  "adapt_niche",
  "prism_format",
  "refresh_original",
  "own_idea",
] as const;
export type RemakeChoice = (typeof REMAKE_CHOICES)[number];

const OWN_WINNER_CHOICES: ReadonlySet<RemakeChoice> = new Set(["prism_format", "refresh_original", "own_idea"]);

export function isOwnWinnerChoice(choice: RemakeChoice): boolean {
  return OWN_WINNER_CHOICES.has(choice);
}

/** The same request within this window returns the existing remake. */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;

export type ResolvedRemakeRequest =
  | {
      ok: true;
      topic: string;
      choice: RemakeChoice | null;
      idea: string | null;
      prismFormat: string | null;
      treatment: RemakeTreatment | null;
    }
  | { ok: false; message: string };

/**
 * The prompt topic (and own-winner treatment) for a request. A typed `choice`
 * wins over the older free `topic` field, which keeps working for older
 * clients. Own-winner choices need `ownWinnerAllowed` (the creator's own
 * video, OWN_WINNERS on). Pure; exported for tests.
 */
export function resolveRemakeRequest(
  input: {
    topic?: string | null;
    choice?: RemakeChoice | null;
    idea?: string | null;
    prismFormat?: string | null;
  },
  opts: { ownWinnerAllowed?: boolean } = {}
): ResolvedRemakeRequest {
  const base = { prismFormat: null, treatment: null };
  const choice = input.choice ?? null;
  if (!choice) return { ok: true, topic: (input.topic ?? "").trim(), choice: null, idea: null, ...base };
  const idea = (input.idea ?? "").trim();
  if (isOwnWinnerChoice(choice)) {
    if (!opts.ownWinnerAllowed) return { ok: false, message: "This option is only for your own videos." };
    if (choice === "prism_format") {
      const id = (input.prismFormat ?? "").trim();
      if (!prismFormat(id)) return { ok: false, message: "Pick a format first." };
      return { ok: true, topic: "SAME_TOPIC", choice, idea: null, prismFormat: id, treatment: { kind: "prism", formatId: id } };
    }
    if (choice === "refresh_original") {
      return { ok: true, topic: "SAME_TOPIC", choice, idea: null, prismFormat: null, treatment: { kind: "refresh" } };
    }
    if (!idea) return { ok: false, message: "Type your idea first." };
    return { ok: true, topic: idea, choice, idea, prismFormat: null, treatment: { kind: "own_idea" } };
  }
  if (choice === "use_my_idea") {
    if (!idea) return { ok: false, message: "Type your idea first." };
    return { ok: true, topic: idea, choice, idea, ...base };
  }
  if (choice === "keep_topic") return { ok: true, topic: "SAME_TOPIC", choice, idea: null, ...base };
  return { ok: true, topic: "", choice, idea: null, ...base };
}

/** A recent row with the same clientRequestId can be returned instead of a new run. Pure. */
export function isReusableRequest(
  row: { status: string; createdAt: Date | null } | null,
  now = Date.now()
): boolean {
  if (!row || row.status === "failed" || !row.createdAt) return false;
  return now - row.createdAt.getTime() <= DUPLICATE_WINDOW_MS;
}

let ready: boolean | null = null;
/** Columns and tables from migration 0118 exist. Cached once true. */
export async function remakeRecordsReady(db: Db): Promise<boolean> {
  if (ready) return true;
  try {
    const [rows] = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'clientRequestId') AS col,
        (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'remake_publications') AS tbl
    `)) as unknown as [Array<{ col: number; tbl: number }>];
    ready = Number(rows?.[0]?.col ?? 0) === 1 && Number(rows?.[0]?.tbl ?? 0) === 1;
  } catch {
    ready = false;
  }
  return ready;
}

/** The creator's own recent remake for this clientRequestId, if it can be reused. */
export async function findReusableRequest(
  db: Db,
  args: { userId: number; workspaceId: string; clientRequestId: string }
): Promise<number | null> {
  try {
    if (!(await remakeRecordsReady(db))) return null;
    const [rows] = (await db.execute(sql`
      SELECT id, status, createdAt FROM recreated_scripts
      WHERE userId = ${args.userId} AND workspaceId = ${args.workspaceId}
        AND clientRequestId = ${args.clientRequestId}
      ORDER BY id DESC LIMIT 1
    `)) as unknown as [Array<{ id: number; status: string; createdAt: unknown }>];
    const r = rows?.[0];
    if (!r) return null;
    const row = { status: String(r.status), createdAt: r.createdAt ? new Date(String(r.createdAt)) : null };
    return isReusableRequest(row) ? Number(r.id) : null;
  } catch {
    return null;
  }
}

export type RemakeRequestFields = {
  sourceKind: "user" | "featured" | "tiktok" | "youtube" | "collected" | "library";
  libraryCandidateId: number | null;
  choice: RemakeChoice | null;
  prismFormat: string | null;
  idea: string | null;
  clientRequestId: string | null;
};

/** Save the popup choice on the remake row. Skipped before 0118; never throws. */
export async function saveRemakeRequestFields(db: Db, scriptId: number, f: RemakeRequestFields): Promise<void> {
  try {
    if (!(await remakeRecordsReady(db))) return;
    await db.execute(sql`
      UPDATE recreated_scripts
      SET sourceKind = ${f.sourceKind}, libraryCandidateId = ${f.libraryCandidateId}, choice = ${f.choice},
          prismFormat = ${f.prismFormat}, idea = ${f.idea}, clientRequestId = ${f.clientRequestId}
      WHERE id = ${scriptId}
    `);
  } catch (err) {
    console.warn("[remake] request_fields_not_saved", {
      scriptId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * One 'draft' publication row per saved remake, with the creator's active
 * profile in this workspace and the library video it came from. Idempotent;
 * skipped before 0118; never throws.
 */
export async function createDraftPublication(args: {
  savedScriptId: number;
  recreatedScriptId: number;
  workspaceId: string;
  userId: number;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db || !(await remakeRecordsReady(db))) return;
    await db.execute(sql`
      INSERT IGNORE INTO remake_publications
        (savedScriptId, recreatedScriptId, workspaceId, userId, socialProfileId, libraryCandidateId, status)
      SELECT ${args.savedScriptId}, ${args.recreatedScriptId}, ${args.workspaceId}, ${args.userId},
        (SELECT socialProfileId FROM workspace_member_active_profiles
          WHERE userId = ${args.userId} AND workspaceId = ${args.workspaceId} LIMIT 1),
        (SELECT libraryCandidateId FROM recreated_scripts WHERE id = ${args.recreatedScriptId}),
        'draft'
    `);
  } catch (err) {
    console.warn("[remake] publication_not_created", {
      savedScriptId: args.savedScriptId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
