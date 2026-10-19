/**
 * Pillar subtopics. One row per topic, owned by a pillar item.
 *
 * Storage: `pillar_subtopics` (migration 0104, Cursor) plus `dismissedFromStatus`
 * (migration 0105) for exact undo, and `pillar_subtopic_jobs` for generation.
 *
 * Rules that every writer follows:
 * - Lock the pillar row first, then its topic rows (FOR UPDATE). Unique key is the backstop.
 * - Every state change is a compare-and-set on the status it read.
 * - Every query is scoped to workspaceId and socialProfileId.
 * - A missing table or column is an error (SubtopicStoreError), never a silent success.
 * - A dismissed label stays dismissed for the same pillar title.
 */
import { randomUUID } from "node:crypto";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { PillarPayload } from "@shared/personalization/model";
import {
  personalizationItems,
  pillarSubtopicJobs,
  pillarSubtopics,
} from "../../drizzle/personalizationSchema";
import type { Db } from "./db/analysisStore";

export type SubtopicStatus = "suggested" | "confirmed" | "dismissed";
export type SubtopicRow = {
  id: string;
  pillarItemId: string;
  label: string;
  normalizedLabel: string;
  normalizedPillarTitle: string;
  status: SubtopicStatus;
  dismissedFromStatus: "suggested" | "confirmed" | null;
  source: "ai_suggested" | "user_entered" | "user_edited";
};

/** Thrown when migrations 0104/0105 are not applied or verified. Never swallowed. */
export class SubtopicStoreError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Topic storage is not ready: ${missing.join("; ")}`);
    this.name = "SubtopicStoreError";
    this.missing = missing;
  }
}

export type SubtopicStoreCheck = { ready: true } | { ready: false; missing: string[] };

/** Checks the schema the subtopic writers need. Uncached: a few small catalog reads. */
export async function verifyPillarSubtopicStore(db: Db): Promise<SubtopicStoreCheck> {
  const missing: string[] = [];
  const [tableRows] = (await db.execute(sql`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('pillar_subtopics', 'pillar_subtopic_jobs')
  `)) as unknown as [Array<{ name: string }>];
  const tables = new Set(tableRows.map(r => r.name));
  if (!tables.has("pillar_subtopics")) missing.push("migration 0104: table pillar_subtopics is missing");
  if (!tables.has("pillar_subtopic_jobs")) missing.push("migration 0105: table pillar_subtopic_jobs is missing");
  if (tables.has("pillar_subtopics")) {
    const [colRows] = (await db.execute(sql`
      SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pillar_subtopics' AND COLUMN_NAME = 'dismissedFromStatus'
    `)) as unknown as [Array<{ name: string }>];
    if (colRows.length === 0) missing.push("migration 0105: pillar_subtopics.dismissedFromStatus is missing");
    const [idxRows] = (await db.execute(sql`
      SELECT INDEX_NAME AS name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pillar_subtopics'
        AND INDEX_NAME = 'uq_pillar_subtopics_pillar_label' AND NON_UNIQUE = 0
    `)) as unknown as [Array<{ name: string }>];
    if (idxRows.length === 0) missing.push("migration 0104: unique key uq_pillar_subtopics_pillar_label is missing");
  }
  return missing.length ? { ready: false, missing } : { ready: true };
}

export async function assertSubtopicStoreReady(db: Db): Promise<void> {
  const check = await verifyPillarSubtopicStore(db);
  if (!check.ready) throw new SubtopicStoreError(check.missing);
}

export function normalizeTopicLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type ExistingTopic = {
  pillarItemId: string;
  normalizedLabel: string;
  normalizedPillarTitle: string;
  status: string;
};

/**
 * Labels still worth inserting. Skips blanks, duplicates, topics already
 * stored on this pillar, and topics the user dismissed for this pillar title.
 */
export function planSubtopicInserts(input: {
  labels: string[];
  existing: ExistingTopic[];
  pillarItemId: string;
  normalizedPillarTitle: string;
}): string[] {
  const blocked = new Set(
    input.existing
      .filter(
        r =>
          r.normalizedPillarTitle === input.normalizedPillarTitle &&
          r.status === "dismissed"
      )
      .map(r => r.normalizedLabel)
  );
  const present = new Set(
    input.existing
      .filter(r => r.pillarItemId === input.pillarItemId)
      .map(r => r.normalizedLabel)
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const label of input.labels) {
    const cleaned = label.trim().replace(/\s+/g, " ");
    const norm = normalizeTopicLabel(cleaned);
    if (!norm || norm.split(" ").length > 4) continue;
    if (blocked.has(norm) || present.has(norm) || seen.has(norm)) continue;
    seen.add(norm);
    out.push(cleaned);
  }
  return out;
}

function duplicateRow(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "ER_DUP_ENTRY";
}

function affected(res: unknown): number {
  return (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
}

/** Locks the pillar row. Every topic write takes this lock first. */
export async function lockPillar(tx: Db, pillarItemId: string): Promise<void> {
  await tx
    .select({ id: personalizationItems.id })
    .from(personalizationItems)
    .where(eq(personalizationItems.id, pillarItemId))
    .for("update");
}

async function isLivePillar(tx: Db, pillarItemId: string): Promise<boolean> {
  const [p] = await tx
    .select({ kind: personalizationItems.kind, status: personalizationItems.status })
    .from(personalizationItems)
    .where(eq(personalizationItems.id, pillarItemId))
    .limit(1);
  return !!p && p.kind === "pillar" && (p.status === "suggested" || p.status === "confirmed");
}

export async function listProfileSubtopics(
  db: Db,
  profileId: string,
  workspaceId: string
): Promise<SubtopicRow[]> {
  return db
    .select({
      id: pillarSubtopics.id,
      pillarItemId: pillarSubtopics.pillarItemId,
      label: pillarSubtopics.label,
      normalizedLabel: pillarSubtopics.normalizedLabel,
      normalizedPillarTitle: pillarSubtopics.normalizedPillarTitle,
      status: pillarSubtopics.status,
      dismissedFromStatus: pillarSubtopics.dismissedFromStatus,
      source: pillarSubtopics.source,
    })
    .from(pillarSubtopics)
    .where(
      and(
        eq(pillarSubtopics.socialProfileId, profileId),
        eq(pillarSubtopics.workspaceId, workspaceId)
      )
    );
}

/**
 * Stores AI topic labels for one pillar item (by id, never by title lookup).
 * Dismissed labels for the same pillar title are skipped. Returns the inserted count.
 */
export async function saveTopicsForPillar(
  db: Db,
  input: {
    workspaceId: string;
    socialProfileId: string;
    pillarItemId: string;
    labels: string[];
    pillarHash: string;
  }
): Promise<number> {
  await assertSubtopicStoreReady(db);
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    const [pillar] = await t
      .select({ id: personalizationItems.id, payload: personalizationItems.payload })
      .from(personalizationItems)
      .where(
        and(
          eq(personalizationItems.id, input.pillarItemId),
          eq(personalizationItems.socialProfileId, input.socialProfileId),
          eq(personalizationItems.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    if (!pillar) throw new Error("pillar_not_found");
    await lockPillar(t, pillar.id);
    if (!(await isLivePillar(t, pillar.id))) return 0;
    const titleKey = normalizeTopicLabel((pillar.payload as PillarPayload).title);
    const existing = await listProfileSubtopics(t, input.socialProfileId, input.workspaceId);
    const labels = planSubtopicInserts({
      labels: input.labels,
      existing,
      pillarItemId: pillar.id,
      normalizedPillarTitle: titleKey,
    });
    let inserted = 0;
    for (const label of labels) {
      const norm = normalizeTopicLabel(label);
      const id = randomUUID();
      try {
        await t.insert(pillarSubtopics).values({
          id,
          workspaceId: input.workspaceId,
          socialProfileId: input.socialProfileId,
          pillarItemId: pillar.id,
          label,
          normalizedLabel: norm,
          normalizedPillarTitle: titleKey,
          status: "suggested",
          dismissedFromStatus: null,
          source: "ai_suggested",
          basedOnPillarHash: input.pillarHash,
        });
      } catch (err) {
        if (duplicateRow(err)) continue;
        throw err;
      }
      inserted++;
    }
    return inserted;
  });
}

/**
 * AI topics for pillars of this profile, matched by normalized pillar title.
 * Returns how many were inserted. Throws SubtopicStoreError when the store is not ready.
 */
export async function saveGeneratedSubtopics(
  db: Db,
  input: {
    workspaceId: string;
    socialProfileId: string;
    groups: { title: string; labels: string[]; pillarHash: string }[];
  }
): Promise<number> {
  if (input.groups.length === 0) return 0;
  await assertSubtopicStoreReady(db);
  const pillars = await db
    .select({
      id: personalizationItems.id,
      payload: personalizationItems.payload,
      status: personalizationItems.status,
      kind: personalizationItems.kind,
    })
    .from(personalizationItems)
    .where(
      and(
        eq(personalizationItems.socialProfileId, input.socialProfileId),
        eq(personalizationItems.workspaceId, input.workspaceId)
      )
    );
  let inserted = 0;
  for (const group of input.groups) {
    const titleKey = normalizeTopicLabel(group.title);
    const pillar = pillars.find(p => {
      if (p.kind !== "pillar") return false;
      if (p.status !== "suggested" && p.status !== "confirmed") return false;
      return normalizeTopicLabel((p.payload as PillarPayload).title) === titleKey;
    });
    if (!pillar) continue;
    inserted += await saveTopicsForPillar(db, {
      workspaceId: input.workspaceId,
      socialProfileId: input.socialProfileId,
      pillarItemId: pillar.id,
      labels: group.labels,
      pillarHash: group.pillarHash,
    });
  }
  return inserted;
}

export type SubtopicMutation =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "dismissed" | "invalid" | "pillar_not_live" | "conflict" };

/** User-added subtopic. A previously dismissed label stays dismissed. */
export async function addPillarSubtopic(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; pillarItemId: string; label: string }
): Promise<SubtopicMutation> {
  await assertSubtopicStoreReady(db);
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    const [pillar] = await t
      .select({ id: personalizationItems.id, payload: personalizationItems.payload, kind: personalizationItems.kind })
      .from(personalizationItems)
      .where(
        and(
          eq(personalizationItems.id, input.pillarItemId),
          eq(personalizationItems.socialProfileId, input.socialProfileId),
          eq(personalizationItems.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    if (!pillar || pillar.kind !== "pillar") return { ok: false, reason: "not_found" } as const;
    await lockPillar(t, pillar.id);
    if (!(await isLivePillar(t, pillar.id))) return { ok: false, reason: "pillar_not_live" } as const;

    const titleKey = normalizeTopicLabel((pillar.payload as PillarPayload).title);
    const existing = await listProfileSubtopics(t, input.socialProfileId, input.workspaceId);
    const labels = planSubtopicInserts({
      labels: [input.label],
      existing,
      pillarItemId: pillar.id,
      normalizedPillarTitle: titleKey,
    });
    const norm = normalizeTopicLabel(input.label);
    if (labels.length === 0) {
      const dismissed = existing.some(
        r => r.normalizedPillarTitle === titleKey && r.normalizedLabel === norm && r.status === "dismissed"
      );
      if (dismissed) return { ok: false, reason: "dismissed" } as const;
      const same = existing.find(r => r.pillarItemId === pillar.id && r.normalizedLabel === norm);
      if (same) return { ok: true, id: same.id } as const;
      return { ok: false, reason: "invalid" } as const;
    }
    const id = randomUUID();
    try {
      await t.insert(pillarSubtopics).values({
        id,
        workspaceId: input.workspaceId,
        socialProfileId: input.socialProfileId,
        pillarItemId: pillar.id,
        label: labels[0],
        normalizedLabel: normalizeTopicLabel(labels[0]),
        normalizedPillarTitle: titleKey,
        status: "confirmed",
        dismissedFromStatus: null,
        source: "user_entered",
        basedOnPillarHash: "user",
      });
    } catch (err) {
      if (duplicateRow(err)) return { ok: false, reason: "conflict" } as const;
      throw err;
    }
    return { ok: true, id } as const;
  });
}

type LockedSubtopic = { row: SubtopicRow & { pillarItemId: string } } | "missing" | "conflict";

/** Locks the pillar of a topic, then the topic row. Returns "conflict" if the topic moved meanwhile. */
async function lockSubtopic(t: Db, scope: SQL | undefined): Promise<LockedSubtopic> {
  const [peek] = await t
    .select({ pillarItemId: pillarSubtopics.pillarItemId })
    .from(pillarSubtopics)
    .where(scope)
    .limit(1);
  if (!peek) return "missing";
  await lockPillar(t, peek.pillarItemId);
  const [row] = await t
    .select({
      id: pillarSubtopics.id,
      pillarItemId: pillarSubtopics.pillarItemId,
      label: pillarSubtopics.label,
      normalizedLabel: pillarSubtopics.normalizedLabel,
      normalizedPillarTitle: pillarSubtopics.normalizedPillarTitle,
      status: pillarSubtopics.status,
      dismissedFromStatus: pillarSubtopics.dismissedFromStatus,
      source: pillarSubtopics.source,
    })
    .from(pillarSubtopics)
    .where(scope)
    .limit(1)
    .for("update");
  if (!row) return "missing";
  if (row.pillarItemId !== peek.pillarItemId) return "conflict";
  return { row };
}

/**
 * Permanent removal. Records the status it had (`dismissedFromStatus`) so Undo
 * restores exactly that. The row stays, so generation never recreates it.
 */
export async function dismissPillarSubtopic(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; subtopicId: string }
): Promise<SubtopicMutation> {
  await assertSubtopicStoreReady(db);
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    const scope = and(
      eq(pillarSubtopics.id, input.subtopicId),
      eq(pillarSubtopics.socialProfileId, input.socialProfileId),
      eq(pillarSubtopics.workspaceId, input.workspaceId)
    );
    const locked = await lockSubtopic(t, scope);
    if (locked === "missing") return { ok: false, reason: "not_found" } as const;
    if (locked === "conflict") return { ok: false, reason: "conflict" } as const;
    const { row } = locked;
    if (row.status === "dismissed") return { ok: true, id: row.id } as const;
    if (!(await isLivePillar(t, row.pillarItemId))) return { ok: false, reason: "pillar_not_live" } as const;

    const res = await t
      .update(pillarSubtopics)
      .set({ status: "dismissed", dismissedFromStatus: row.status as "suggested" | "confirmed" })
      .where(and(eq(pillarSubtopics.id, row.id), eq(pillarSubtopics.status, row.status), scope));
    if (affected(res) !== 1) return { ok: false, reason: "conflict" } as const;
    return { ok: true, id: row.id } as const;
  });
}

/* ---------- pillar identity: subtopics follow the pillar's id ---------- */

/** True when two pillar titles are the same topic (normalized). Empty titles never match. */
export function isSamePillarTitle(a: string, b: string): boolean {
  return normalizeTopicLabel(a) !== "" && normalizeTopicLabel(a) === normalizeTopicLabel(b);
}

/**
 * Moves every topic row and the generation job of one pillar item to another.
 * Statuses (including dismissed) and dismissedFromStatus are kept.
 * Callers must check the store first; this function does not skip silently.
 */
export async function repointPillarSubtopics(
  db: Db,
  input: { from: string; to: string }
): Promise<{ topics: number }> {
  if (input.from === input.to) return { topics: 0 };
  const res = await db
    .update(pillarSubtopics)
    .set({ pillarItemId: input.to })
    .where(eq(pillarSubtopics.pillarItemId, input.from));
  await db
    .update(pillarSubtopicJobs)
    .set({ pillarItemId: input.to })
    .where(eq(pillarSubtopicJobs.pillarItemId, input.from));
  return { topics: affected(res) };
}

export type RestoreSubtopicResult =
  | { ok: true; id: string; status: SubtopicStatus }
  | {
      ok: false;
      reason: "not_found" | "pillar_not_live" | "duplicate" | "unknown_prior_state" | "conflict";
    };

/**
 * Undo of one dismissed topic. Exact:
 * - returns the topic to `dismissedFromStatus` (what it was before the user removed it);
 * - refuses when that was not recorded (legacy rows) rather than guessing;
 * - the owning pillar must still be live; no other row may hold the same label;
 * - compare-and-set on `dismissed` and the recorded status, so a concurrent change wins.
 * A topic that is not dismissed is returned as it is (no-op).
 */
export async function restorePillarSubtopic(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; subtopicId: string }
): Promise<RestoreSubtopicResult> {
  await assertSubtopicStoreReady(db);
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    const scope = and(
      eq(pillarSubtopics.id, input.subtopicId),
      eq(pillarSubtopics.socialProfileId, input.socialProfileId),
      eq(pillarSubtopics.workspaceId, input.workspaceId)
    );
    const locked = await lockSubtopic(t, scope);
    if (locked === "missing") return { ok: false, reason: "not_found" } as const;
    if (locked === "conflict") return { ok: false, reason: "conflict" } as const;
    const { row } = locked;
    if (row.status !== "dismissed") return { ok: true, id: row.id, status: row.status } as const;
    if (!row.dismissedFromStatus) return { ok: false, reason: "unknown_prior_state" } as const;
    if (!(await isLivePillar(t, row.pillarItemId))) return { ok: false, reason: "pillar_not_live" } as const;

    const [sibling] = await t
      .select({ id: pillarSubtopics.id })
      .from(pillarSubtopics)
      .where(
        and(
          eq(pillarSubtopics.pillarItemId, row.pillarItemId),
          eq(pillarSubtopics.normalizedLabel, row.normalizedLabel),
          ne(pillarSubtopics.id, row.id)
        )
      )
      .limit(1);
    if (sibling) return { ok: false, reason: "duplicate" } as const;

    const target = row.dismissedFromStatus;
    const res = await t
      .update(pillarSubtopics)
      .set({ status: target, dismissedFromStatus: null })
      .where(
        and(
          eq(pillarSubtopics.id, row.id),
          eq(pillarSubtopics.status, "dismissed"),
          eq(pillarSubtopics.dismissedFromStatus, target),
          scope
        )
      );
    if (affected(res) !== 1) return { ok: false, reason: "conflict" } as const;
    return { ok: true, id: row.id, status: target } as const;
  });
}
