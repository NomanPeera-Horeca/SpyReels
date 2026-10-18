/**
 * Lifecycle rules for personalization history.
 *
 * Normal product flows NEVER delete history:
 * - Analysis runs are append-only. Retry = same run (durable job retries in
 *   place). Refresh = a new run. Failure = status "failed". Nothing is deleted.
 * - Regeneration supersedes old unconfirmed AI suggestions (status
 *   "superseded", kept). Confirmed and user-written values are never touched.
 * - Removing a profile = soft delete. Active selections are cleared first
 *   (the DB refuses the soft delete otherwise). History stays.
 *
 * The database backs this up: every FK between history tables is
 * ON DELETE RESTRICT, so a casual DELETE of a run, stage, profile or item that
 * something still references is refused.
 *
 * Full erasure (a verified data-deletion request) is the only way to remove
 * history. It is an explicit, audited ops procedure that deletes child rows
 * first, in exactly this order, inside one transaction, scoped to one
 * workspace. Never run it from product code.
 */
export const PERSONALIZATION_PURGE_ORDER = [
  "workspace_member_active_profiles",
  "personalization_items",
  "personalization_progress",
  "profile_analysis_stages",
  "profile_analysis_runs",
  "social_profiles",
] as const;

/** Soft-delete steps, in order, in one transaction. */
export const PROFILE_SOFT_DELETE_STEPS = [
  "delete_active_selections",
  "soft_delete_profile",
] as const;
