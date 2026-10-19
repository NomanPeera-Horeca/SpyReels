/**
 * Pillar subtopics. One row per topic, owned by the active pillar item.
 * Rows are never deleted. An edit moves them onto the new pillar id and
 * keeps each status, including dismissed. dismissedFromStatus is what Undo
 * restores. A different pillar does not inherit those dismissals.
 * The pillar row is locked before its topics so two writers cannot both
 * decide a label is new. The unique key is only the backstop.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import type { PillarPayload } from "@shared/personalization/model";
import {
  personalizationItems,
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

function errorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code ?? e?.cause?.code;
}

function missingTable(err: unknown): boolean {
  const e = err as { message?: string; cause?: { message?: string } };
  if (errorCode(err) === "ER_NO_SUCH_TABLE") return true;
  const message = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  return message.includes("pillar_subtopics") && message.includes("exist");
}

function duplicateRow(err: unknown): boolean {
  return errorCode(err) === "ER_DUP_ENTRY";
}

function lockConflict(err: unknown): boolean {
  const code = errorCode(err);
  return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT";
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

/** False when 0104 has not been applied. Call this before opening a transaction. */
export async function subtopicsTableReady(db: Db): Promise<boolean> {
  try {
    await db.select({ id: pillarSubtopics.id }).from(pillarSubtopics).limit(1);
    return true;
  } catch (err) {
    if (missingTable(err)) return false;
    throw err;
  }
}

export async function listProfileSubtopics(
  db: Db,
  profileId: string,
  workspaceId: string
): Promise<SubtopicRow[]> {
  try {
    const rows = await db
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
    return rows;
  } catch (err) {
    if (missingTable(err)) return [];
    throw err;
  }
}

type TopicOwner = {
  workspaceId: string;
  socialProfileId: string;
};

/**
 * Move every topic onto the pillar that just replaced `fromPillarItemId`.
 * Ids and statuses stay. A label already on the destination is left behind
 * so the unique key cannot be broken by a copy.
 * Caller locks the pillar row first, and must already know the table exists.
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
    .select({
      id: pillarSubtopics.id,
      normalizedLabel: pillarSubtopics.normalizedLabel,
    })
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
    const norm = normalizeTopicLabel(label);
    try {
      await tx.insert(pillarSubtopics).values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        socialProfileId: input.socialProfileId,
        pillarItemId: input.pillarItemId,
        label,
        normalizedLabel: norm,
        normalizedPillarTitle: input.titleKey,
        status: input.status,
        source: input.source,
        basedOnPillarHash: input.pillarHash,
      });
      existing.push({
        pillarItemId: input.pillarItemId,
        normalizedLabel: norm,
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

export async function saveGeneratedSubtopics(
  db: Db,
  input: TopicOwner & {
    groups: { title: string; labels: string[]; pillarHash: string }[];
  }
): Promise<number> {
  if (input.groups.length === 0) return 0;
  if (!(await subtopicsTableReady(db))) return 0;
  let inserted = 0;
  for (const group of input.groups) {
    const titleKey = normalizeTopicLabel(group.title);
    if (!titleKey) continue;
    inserted += await withLockRetry(() =>
      db.transaction(async tx => {
        const pillars = await lockLivePillars(tx, input);
        const pillar = pillars.find(p => {
          const payload = p.payload as PillarPayload;
          return normalizeTopicLabel(payload.title) === titleKey;
        });
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

export async function pillarsMissingSubtopics(
  db: Db,
  profileId: string,
  workspaceId: string
): Promise<{ title: string; description: string }[]> {
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
        eq(personalizationItems.socialProfileId, profileId),
        eq(personalizationItems.workspaceId, workspaceId)
      )
    );
  const topics = await listProfileSubtopics(db, profileId, workspaceId);
  const live = new Set(
    topics
      .filter(t => t.status === "suggested" || t.status === "confirmed")
      .map(t => t.pillarItemId)
  );
  return pillars
    .filter(p => p.kind === "pillar" && (p.status === "suggested" || p.status === "confirmed"))
    .filter(p => !live.has(p.id))
    .map(p => {
      const payload = p.payload as PillarPayload;
      return { title: payload.title, description: payload.description };
    });
}

export type SubtopicMutation =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "dismissed" | "unavailable" };

/** User-added subtopic. A previously dismissed label stays dismissed. */
export async function addPillarSubtopic(
  db: Db,
  input: TopicOwner & { pillarItemId: string; label: string }
): Promise<SubtopicMutation> {
  if (!(await subtopicsTableReady(db))) return { ok: false, reason: "unavailable" };
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
          r =>
            r.normalizedPillarTitle === titleKey &&
            r.normalizedLabel === norm &&
            r.status === "dismissed"
        );
        if (dismissed) return { ok: false, reason: "dismissed" as const };
        const same = existing.find(
          r => r.pillarItemId === pillar.id && r.normalizedLabel === norm
        );
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

/** Keep the row and remember the status Undo should restore. */
export async function dismissPillarSubtopic(
  db: Db,
  input: TopicOwner & { subtopicId: string }
): Promise<SubtopicMutation> {
  if (!(await subtopicsTableReady(db))) return { ok: false, reason: "unavailable" };
  return db.transaction(async tx => {
    const rows = await tx
      .select({ id: pillarSubtopics.id, status: pillarSubtopics.status })
      .from(pillarSubtopics)
      .where(
        and(
          eq(pillarSubtopics.id, input.subtopicId),
          eq(pillarSubtopics.socialProfileId, input.socialProfileId),
          eq(pillarSubtopics.workspaceId, input.workspaceId)
        )
      )
      .for("update")
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: false, reason: "not_found" as const };
    if (row.status === "dismissed") return { ok: true, id: row.id };
    if (row.status !== "suggested" && row.status !== "confirmed") {
      return { ok: false, reason: "not_found" as const };
    }
    await tx
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
    return { ok: true, id: row.id };
  });
}

/** Undo one dismissal. Other topics on the pillar are left as they are. */
export async function restorePillarSubtopic(
  db: Db,
  input: TopicOwner & { subtopicId: string }
): Promise<SubtopicMutation> {
  if (!(await subtopicsTableReady(db))) return { ok: false, reason: "unavailable" };
  return db.transaction(async tx => {
    const rows = await tx
      .select({
        id: pillarSubtopics.id,
        status: pillarSubtopics.status,
        dismissedFromStatus: pillarSubtopics.dismissedFromStatus,
      })
      .from(pillarSubtopics)
      .where(
        and(
          eq(pillarSubtopics.id, input.subtopicId),
          eq(pillarSubtopics.socialProfileId, input.socialProfileId),
          eq(pillarSubtopics.workspaceId, input.workspaceId)
        )
      )
      .for("update")
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: false, reason: "not_found" as const };
    if (row.status === "suggested" || row.status === "confirmed") {
      return { ok: true, id: row.id };
    }
    const back = row.dismissedFromStatus ?? "suggested";
    await tx
      .update(pillarSubtopics)
      .set({ status: back, dismissedFromStatus: null })
      .where(
        and(
          eq(pillarSubtopics.id, row.id),
          eq(pillarSubtopics.socialProfileId, input.socialProfileId),
          eq(pillarSubtopics.workspaceId, input.workspaceId),
          eq(pillarSubtopics.status, "dismissed")
        )
      );
    return { ok: true, id: row.id };
  });
}
