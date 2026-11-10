/**
 * The signed-in member's active niche, when onboarding has stored one.
 * A database miss returns undefined so legacy callers keep their current path.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  personalizationItems,
  workspaceMemberActiveProfiles,
} from "../../drizzle/personalizationSchema";
import type { NichePayload } from "@shared/personalization/model";
import { getDb } from "../db";

export async function loadActiveNichePayload(userId: number): Promise<NichePayload | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;
    const rows = await db
      .select({
        payload: personalizationItems.payload,
        status: personalizationItems.status,
      })
      .from(workspaceMemberActiveProfiles)
      .innerJoin(
        personalizationItems,
        and(
          eq(personalizationItems.socialProfileId, workspaceMemberActiveProfiles.socialProfileId),
          eq(personalizationItems.workspaceId, workspaceMemberActiveProfiles.workspaceId),
          eq(personalizationItems.kind, "niche"),
          inArray(personalizationItems.status, ["confirmed", "suggested"])
        )
      )
      .where(eq(workspaceMemberActiveProfiles.userId, userId))
      .limit(8);
    const row = rows.find(item => item.status === "confirmed") ?? rows[0];
    if (!row) return undefined;
    return row.payload as NichePayload;
  } catch {
    return undefined;
  }
}

export type ActiveCreatorBasics = { nicheLabel: string | null; audience: string | null };

/** "who, wants to outcome" from a confirmed audience payload. Pure; exported for tests. */
export function audienceLine(payload: unknown): string | null {
  const p = (payload ?? {}) as { who?: unknown; outcome?: unknown };
  const who = typeof p.who === "string" ? p.who.trim() : "";
  if (!who) return null;
  const outcome = typeof p.outcome === "string" ? p.outcome.trim() : "";
  return outcome ? `${who}, wants to ${outcome}` : who;
}

/**
 * Niche and audience the creator confirmed in the NEW onboarding (active
 * profile). Used where older code only read the old onboarding fields
 * (businessDescription / targetAudience), so new-onboarding creators are not
 * asked for their niche again and remakes can adapt to it. Read-only, confirmed
 * rows only, scoped to the signed-in member and the selected workspace. Never throws.
 */
export async function loadActiveCreatorBasics(userId: number, workspaceId: string): Promise<ActiveCreatorBasics> {
  try {
    const db = await getDb();
    if (!db) return { nicheLabel: null, audience: null };
    const rows = await db
      .select({ kind: personalizationItems.kind, payload: personalizationItems.payload })
      .from(workspaceMemberActiveProfiles)
      .innerJoin(
        personalizationItems,
        and(
          eq(personalizationItems.socialProfileId, workspaceMemberActiveProfiles.socialProfileId),
          eq(personalizationItems.workspaceId, workspaceMemberActiveProfiles.workspaceId),
          inArray(personalizationItems.kind, ["niche", "audience"]),
          eq(personalizationItems.status, "confirmed")
        )
      )
      .where(
        and(
          eq(workspaceMemberActiveProfiles.userId, userId),
          eq(workspaceMemberActiveProfiles.workspaceId, workspaceId)
        )
      )
      .limit(12);
    const niche = rows.find(r => r.kind === "niche")?.payload as { label?: unknown } | undefined;
    const nicheLabel = typeof niche?.label === "string" && niche.label.trim() ? niche.label.trim() : null;
    const audience = rows.filter(r => r.kind === "audience").map(r => audienceLine(r.payload)).find(Boolean) ?? null;
    return { nicheLabel, audience };
  } catch {
    return { nicheLabel: null, audience: null };
  }
}
