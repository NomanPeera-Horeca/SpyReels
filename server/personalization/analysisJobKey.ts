import { createHash } from "node:crypto";
import {
  analysisRequestFingerprint,
  profileAnalysisIdempotencyKey,
} from "@shared/personalization/state";

/**
 * Keys for ONE logical profile analysis request (see analysisRequestFingerprint).
 *
 * Duplicate prevention, three layers:
 * 1. durable_jobs.idempotencyKey is UNIQUE and server/durableJobs/queue.ts
 *    enqueueDurableJob upserts on it: re-enqueueing the same request never
 *    creates a second job. A failed/dead job is requeued in place (automatic
 *    retry of the same request). A succeeded job is NOT re-run (no
 *    requeueIfTerminal), so reloads after success cost nothing.
 * 2. profile_analysis_runs.idempotencyKey is UNIQUE: one run row per request.
 * 3. profile_analysis_runs.activeProfileSlot is UNIQUE: at most one queued or
 *    running analysis per profile at any moment, whatever the request kind.
 *
 * A legitimate refresh uses a NEW key (next refresh sequence), so it is never
 * blocked by an old one. It is limited by cooldown and usage instead.
 */
export function profileAnalysisJobKeys(
  input: Parameters<typeof analysisRequestFingerprint>[0]
): { inputHash: string; idempotencyKey: string } {
  const inputHash = createHash("sha256")
    .update(analysisRequestFingerprint(input))
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
