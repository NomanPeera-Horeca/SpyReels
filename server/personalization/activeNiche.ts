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
