/**
 * Read-only bridge for the viral library topic matcher
 * (server/viralPosts/topics.ts). Returns each creator profile's CONFIRMED
 * niche, pillars and live sub-topics, newest strategy first.
 *
 * Never writes, never reads suggested or dismissed items, and returns only
 * the strategy text needed to match topics (no bio, posts, goal or audience).
 * A missing table returns an empty list.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../db";
import { personalizationItems, pillarSubtopics } from "../../../drizzle/personalizationSchema";
import { resolveContentCategory } from "@shared/personalization/contentTaxonomy";

export type ConfirmedTopicStrategy = {
  socialProfileId: string;
  workspaceId: string;
  category: string;
  niche: string;
  pillars: string[];
  subtopics: string[];
};

function field(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function listConfirmedTopicStrategies(limit: number): Promise<ConfirmedTopicStrategy[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const niches = await db
      .select({
        socialProfileId: personalizationItems.socialProfileId,
        workspaceId: personalizationItems.workspaceId,
        payload: personalizationItems.payload,
      })
      .from(personalizationItems)
      .where(and(eq(personalizationItems.kind, "niche"), eq(personalizationItems.status, "confirmed")))
      .orderBy(desc(personalizationItems.updatedAt))
      .limit(Math.max(1, Math.min(5_000, limit)));
    const ids = [...new Set(niches.map(n => n.socialProfileId))];
    if (ids.length === 0) return [];
    const [pillars, subs] = await Promise.all([
      db
        .select({
          socialProfileId: personalizationItems.socialProfileId,
          workspaceId: personalizationItems.workspaceId,
          payload: personalizationItems.payload,
        })
        .from(personalizationItems)
        .where(
          and(
            inArray(personalizationItems.socialProfileId, ids),
            eq(personalizationItems.kind, "pillar"),
            eq(personalizationItems.status, "confirmed")
          )
        ),
      db
        .select({
          socialProfileId: pillarSubtopics.socialProfileId,
          workspaceId: pillarSubtopics.workspaceId,
          label: pillarSubtopics.label,
        })
        .from(pillarSubtopics)
        .where(and(inArray(pillarSubtopics.socialProfileId, ids), ne(pillarSubtopics.status, "dismissed"))),
    ]);
    const seen = new Set<string>();
    const out: ConfirmedTopicStrategy[] = [];
    for (const n of niches) {
      if (seen.has(n.socialProfileId)) continue;
      seen.add(n.socialProfileId);
      const sameProfile = (row: { socialProfileId: string; workspaceId: string }) =>
        row.socialProfileId === n.socialProfileId && row.workspaceId === n.workspaceId;
      const categoryLabel = field(n.payload, "categoryLabel");
      out.push({
        socialProfileId: n.socialProfileId,
        workspaceId: n.workspaceId,
        category: resolveContentCategory(categoryLabel)?.label ?? categoryLabel,
        niche: field(n.payload, "label"),
        pillars: pillars.filter(sameProfile).map(p => field(p.payload, "title")).filter(Boolean),
        subtopics: subs.filter(sameProfile).map(s => s.label),
      });
    }
    return out;
  } catch (error) {
    console.warn(
      "[personalization] topic strategies unavailable",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}
