/**
 * Read-only confirmed inventory for the daily feed. A missing table or a
 * profile with no stored category returns null so the legacy feed stays as it
 * is. This does not create a progress row.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import {
  personalizationItems,
  socialProfiles,
  workspaceMemberActiveProfiles,
} from "../../../drizzle/personalizationSchema";

export type StoredContentInventory = {
  categoryLabel: string;
  nicheLabel: string;
  pillarTitles: string[];
  goalText: string | null;
  audienceText: string | null;
};

function field(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function loadStoredContentInventory(
  userId: number
): Promise<StoredContentInventory | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const active = await db
      .select({ profileId: socialProfiles.id })
      .from(workspaceMemberActiveProfiles)
      .innerJoin(
        socialProfiles,
        and(
          eq(socialProfiles.id, workspaceMemberActiveProfiles.socialProfileId),
          eq(socialProfiles.workspaceId, workspaceMemberActiveProfiles.workspaceId)
        )
      )
      .where(
        and(
          eq(workspaceMemberActiveProfiles.userId, userId),
          isNull(socialProfiles.deletedAt)
        )
      )
      .orderBy(desc(workspaceMemberActiveProfiles.updatedAt))
      .limit(1);
    const profileId = active[0]?.profileId;
    if (!profileId) return null;
    const items = await db
      .select({
        kind: personalizationItems.kind,
        payload: personalizationItems.payload,
        sortOrder: personalizationItems.sortOrder,
      })
      .from(personalizationItems)
      .where(
        and(
          eq(personalizationItems.socialProfileId, profileId),
          eq(personalizationItems.status, "confirmed"),
          inArray(personalizationItems.kind, ["niche", "goal", "audience", "pillar"])
        )
      )
      .orderBy(personalizationItems.sortOrder, personalizationItems.createdAt);
    const niche = items.find((item) => item.kind === "niche");
    const categoryLabel = field(niche?.payload, "categoryLabel");
    if (!categoryLabel) return null;
    const goal = items.find((item) => item.kind === "goal");
    const audiences = items
      .filter((item) => item.kind === "audience")
      .map((item) => field(item.payload, "who"))
      .filter(Boolean);
    const pillarTitles = items
      .filter((item) => item.kind === "pillar")
      .map((item) => field(item.payload, "title"))
      .filter(Boolean);
    return {
      categoryLabel,
      nicheLabel: field(niche?.payload, "label"),
      pillarTitles,
      goalText: field(goal?.payload, "text") || null,
      audienceText: audiences.length ? audiences.join(". ") : null,
    };
  } catch (error) {
    console.warn(
      "[personalization] stored category unavailable",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
