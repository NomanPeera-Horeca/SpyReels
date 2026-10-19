/**
 * Generates topic labels for one live pillar. Used only by requestPillarSubtopics,
 * inside a claimed generation job. Nothing calls this automatically.
 */
import type { GoalPayload, PillarPayload } from "@shared/personalization/model";
import { buildCreatorEvidence } from "./intelligence/evidence";
import { recommendSubtopics } from "./intelligence/pillarRecommendations";
import { createRecommendationStore, type Db } from "./db/analysisStore";
import { normalizeTopicLabel } from "./subtopics";

export async function generatePillarTopics(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; pillarItemId: string }
): Promise<{ title: string; labels: string[] }> {
  const store = createRecommendationStore(db);
  const profile = await store.loadProfile(input.socialProfileId, input.workspaceId);
  if (!profile) throw new Error("profile_not_found");
  const items = await store.loadItems(profile.id);
  const pillar = items.find(
    i => i.id === input.pillarItemId && i.kind === "pillar" && (i.status === "suggested" || i.status === "confirmed")
  );
  if (!pillar) throw new Error("pillar_not_found");
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
  const extra = await recommendSubtopics({
    evidence,
    confirmedGoal: goal,
    pillars: [{ title: payload.title, description: payload.description }],
    timeoutMs: 12_000,
  });
  const key = normalizeTopicLabel(payload.title);
  const group = extra.groups.find(g => normalizeTopicLabel(g.title) === key) ?? extra.groups[0];
  return { title: payload.title, labels: group?.labels ?? [] };
}
