/**
 * Pillar subtopics. One row per topic, owned by a pillar item.
 *
 * Storage: `pillar_subtopics` (migration 0104). Rules every writer follows:
 * - Lock the pillar row first, then its topic rows (FOR UPDATE). The unique key is the backstop.
 * - Every state change is a compare-and-set on the status it read.
 * - Every query and write is scoped to workspaceId and socialProfileId.
 * - A missing table or column is an error (SubtopicStoreError) on writes, never a silent skip.
 * - Undo restores exactly `dismissedFromStatus`. A null value is refused, never guessed.
 * - A dismissed label stays dismissed for the same normalized pillar title.
 * - Topics move onto a new pillar id only when the normalized title is unchanged.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { PillarPayload } from "@shared/personalization/model";
import { personalizationItems, pillarSubtopics } from "../../drizzle/personalizationSchema";
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

/** Thrown when a required migration is not applied. Writes never continue past it. */
export class SubtopicStoreError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Topic storage is not ready: ${missing.join("; ")}`);
    this.name = "SubtopicStoreError";
    this.missing = missing;
  }
}

export type SubtopicStoreCheck = { ready: true } | { ready: false; missing: string[] };

/** Checks the catalog for what the subtopic code needs. Uncached: a few small reads. */
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
    if (colRows.length === 0) missing.push("migration 0104: pillar_subtopics.dismissedFromStatus is missing");
    const [idxRows] = (await db.execute(sql`
      SELECT INDEX_NAME AS name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pillar_subtopics'
        AND INDEX_NAME = 'uq_pillar_subtopics_pillar_label' AND NON_UNIQUE = 0
    `)) as unknown as [Array<{ name: string }>];
    if (idxRows.length === 0) missing.push("migration 0104: unique key uq_pillar_subtopics_pillar_label is missing");
  }
  return missing.length ? { ready: false, missing } : { ready: true };
}

/** Throws SubtopicStoreError unless 0104 and 0105 are both verified. Call before any subtopic write. */
export async function assertSubtopicStoreReady(db: Db): Promise<void> {
  const check = await verifyPillarSubtopicStore(db);
  if (!check.ready) throw new SubtopicStoreError(check.missing);
}

/**
 * Pillar edits only need 0104 to move rows. When the 0104 table is absent it
 * cannot hold rows, so there is nothing to move and the edit may proceed.
 * A partly applied 0104 throws, because rows might exist that cannot be moved.
 */
export async function topicRowsPossible(db: Db): Promise<boolean> {
  const check = await verifyPillarSubtopicStore(db);
  if (check.ready) return true;
  const missing0104 = check.missing.filter(m => m.startsWith("migration 0104"));
  if (missing0104.some(m => m.includes("table pillar_subtopics is missing"))) return false;
  if (missing0104.length > 0) throw new SubtopicStoreError(missing0104);
  return true;
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
      .filter(r => r.normalizedPillarTitle === input.normalizedPillarTitle && r.status === "dismissed")
      .map(r => r.normalizedLabel)
  );
  const present = new Set(
    input.existing.filter(r => r.pillarItemId === input.pillarItemId).map(r => r.normalizedLabel)
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

function errorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

function duplicateRow(err: unknown): boolean {
  return errorCode(err) === "ER_DUP_ENTRY";
}

function lockConflict(err: unknown): boolean {
  const code = errorCode(err);
  return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT";
}

function affected(res: unknown): number {
  return (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
}

async function withLockRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!lockConflict(err) || attempt === 2) throw err;
    }
  }
  throw last;
}

/** Locks the pillar row. Every topic write takes this lock first. */
export async function lockPillar(tx: Db, pillarItemId: string): Promise<void> {
  await tx
    .select({ id: personalizationItems.id })
    .from(personalizationItems)
    .where(eq(personalizationItems.id, pillarItemId))
    .for("update");
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
    .where(and(eq(pillarSubtopics.socialProfileId, profileId), eq(pillarSubtopics.workspaceId, workspaceId)));
}

type TopicOwner = {
  workspaceId: string;
  socialProfileId: string;
};

/**
 * Move topics onto the pillar that replaced `fromPillarItemId`. Caller must
 * only use this when the normalized title did not change. Ids, statuses and
 * dismissals stay. A label already on the destination is left behind.
 * Caller locks the old pillar row first.
 */
export async function moveSubtopicsOntoPillar(
  tx: Db,
  input: TopicOwner & {
    fromPillarItemId: string;
    toPillarItemId: string;
    nextTitle: string;
  }
): Promise<void> {
  const titleKey = normalizeTopicLabel(input.nextTitle);
  const source = await tx
    .select({ id: pillarSubtopics.id, normalizedLabel: pillarSubtopics.normalizedLabel })
    .from(pillarSubtopics)
    .where(
      and(
        eq(pillarSubtopics.pillarItemId, input.fromPillarItemId),
        eq(pillarSubtopics.socialProfileId, input.socialProfileId),
        eq(pillarSubtopics.workspaceId, input.workspaceId)
      )
    )
    .for("update");
  const dest = await tx
    .select({ normalizedLabel: pillarSubtopics.normalizedLabel })
    .from(pillarSubtopics)
    .where(
      and(
        eq(pillarSubtopics.pillarItemId, input.toPillarItemId),
        eq(pillarSubtopics.socialProfileId, input.socialProfileId),
        eq(pillarSubtopics.workspaceId, input.workspaceId)
      )
    )
    .for("update");
  const taken = new Set(dest.map(r => r.normalizedLabel));
  for (const row of source) {
    if (taken.has(row.normalizedLabel)) continue;
    await tx
      .update(pillarSubtopics)
      .set({ pillarItemId: input.toPillarItemId, normalizedPillarTitle: titleKey })
      .where(
        and(
          eq(pillarSubtopics.id, row.id),
          eq(pillarSubtopics.pillarItemId, input.fromPillarItemId),
          eq(pillarSubtopics.socialProfileId, input.socialProfileId),
          eq(pillarSubtopics.workspaceId, input.workspaceId)
        )
      );
    taken.add(row.normalizedLabel);
  }
}

async function lockLivePillars(tx: Db, owner: TopicOwner) {
  return tx
    .select({
      id: personalizationItems.id,
      payload: personalizationItems.payload,
      status: personalizationItems.status,
      kind: personalizationItems.kind,
    })
    .from(personalizationItems)
    .where(
      and(
        eq(personalizationItems.socialProfileId, owner.socialProfileId),
        eq(personalizationItems.workspaceId, owner.workspaceId),
        eq(personalizationItems.kind, "pillar"),
        inArray(personalizationItems.status, ["suggested", "confirmed"])
      )
    )
    .for("update");
}

async function insertPlannedLabels(
  tx: Db,
  input: TopicOwner & {
    pillarItemId: string;
    titleKey: string;
    labels: string[];
    status: "suggested" | "confirmed";
    source: "ai_suggested" | "user_entered";
    pillarHash: string;
  }
): Promise<number> {
  const existing = await tx
    .select({
      pillarItemId: pillarSubtopics.pillarItemId,
      normalizedLabel: pillarSubtopics.normalizedLabel,
      normalizedPillarTitle: pillarSubtopics.normalizedPillarTitle,
      status: pillarSubtopics.status,
    })
    .from(pillarSubtopics)
    .where(
      and(
        eq(pillarSubtopics.socialProfileId, input.socialProfileId),
        eq(pillarSubtopics.workspaceId, input.workspaceId),
        or(
          eq(pillarSubtopics.pillarItemId, input.pillarItemId),
          eq(pillarSubtopics.normalizedPillarTitle, input.titleKey)
        )
      )
    )
    .for("update");
  const labels = planSubtopicInserts({
    labels: input.labels,
    existing,
    pillarItemId: input.pillarItemId,
    normalizedPillarTitle: input.titleKey,
  });
  let inserted = 0;
  for (const label of labels) {
    try {
      await tx.insert(pillarSubtopics).values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        socialProfileId: input.socialProfileId,
        pillarItemId: input.pillarItemId,
        label,
        normalizedLabel: normalizeTopicLabel(label),
        normalizedPillarTitle: input.titleKey,
        status: input.status,
        dismissedFromStatus: null,
        source: input.source,
        basedOnPillarHash: input.pillarHash,
      });
      existing.push({
        pillarItemId: input.pillarItemId,
        normalizedLabel: normalizeTopicLabel(label),
        normalizedPillarTitle: input.titleKey,
        status: input.status,
      });
      inserted++;
    } catch (err) {
      if (duplicateRow(err)) continue;
      throw err;
    }
  }
  return inserted;
}

/**
 * Stores topics for one pillar, matched by normalized title. Only the bundled
 * pillar-generation request calls this; it never runs on load or on a timer.
 */
export async function saveGeneratedSubtopics(
  db: Db,
  input: TopicOwner & {
    groups: { title: string; labels: string[]; pillarHash: string }[];
  }
): Promise<number> {
  if (input.groups.length === 0) return 0;
  await assertSubtopicStoreReady(db);
  let inserted = 0;
  for (const group of input.groups) {
    const titleKey = normalizeTopicLabel(group.title);
    if (!titleKey) continue;
    inserted += await withLockRetry(() =>
      db.transaction(async tx => {
        const pillars = await lockLivePillars(tx, input);
        const pillar = pillars.find(p => normalizeTopicLabel((p.payload as PillarPayload).title) === titleKey);
        if (!pillar) return 0;
        return insertPlannedLabels(tx, {
          ...input,
          pillarItemId: pillar.id,
          titleKey,
          labels: group.labels,
          status: "suggested",
          source: "ai_suggested",
          pillarHash: group.pillarHash,
        });
      })
    );
  }
  return inserted;
}

/**
 * Stores topics for one pillar item. Used only by the explicit topic request.
 * Returns the number inserted. Returns 0 when the pillar is no longer live.
 */
export async function saveTopicsForPillar(
  db: Db,
  input: TopicOwner & {
    pillarItemId: string;
    labels: string[];
    pillarHash: string;
  }
): Promise<number> {
  await assertSubtopicStoreReady(db);
  return withLockRetry(() =>
    db.transaction(async tx => {
      const t = tx as unknown as Db;
      await lockPillar(t, input.pillarItemId);
      const [pillar] = await t
        .select({
          id: personalizationItems.id,
          payload: personalizationItems.payload,
          kind: personalizationItems.kind,
          status: personalizationItems.status,
        })
        .from(personalizationItems)
        .where(
          and(
            eq(personalizationItems.id, input.pillarItemId),
            eq(personalizationItems.socialProfileId, input.socialProfileId),
            eq(personalizationItems.workspaceId, input.workspaceId)
          )
        )
        .limit(1);
      if (!pillar || pillar.kind !== "pillar") return 0;
      if (pillar.status !== "suggested" && pillar.status !== "confirmed") return 0;
      const titleKey = normalizeTopicLabel((pillar.payload as PillarPayload).title);
      return insertPlannedLabels(t, {
        workspaceId: input.workspaceId,
        socialProfileId: input.socialProfileId,
        pillarItemId: pillar.id,
        titleKey,
        labels: input.labels,
        status: "suggested",
        source: "ai_suggested",
        pillarHash: input.pillarHash,
      });
    })
  );
}

/** The refusal reasons a topic write can return. Not-ready storage throws instead. */
export type SubtopicMutation =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "dismissed"
        | "unknown_prior_state"
        | "pillar_not_live";
    }
  | { ok: false; reason: "conflict" };

/** User-added subtopic. A previously dismissed label stays dismissed. */
export async function addPillarSubtopic(
  db: Db,
  input: TopicOwner & { pillarItemId: string; label: string }
): Promise<SubtopicMutation> {
  await assertSubtopicStoreReady(db);
  return withLockRetry(() =>
    db.transaction(async tx => {
      const pillars = await lockLivePillars(tx, input);
      const pillar = pillars.find(p => p.id === input.pillarItemId);
      if (!pillar) return { ok: false, reason: "not_found" as const };
      const titleKey = normalizeTopicLabel((pillar.payload as PillarPayload).title);
      const norm = normalizeTopicLabel(input.label);
      const existing = await tx
        .select({
          id: pillarSubtopics.id,
          pillarItemId: pillarSubtopics.pillarItemId,
          normalizedLabel: pillarSubtopics.normalizedLabel,
          normalizedPillarTitle: pillarSubtopics.normalizedPillarTitle,
          status: pillarSubtopics.status,
        })
        .from(pillarSubtopics)
        .where(
          and(
            eq(pillarSubtopics.socialProfileId, input.socialProfileId),
            eq(pillarSubtopics.workspaceId, input.workspaceId),
            or(
              eq(pillarSubtopics.pillarItemId, pillar.id),
              eq(pillarSubtopics.normalizedPillarTitle, titleKey)
            )
          )
        )
        .for("update");
      const labels = planSubtopicInserts({
        labels: [input.label],
        existing,
        pillarItemId: pillar.id,
        normalizedPillarTitle: titleKey,
      });
      if (labels.length === 0) {
        const dismissed = existing.some(
          r => r.normalizedPillarTitle === titleKey && r.normalizedLabel === norm && r.status === "dismissed"
        );
        if (dismissed) return { ok: false, reason: "dismissed" as const };
        const same = existing.find(r => r.pillarItemId === pillar.id && r.normalizedLabel === norm);
        if (same) return { ok: true, id: same.id };
        return { ok: false, reason: "not_found" as const };
      }
      const id = randomUUID();
      try {
        await tx.insert(pillarSubtopics).values({
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
        if (duplicateRow(err)) return { ok: false, reason: "not_found" as const };
        throw err;
      }
      return { ok: true, id };
    })
  );
}

/**
 * Locks the pillar of a topic, then the topic row. Returns null when the topic
 * is not in this profile and workspace.
 */
async function lockTopic(tx: Db, input: TopicOwner & { subtopicId: string }) {
  const scope = and(
    eq(pillarSubtopics.id, input.subtopicId),
    eq(pillarSubtopics.socialProfileId, input.socialProfileId),
    eq(pillarSubtopics.workspaceId, input.workspaceId)
  );
  const [peek] = await tx
    .select({ pillarItemId: pillarSubtopics.pillarItemId })
    .from(pillarSubtopics)
    .where(scope)
    .limit(1);
  if (!peek) return null;
  await lockPillar(tx, peek.pillarItemId);
  const [row] = await tx
    .select({
      id: pillarSubtopics.id,
      pillarItemId: pillarSubtopics.pillarItemId,
      status: pillarSubtopics.status,
      dismissedFromStatus: pillarSubtopics.dismissedFromStatus,
    })
    .from(pillarSubtopics)
    .where(scope)
    .for("update")
    .limit(1);
  return row ?? null;
}

/** Keep the row and remember the status Undo should restore. */
export async function dismissPillarSubtopic(
  db: Db,
  input: TopicOwner & { subtopicId: string }
): Promise<SubtopicMutation> {
  await assertSubtopicStoreReady(db);
  return withLockRetry(() =>
    db.transaction(async tx => {
      const row = await lockTopic(tx as unknown as Db, input);
      if (!row) return { ok: false, reason: "not_found" as const };
      if (row.status === "dismissed") return { ok: true, id: row.id };
      if (row.status !== "suggested" && row.status !== "confirmed") {
        return { ok: false, reason: "not_found" as const };
      }
      const res = await tx
        .update(pillarSubtopics)
        .set({ status: "dismissed", dismissedFromStatus: row.status })
        .where(
          and(
            eq(pillarSubtopics.id, row.id),
            eq(pillarSubtopics.socialProfileId, input.socialProfileId),
            eq(pillarSubtopics.workspaceId, input.workspaceId),
            inArray(pillarSubtopics.status, ["suggested", "confirmed"])
          )
        );
      if (affected(res) !== 1) return { ok: false, reason: "conflict" as const };
      return { ok: true, id: row.id };
    })
  );
}

/**
 * Undo one dismissal. Returns the topic to exactly its recorded dismissedFromStatus.
 * Refused, never guessed, when that value is missing or the pillar is no longer live.
 */
export async function restorePillarSubtopic(
  db: Db,
  input: TopicOwner & { subtopicId: string }
): Promise<SubtopicMutation> {
  await assertSubtopicStoreReady(db);
  return withLockRetry(() =>
    db.transaction(async tx => {
      const t = tx as unknown as Db;
      const row = await lockTopic(t, input);
      if (!row) return { ok: false, reason: "not_found" as const };
      if (row.status !== "dismissed") return { ok: true, id: row.id };
      if (row.dismissedFromStatus !== "suggested" && row.dismissedFromStatus !== "confirmed") {
        return { ok: false, reason: "unknown_prior_state" as const };
      }
      const [pillar] = await t
        .select({ kind: personalizationItems.kind, status: personalizationItems.status })
        .from(personalizationItems)
        .where(eq(personalizationItems.id, row.pillarItemId))
        .limit(1);
      if (!pillar || pillar.kind !== "pillar" || (pillar.status !== "suggested" && pillar.status !== "confirmed")) {
        return { ok: false, reason: "pillar_not_live" as const };
      }
      const res = await tx
        .update(pillarSubtopics)
        .set({ status: row.dismissedFromStatus, dismissedFromStatus: null })
        .where(
          and(
            eq(pillarSubtopics.id, row.id),
            eq(pillarSubtopics.socialProfileId, input.socialProfileId),
            eq(pillarSubtopics.workspaceId, input.workspaceId),
            eq(pillarSubtopics.status, "dismissed")
          )
        );
      if (affected(res) !== 1) return { ok: false, reason: "conflict" as const };
      return { ok: true, id: row.id };
    })
  );
}
