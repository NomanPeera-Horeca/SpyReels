/**
 * Legacy personalization backfill: RUNNER.
 *
 * Ops tool only. Not imported by the app, the worker or any router.
 * Dry run by default. With execute: true it inserts the plan from
 * planLegacyBackfill in one transaction per batch, using INSERT IGNORE on
 * deterministic ids, then re-reads the rows to reconcile counts.
 *
 * It only INSERTs into social_profiles and personalization_items. It never
 * UPDATEs or DELETEs anything, and never touches users, workspaces, scripts,
 * plans, research history or creator data.
 */
import type { Queryable } from "../preflight";
import {
  planLegacyBackfill,
  type BackfillPlan,
  type ItemRow,
  type LegacyUserRow,
  type MembershipRow,
  type ProfileRow,
  type WorkspaceRow,
} from "./legacyBackfill";

export type BackfillRunResult = {
  executed: boolean;
  batches: number;
  counts: BackfillPlan["counts"];
  ambiguous: BackfillPlan["outcomes"];
  inserted: { profiles: number; items: number };
  reconciliation: {
    profilesMissing: number;
    itemsMissing: number;
    ok: boolean;
  };
};

async function rows<T>(
  conn: Queryable,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const [r] = await conn.query(sql, params);
  return r as T[];
}

const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");

function parseJsonArray(v: unknown): string[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v as string[];
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function runLegacyBackfill(
  conn: Queryable,
  opts: { execute: boolean; batchSize?: number }
): Promise<BackfillRunResult> {
  const batchSize = opts.batchSize ?? 500;
  const result: BackfillRunResult = {
    executed: opts.execute,
    batches: 0,
    counts: {
      usersScanned: 0,
      profilesPlanned: 0,
      itemsPlanned: 0,
      usersAlsoInTeamWorkspaces: 0,
      planned: 0,
      already_backfilled: 0,
      no_legacy_values: 0,
      no_personal_workspace: 0,
      multiple_personal_workspaces: 0,
      multiple_profiles_in_workspace: 0,
    },
    ambiguous: [],
    inserted: { profiles: 0, items: 0 },
    reconciliation: { profilesMissing: 0, itemsMissing: 0, ok: true },
  };

  let lastId = 0;
  for (;;) {
    const users = (
      await rows<{
        id: number;
        selectedNicheSlugs: unknown;
        businessDescription: string | null;
        targetAudience: string | null;
      }>(
        conn,
        `SELECT id, selectedNicheSlugs, businessDescription, targetAudience FROM users
         WHERE id > ? AND (
           (selectedNicheSlugs IS NOT NULL AND JSON_LENGTH(selectedNicheSlugs) > 0)
           OR (businessDescription IS NOT NULL AND TRIM(businessDescription) <> '')
           OR (targetAudience IS NOT NULL AND TRIM(targetAudience) <> '')
         )
         ORDER BY id ASC LIMIT ?`,
        [lastId, batchSize]
      )
    ).map<LegacyUserRow>(u => ({
      id: Number(u.id),
      selectedNicheSlugs: parseJsonArray(u.selectedNicheSlugs),
      businessDescription: u.businessDescription,
      targetAudience: u.targetAudience,
    }));
    if (users.length === 0) break;
    lastId = users[users.length - 1].id;
    result.batches++;

    const userIds = users.map(u => u.id);
    const memberships = await rows<MembershipRow>(
      conn,
      `SELECT workspaceId, userId FROM workspace_members WHERE userId IN (${inList(userIds.length)})`,
      userIds
    );
    const wsIds = [...new Set(memberships.map(m => m.workspaceId))];
    const workspaces = wsIds.length
      ? (
          await rows<{
            id: string;
            ownerUserId: number;
            isPersonal: number;
            deletedAt: Date | null;
          }>(
            conn,
            `SELECT id, ownerUserId, isPersonal, deletedAt FROM workspaces WHERE id IN (${inList(wsIds.length)})`,
            wsIds
          )
        ).map<WorkspaceRow>(w => ({
          ...w,
          ownerUserId: Number(w.ownerUserId),
          isPersonal: Boolean(w.isPersonal),
        }))
      : [];
    const profiles = wsIds.length
      ? await rows<ProfileRow>(
          conn,
          `SELECT id, workspaceId, status, deletedAt FROM social_profiles WHERE workspaceId IN (${inList(wsIds.length)})`,
          wsIds
        )
      : [];
    const profileIds = profiles.map(p => p.id);
    const items = profileIds.length
      ? await rows<ItemRow>(
          conn,
          `SELECT socialProfileId, kind, status FROM personalization_items WHERE socialProfileId IN (${inList(profileIds.length)})`,
          profileIds
        )
      : [];

    const plan = planLegacyBackfill({
      users,
      workspaces,
      memberships,
      profiles,
      items,
    });
    for (const k of Object.keys(result.counts) as Array<
      keyof BackfillPlan["counts"]
    >) {
      result.counts[k] += plan.counts[k];
    }
    result.ambiguous.push(
      ...plan.outcomes.filter(o =>
        [
          "no_personal_workspace",
          "multiple_personal_workspaces",
          "multiple_profiles_in_workspace",
        ].includes(o.outcome)
      )
    );

    if (
      !opts.execute ||
      (plan.profiles.length === 0 && plan.items.length === 0)
    )
      continue;

    await conn.query("START TRANSACTION");
    try {
      for (const p of plan.profiles) {
        const [r] = await conn.query(
          "INSERT IGNORE INTO social_profiles (id, workspaceId, platform, normalizedHandle, status, createdByUserId) VALUES (?, ?, NULL, NULL, 'unlinked', ?)",
          [p.id, p.workspaceId, p.createdByUserId]
        );
        result.inserted.profiles += Number(
          (r as { affectedRows?: number }).affectedRows ?? 0
        );
      }
      for (const i of plan.items) {
        const [r] = await conn.query(
          `INSERT IGNORE INTO personalization_items
            (id, workspaceId, socialProfileId, kind, payload, source, status, evidence, basedOnVersion, sortOrder, createdByUserId)
           VALUES (?, ?, ?, ?, ?, 'user_entered', 'confirmed', 'user_provided', 1, ?, ?)`,
          [
            i.id,
            i.workspaceId,
            i.socialProfileId,
            i.kind,
            JSON.stringify(i.payload),
            i.sortOrder,
            i.createdByUserId,
          ]
        );
        result.inserted.items += Number(
          (r as { affectedRows?: number }).affectedRows ?? 0
        );
      }
      await conn.query("COMMIT");
    } catch (err) {
      await conn.query("ROLLBACK");
      throw err;
    }

    // Reconcile: every planned row must now exist.
    if (plan.profiles.length) {
      const found = await rows<{ n: number }>(
        conn,
        `SELECT COUNT(*) AS n FROM social_profiles WHERE id IN (${inList(plan.profiles.length)})`,
        plan.profiles.map(p => p.id)
      );
      result.reconciliation.profilesMissing +=
        plan.profiles.length - Number(found[0].n);
    }
    if (plan.items.length) {
      const found = await rows<{ n: number }>(
        conn,
        `SELECT COUNT(*) AS n FROM personalization_items WHERE id IN (${inList(plan.items.length)})`,
        plan.items.map(i => i.id)
      );
      result.reconciliation.itemsMissing +=
        plan.items.length - Number(found[0].n);
    }
  }
  result.reconciliation.ok =
    result.reconciliation.profilesMissing === 0 &&
    result.reconciliation.itemsMissing === 0;
  return result;
}
