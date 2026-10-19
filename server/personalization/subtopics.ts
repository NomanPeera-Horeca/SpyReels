/**
 * Pillar subtopics. One row per topic, owned by a pillar item.
 * Dismissed rows are kept so a reload or a retry cannot recreate them.
 * A new pillar title (a meaningful edit) does not inherit those dismissals.
 */
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
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

function missingTable(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  const code = e?.code ?? e?.cause?.code;
  if (code === "ER_NO_SUCH_TABLE") return true;
  const message = e?.message ?? "";
  return message.includes("pillar_subtopics") && message.includes("exist");
}

function duplicateRow(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "ER_DUP_ENTRY";
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

export async function saveGeneratedSubtopics(
  db: Db,
  input: {
    workspaceId: string;
    socialProfileId: string;
    groups: { title: string; labels: string[]; pillarHash: string }[];
  }
): Promise<number> {
  if (input.groups.length === 0) return 0;
  let inserted = 0;
  try {
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
    const existing = await listProfileSubtopics(
      db,
      input.socialProfileId,
      input.workspaceId
    );
    for (const group of input.groups) {
      const titleKey = normalizeTopicLabel(group.title);
      const pillar = pillars.find(p => {
        if (p.kind !== "pillar") return false;
        if (p.status !== "suggested" && p.status !== "confirmed") return false;
        const payload = p.payload as PillarPayload;
        return normalizeTopicLabel(payload.title) === titleKey;
      });
      if (!pillar) continue;
      const labels = planSubtopicInserts({
        labels: group.labels,
        existing,
        pillarItemId: pillar.id,
        normalizedPillarTitle: titleKey,
      });
      for (const label of labels) {
        const norm = normalizeTopicLabel(label);
        const id = randomUUID();
        try {
          await db.insert(pillarSubtopics).values({
            id,
            workspaceId: input.workspaceId,
            socialProfileId: input.socialProfileId,
            pillarItemId: pillar.id,
            label,
            normalizedLabel: norm,
            normalizedPillarTitle: titleKey,
            status: "suggested",
            source: "ai_suggested",
            basedOnPillarHash: group.pillarHash,
          });
          existing.push({
            id,
            pillarItemId: pillar.id,
            label,
            normalizedLabel: norm,
            normalizedPillarTitle: titleKey,
            status: "suggested",
            source: "ai_suggested",
          });
          inserted++;
        } catch (err) {
          if (duplicateRow(err) || missingTable(err)) continue;
          throw err;
        }
      }
    }
  } catch (err) {
    if (missingTable(err)) return inserted;
    throw err;
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
  input: {
    workspaceId: string;
    socialProfileId: string;
    pillarItemId: string;
    label: string;
  }
): Promise<SubtopicMutation> {
  const pillars = await db
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
  const pillar = pillars[0];
  if (!pillar || pillar.kind !== "pillar") return { ok: false, reason: "not_found" };
  if (pillar.status !== "suggested" && pillar.status !== "confirmed")
    return { ok: false, reason: "not_found" };
  const titleKey = normalizeTopicLabel((pillar.payload as PillarPayload).title);
  const existing = await listProfileSubtopics(db, input.socialProfileId, input.workspaceId);
  const labels = planSubtopicInserts({
    labels: [input.label],
    existing,
    pillarItemId: pillar.id,
    normalizedPillarTitle: titleKey,
  });
  if (labels.length === 0) {
    const norm = normalizeTopicLabel(input.label);
    const dismissed = existing.some(
      r =>
        r.normalizedPillarTitle === titleKey &&
        r.normalizedLabel === norm &&
        r.status === "dismissed"
    );
    if (dismissed) return { ok: false, reason: "dismissed" };
    const same = existing.find(
      r => r.pillarItemId === pillar.id && r.normalizedLabel === norm
    );
    if (same) return { ok: true, id: same.id };
    return { ok: false, reason: "not_found" };
  }
  const id = randomUUID();
  try {
    await db.insert(pillarSubtopics).values({
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
    if (missingTable(err)) return { ok: false, reason: "unavailable" };
    if (duplicateRow(err)) return { ok: false, reason: "not_found" };
    throw err;
  }
  return { ok: true, id };
}

/** Permanent removal. The row stays so generation will not recreate it. */
export async function dismissPillarSubtopic(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; subtopicId: string }
): Promise<SubtopicMutation> {
  try {
    const rows = await db
      .select({ id: pillarSubtopics.id, status: pillarSubtopics.status })
      .from(pillarSubtopics)
      .where(
        and(
          eq(pillarSubtopics.id, input.subtopicId),
          eq(pillarSubtopics.socialProfileId, input.socialProfileId),
          eq(pillarSubtopics.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    if (!rows[0]) return { ok: false, reason: "not_found" };
    if (rows[0].status !== "dismissed") {
      await db
        .update(pillarSubtopics)
        .set({ status: "dismissed" })
        .where(eq(pillarSubtopics.id, rows[0].id));
    }
    return { ok: true, id: rows[0].id };
  } catch (err) {
    if (missingTable(err)) return { ok: false, reason: "unavailable" };
    throw err;
  }
}

/* ---------- integration with the pillar's id (added for the Onboarding v2 editor) ---------- */

/** True when two pillar titles are the same topic (normalized); a same-title edit keeps its subtopics. */
export function isSamePillarTitle(a: string, b: string): boolean {
  return normalizeTopicLabel(a) !== "" && normalizeTopicLabel(a) === normalizeTopicLabel(b);
}

/**
 * Moves every subtopic row of one pillar item to another (a pillar edit or
 * restore creates a new item id). Subtopics live on the pillar, not on its row.
 * Ignores a missing table (before migration 0104 the feature is absent).
 */
export async function repointPillarSubtopics(
  db: Db,
  input: { from: string; to: string }
): Promise<void> {
  if (input.from === input.to) return;
  try {
    await db
      .update(pillarSubtopics)
      .set({ pillarItemId: input.to })
      .where(eq(pillarSubtopics.pillarItemId, input.from));
  } catch (err) {
    if (missingTable(err)) return;
    throw err;
  }
}

export type RestoreSubtopicResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "pillar_not_live" | "duplicate" | "unavailable" };

/**
 * Undo of a user dismissal. Safe by construction:
 * - only a `dismissed` row is changed (compare-and-set), so nothing else is revived;
 * - the pillar that owns it must still be live (suggested or confirmed);
 * - no other row for the same label on that pillar may exist (the unique key);
 * - the row returns to the status it had before the user removed it: AI topics
 *   to `suggested`, user-entered topics to `confirmed`.
 */
export async function restorePillarSubtopic(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; subtopicId: string }
): Promise<RestoreSubtopicResult> {
  try {
    const [row] = await db
      .select()
      .from(pillarSubtopics)
      .where(
        and(
          eq(pillarSubtopics.id, input.subtopicId),
          eq(pillarSubtopics.socialProfileId, input.socialProfileId),
          eq(pillarSubtopics.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    if (!row) return { ok: false, reason: "not_found" };
    if (row.status !== "dismissed") return { ok: true, id: row.id };

    const [pillar] = await db
      .select({ kind: personalizationItems.kind, status: personalizationItems.status })
      .from(personalizationItems)
      .where(eq(personalizationItems.id, row.pillarItemId))
      .limit(1);
    if (!pillar || pillar.kind !== "pillar" || (pillar.status !== "suggested" && pillar.status !== "confirmed")) {
      return { ok: false, reason: "pillar_not_live" };
    }

    const sibling = await db
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
    if (sibling.length) return { ok: false, reason: "duplicate" };

    const status = row.source === "ai_suggested" ? "suggested" : "confirmed";
    await db
      .update(pillarSubtopics)
      .set({ status })
      .where(and(eq(pillarSubtopics.id, row.id), eq(pillarSubtopics.status, "dismissed")));
    return { ok: true, id: row.id };
  } catch (err) {
    if (missingTable(err)) return { ok: false, reason: "unavailable" };
    throw err;
  }
}
