/**
 * Creator Radar refreshes are reconciliation jobs, not incremental inserts.
 * Re-scan at least the creator's configured research window so an earlier
 * provider/pagination gap can heal on the next user-initiated refresh.
 */
export function getCreatorRadarReconciliationDays(
  configuredTimeframeDays: number,
  daysSinceLastSync: number
): number {
  const configured = Number.isFinite(configuredTimeframeDays)
    ? Math.max(1, Math.ceil(configuredTimeframeDays))
    : 90;
  const elapsed = Number.isFinite(daysSinceLastSync)
    ? Math.max(1, Math.ceil(daysSinceLastSync))
    : 1;

  return Math.max(configured, elapsed);
}
