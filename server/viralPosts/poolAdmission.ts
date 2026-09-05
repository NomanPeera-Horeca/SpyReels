import type { AdaptedCandidate } from "./candidateAdapter";
import { VIRAL_SEED_POOL_PILLAR } from "./constants";
import {
  classifyCandidatePillars,
  type PillarClassification,
} from "./pillarClassify";
import { MIN_SEMANTIC_POOL_CONFIDENCE } from "./semanticPoolRelevance";

export type PoolAdmissionSpec = {
  platform: string;
  niche: string;
  pillar: string;
};

export type PoolAdmissionDecision = {
  admit: boolean;
  classification: PillarClassification;
  reason:
    | "admitted"
    | "insufficient_direct_pillar_evidence"
    | "semantic_pillar_mismatch"
    | "semantic_off_domain";
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

function semanticDirectClassification(candidate: AdaptedCandidate): {
  domainRelevant: boolean;
  primaryPillar: string | null;
  secondaryPillar: string | null;
  confidence: number;
  reason: string;
} | null {
  if (!isDirectInstagramDiscoveryCandidate(candidate)) return null;
  const raw = candidate.rawProviderPayload || {};
  if (!("semanticDomainRelevant" in raw)) return null;

  const primaryRaw = raw.semanticPrimaryPillar;
  const secondaryRaw = raw.semanticSecondaryPillar;
  const confidenceRaw = Number(raw.semanticPillarConfidence);
  return {
    domainRelevant: raw.semanticDomainRelevant === true,
    primaryPillar:
      typeof primaryRaw === "string" && primaryRaw.trim() ? primaryRaw.trim() : null,
    secondaryPillar:
      typeof secondaryRaw === "string" && secondaryRaw.trim()
        ? secondaryRaw.trim()
        : null,
    confidence: Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0,
    reason:
      typeof raw.semanticPillarReason === "string"
        ? raw.semanticPillarReason.trim()
        : "",
  };
}

/**
 * One source of truth for candidate-to-pool admission/classification.
 *
 * Direct Instagram discovery is pillar-specific. Once semantic routing exists,
 * that semantic result is authoritative for which restaurant pillar may count
 * the Reel as fresh inventory. Pre-semantic direct rows retain the deterministic
 * guard as a compatibility fallback. Featured and legacy sources keep their
 * existing behavior.
 */
export function classifyCandidateForPoolAdmission(args: {
  pool: PoolAdmissionSpec;
  candidate: AdaptedCandidate;
}): PoolAdmissionDecision {
  const { pool, candidate } = args;
  const assignPillar =
    pool.pillar === VIRAL_SEED_POOL_PILLAR ? pool.niche : pool.pillar;

  const semantic = semanticDirectClassification(candidate);
  if (semantic) {
    const classification: PillarClassification = {
      primaryPillar: semantic.primaryPillar || assignPillar,
      secondaryPillar: semantic.secondaryPillar,
      confidence: semantic.confidence,
      reason: semantic.reason || "Semantic restaurant pool classification",
    };

    if (!semantic.domainRelevant || !semantic.primaryPillar) {
      classification.confidence = Math.min(
        classification.confidence,
        MIN_SEMANTIC_POOL_CONFIDENCE - 0.01
      );
      classification.reason =
        semantic.reason || "Semantic judge marked Reel outside restaurant business content";
      return {
        admit: false,
        classification,
        reason: "semantic_off_domain",
      };
    }

    const matchesPool =
      semantic.primaryPillar === assignPillar ||
      semantic.secondaryPillar === assignPillar;
    if (!matchesPool || semantic.confidence < MIN_SEMANTIC_POOL_CONFIDENCE) {
      return {
        admit: false,
        classification,
        reason: "semantic_pillar_mismatch",
      };
    }

    return { admit: true, classification, reason: "admitted" };
  }

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
