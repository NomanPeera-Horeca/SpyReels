/**
 * Wires coachProfileResolver (tested, pure) to the database for the Agent and
 * 30-Day Plan: the member's active profile in this workspace, its items and
 * version. Also returns the confirmed goals and pillars, which the resolver's
 * profile shape has no field for (they are added to the brand description).
 * Never throws: null means "use the old fields only".
 */
import { and, eq } from "drizzle-orm";
import {
  personalizationItems,
  personalizationProgress,
  socialProfiles,
  workspaceMemberActiveProfiles,
} from "../../drizzle/personalizationSchema";
import { getDb } from "../db";
import { toItemRecord } from "./db/rows";
import {
  resolveCoachPersonalization,
  type CoachProfileResolution,
  type LegacyCoachState,
  type ScopedItem,
} from "./coachProfileResolver";

export type CoachPersonalization = {
  resolution: CoachProfileResolution;
  goals: string[];
  pillars: string[];
};

/** Confirmed goal texts and pillar titles, in screen order. Pure; exported for tests. */
export function confirmedGoalsAndPillars(items: readonly ScopedItem[]): { goals: string[]; pillars: string[] } {
  const confirmed = items
    .filter(i => i.status === "confirmed")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    goals: confirmed.filter(i => i.kind === "goal").map(i => text((i.payload as { text?: unknown }).text)).filter(Boolean),
    pillars: confirmed.filter(i => i.kind === "pillar").map(i => text((i.payload as { title?: unknown }).title)).filter(Boolean),
  };
}

/**
 * Brand description the Agent writes for: confirmed goal(s) and pillars first,
 * then whatever the resolver chose (confirmed brand text or the old field).
 * Pure; exported for tests.
 */
export function coachBrandDescription(
  base: string | null,
  goals: readonly string[],
  pillars: readonly string[]
): string | null {
  const parts = [
    goals.length ? `Goal: ${goals.slice(0, 2).join(" ")}` : "",
    pillars.length ? `Content pillars: ${pillars.slice(0, 5).join("; ")}.` : "",
    base?.trim() ?? "",
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

export async function loadCoachPersonalization(
  userId: number,
  workspaceId: string,
  legacy: LegacyCoachState
): Promise<CoachPersonalization | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [active] = await db
      .select({ socialProfileId: workspaceMemberActiveProfiles.socialProfileId })
      .from(workspaceMemberActiveProfiles)
      .where(and(eq(workspaceMemberActiveProfiles.userId, userId), eq(workspaceMemberActiveProfiles.workspaceId, workspaceId)))
      .limit(1);
    if (!active) return null;
    const [profile] = await db
      .select({ id: socialProfiles.id, workspaceId: socialProfiles.workspaceId, deletedAt: socialProfiles.deletedAt })
      .from(socialProfiles)
      .where(eq(socialProfiles.id, active.socialProfileId))
      .limit(1);
    if (!profile) return null;
    const rows = await db
      .select()
      .from(personalizationItems)
      .where(
        and(
          eq(personalizationItems.socialProfileId, profile.id),
          eq(personalizationItems.workspaceId, workspaceId)
        )
      );
    const [progress] = await db
      .select({ version: personalizationProgress.personalizationVersion })
      .from(personalizationProgress)
      .where(eq(personalizationProgress.socialProfileId, profile.id))
      .limit(1);
    const items: ScopedItem[] = rows.map(r => ({
      ...toItemRecord(r),
      socialProfileId: r.socialProfileId,
      workspaceId: r.workspaceId,
      sortOrder: r.sortOrder,
    }));
    const resolution = resolveCoachPersonalization({
      workspaceId,
      legacy,
      activeProfile: { id: profile.id, workspaceId: profile.workspaceId ?? "", deletedAt: profile.deletedAt },
      items,
      personalizationVersion: progress?.version ?? 1,
    });
    return { resolution, ...confirmedGoalsAndPillars(items) };
  } catch (err) {
    console.warn("[coach] personalization_unavailable", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
    return null;
  }
}
