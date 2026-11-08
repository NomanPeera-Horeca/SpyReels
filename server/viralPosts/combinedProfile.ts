/**
 * One picture of the creator across their profiles.
 *
 * A creator can add Instagram, TikTok and YouTube. Each profile has its own
 * onboarding (niche, audience, pillars, matched topics). When
 * COMBINE_PROFILES=on, Home ranks with the active profile's niche plus the
 * pillars, sub-topics, audiences, goals, languages and topics of the
 * creator's other profiles, so every channel they confirmed counts.
 *
 * Only profiles in the same PERSONAL workspace are combined: a team workspace
 * can hold different brands (an agency's clients), which must stay separate.
 * Off by default.
 */
import { sql } from "drizzle-orm";
import type { getDb } from "../db";
import type { RelevanceAudience, RelevanceProfile } from "./relevanceRanking";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function combineProfilesEnabled(): boolean {
  return process.env.COMBINE_PROFILES === "on";
}

/** Caps so a creator with many profiles does not drown the active one. */
const MAX_PILLARS = 12;
const MAX_SUBTOPICS = 60;
const MAX_AUDIENCES = 8;
const MAX_GOALS = 8;

function uniqueText(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The active profile first, then the others: niche, category and id stay the
 * active profile's; everything else is the de-duplicated union. Pure; exported
 * for tests.
 */
export function mergeRelevanceProfiles(primary: RelevanceProfile, others: RelevanceProfile[]): RelevanceProfile {
  if (others.length === 0) return primary;
  const all = [primary, ...others];
  const audiences: RelevanceAudience[] = [];
  const seenAudience = new Set<string>();
  for (const a of all.flatMap(p => p.audiences)) {
    const key = a.who.trim().toLowerCase();
    if (!key || seenAudience.has(key)) continue;
    seenAudience.add(key);
    audiences.push(a);
    if (audiences.length >= MAX_AUDIENCES) break;
  }
  return {
    ...primary,
    pillars: uniqueText(all.flatMap(p => p.pillars), MAX_PILLARS),
    subtopics: uniqueText(all.flatMap(p => p.subtopics), MAX_SUBTOPICS),
    audiences,
    goals: uniqueText(all.flatMap(p => p.goals), MAX_GOALS),
    languages: uniqueText(all.flatMap(p => p.languages), 6),
    topicSlugs: new Set(all.flatMap(p => [...p.topicSlugs])),
    embedding: null,
  };
}

/** The creator's other live profiles in the same personal workspace. */
export async function siblingProfileIds(db: Db, socialProfileId: string): Promise<string[]> {
  const [rows] = (await db.execute(sql`
    SELECT s2.id AS id
    FROM social_profiles s1
    JOIN workspaces w ON w.id = s1.workspaceId AND w.isPersonal = 1
    JOIN social_profiles s2 ON s2.workspaceId = s1.workspaceId AND s2.id <> s1.id AND s2.deletedAt IS NULL
    WHERE s1.id = ${socialProfileId}
    ORDER BY s2.createdAt
    LIMIT 5
  `)) as unknown as [Array<{ id: string }>];
  return (rows ?? []).map(r => String(r.id));
}
