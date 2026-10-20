/**
 * Model call for one pillar's topic ideas. Used only by requestPillarSubtopics,
 * which runs on the user's explicit request. Errors are thrown; the job records them.
 */
import type { GoalPayload, PillarPayload } from "@shared/personalization/model";
import { buildCreatorEvidence } from "./intelligence/evidence";
import { recommendSubtopics } from "./intelligence/pillarRecommendations";
import { createRecommendationStore, type Db } from "./db/analysisStore";
import type { TopicGenerator } from "./subtopicJobs";

export function createPillarTopicGenerator(db: Db): TopicGenerator {
  return async ({ workspaceId, socialProfileId, pillarItemId }) => {
    const store = createRecommendationStore(db);
    const profile = await store.loadProfile(socialProfileId, workspaceId);
    if (!profile) throw new Error("profile_not_found");
    const items = await store.loadItems(profile.id);
    const pillar = items.find(i => i.id === pillarItemId && i.kind === "pillar");
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
    return { labels: extra.groups.flatMap(g => g.labels) };
  };
}
