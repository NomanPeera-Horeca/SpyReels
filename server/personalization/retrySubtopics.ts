/**
 * Fills subtopics for one saved pillar. Does not rewrite the pillar.
 * Dismissed labels are skipped by saveGeneratedSubtopics.
 */
import type { GoalPayload, PillarPayload } from "@shared/personalization/model";
import { buildCreatorEvidence } from "./intelligence/evidence";
import { recommendSubtopics } from "./intelligence/pillarRecommendations";
import { IntelligenceError } from "./intelligence/structuredLlm";
import { createRecommendationStore, type Db } from "./db/analysisStore";
import { saveGeneratedSubtopics } from "./subtopics";

export async function retryPillarSubtopics(
  db: Db,
  input: {
    workspaceId: string;
    socialProfileId: string;
    pillarItemId: string;
  }
): Promise<{ ok: true; inserted: number } | { ok: false; reason: "not_found" | "failed" }> {
  const store = createRecommendationStore(db);
  const profile = await store.loadProfile(input.socialProfileId, input.workspaceId);
  if (!profile) return { ok: false, reason: "not_found" };
  const items = await store.loadItems(profile.id);
  const pillar = items.find(
    i =>
      i.id === input.pillarItemId &&
      i.kind === "pillar" &&
      (i.status === "suggested" || i.status === "confirmed")
  );
  if (!pillar) return { ok: false, reason: "not_found" };
  const payload = pillar.payload as PillarPayload;
  const goal = items
    .filter(i => i.kind === "goal" && i.status === "confirmed")
    .map(i => (i.payload as GoalPayload).text)
    .join(" ");
  const snapshot = await store.loadLatestSnapshot(profile.id);
  const evidence = buildCreatorEvidence({
    platform: profile.platform,
    displayName: profile.displayName,
    bio: profile.bio,
    snapshot,
    items,
  });
  try {
    const extra = await recommendSubtopics({
      evidence,
      confirmedGoal: goal,
      pillars: [{ title: payload.title, description: payload.description }],
      timeoutMs: 12_000,
    });
    const inserted = await saveGeneratedSubtopics(db, {
      workspaceId: input.workspaceId,
      socialProfileId: profile.id,
      groups: extra.groups.map(g => ({
        title: g.title,
        labels: g.labels,
        pillarHash: pillar.basedOnInputsHash ?? "retry",
      })),
    });
    return { ok: true, inserted };
  } catch (err) {
    if (err instanceof IntelligenceError) return { ok: false, reason: "failed" };
    throw err;
  }
}
