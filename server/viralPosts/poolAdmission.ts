import type { AdaptedCandidate } from "./candidateAdapter";
import { VIRAL_SEED_POOL_PILLAR } from "./constants";
import {
  classifyCandidatePillars,
  type PillarClassification,
} from "./pillarClassify";

export type PoolAdmissionSpec = {
  platform: string;
  niche: string;
  pillar: string;
};

export type PoolAdmissionDecision = {
  admit: boolean;
  classification: PillarClassification;
  reason: "admitted" | "insufficient_direct_pillar_evidence";
};

function providerSource(candidate: AdaptedCandidate): string {
  const raw = candidate.rawProviderPayload?.source;
  return typeof raw === "string" ? raw : "";
}

function isFeaturedCatalogCandidate(candidate: AdaptedCandidate): boolean {
  return providerSource(candidate) === "featured_catalog";
}

function isDirectInstagramDiscoveryCandidate(candidate: AdaptedCandidate): boolean {
  return providerSource(candidate) === "instagram_pool_discovery";
}

/**
 * One source of truth for candidate-to-pool admission/classification.
 *
 * Direct Instagram discovery is pillar-specific. A Reel that is viral but has
 * no real evidence for the target pillar must not be linked merely because it
 * was discovered while refreshing that pool; otherwise it counts as fresh
 * inventory and can stop future discovery even though Today would reject it.
 *
 * Featured remains transferable by design, and legacy provider sources keep
 * their previous low-confidence assignment behavior for compatibility.
 */
export function classifyCandidateForPoolAdmission(args: {
  pool: PoolAdmissionSpec;
  candidate: AdaptedCandidate;
}): PoolAdmissionDecision {
  const { pool, candidate } = args;
  const assignPillar =
    pool.pillar === VIRAL_SEED_POOL_PILLAR ? pool.niche : pool.pillar;

  const classification = classifyCandidatePillars({
    caption: candidate.caption,
    hook: candidate.hook,
    hashtags: candidate.hashtags,
    activePillars: [assignPillar],
    fallbackNiche: pool.niche,
  });

  if (classification.confidence >= 0.5) {
    return { admit: true, classification, reason: "admitted" };
  }

  classification.primaryPillar = assignPillar;

  if (isFeaturedCatalogCandidate(candidate)) {
    const rawConfidence = Number(
      candidate.rawProviderPayload?.classificationConfidence ??
        classification.confidence
    );
    classification.confidence = Number.isFinite(rawConfidence)
      ? Math.max(0.35, Math.min(0.49, rawConfidence))
      : 0.35;
    classification.reason =
      candidate.relevanceReason ||
      `Transferable Featured format for ${assignPillar}`;
    return { admit: true, classification, reason: "admitted" };
  }

  if (isDirectInstagramDiscoveryCandidate(candidate)) {
    classification.reason =
      `Insufficient direct pillar evidence for ${assignPillar}; not linked to pool`;
    return {
      admit: false,
      classification,
      reason: "insufficient_direct_pillar_evidence",
    };
  }

  // Preserve legacy behavior for TikTok/YouTube/older provider sources in this
  // focused milestone. Revisit those sources separately with their own evals.
  classification.reason = `Assigned to pool ${pool.platform}/${assignPillar}`;
  classification.confidence = 0.55;
  return { admit: true, classification, reason: "admitted" };
}
