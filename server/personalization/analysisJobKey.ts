import { createHash } from "node:crypto";
import type { SocialPlatform } from "@shared/personalization/model";
import {
  analysisInputFingerprint,
  profileAnalysisIdempotencyKey,
} from "@shared/personalization/state";

/**
 * Keys for a profile analysis job. Same profile + same account + same UTC day
 * gives the same key, and server/durableJobs/queue.ts enqueueDurableJob upserts
 * on durable_jobs.idempotencyKey, so repeated requests reuse one job.
 * profile_analysis_runs.idempotencyKey is UNIQUE too (second guard).
 */
export function profileAnalysisJobKeys(input: {
  socialProfileId: string;
  platform: SocialPlatform;
  normalizedHandle: string;
  platformAccountId: string | null;
  requestedAt: Date;
}): { inputHash: string; idempotencyKey: string } {
  const inputHash = createHash("sha256")
    .update(analysisInputFingerprint(input))
    .digest("hex")
    .slice(0, 32);
  return {
    inputHash,
    idempotencyKey: profileAnalysisIdempotencyKey(
      input.socialProfileId,
      inputHash
    ),
  };
}
