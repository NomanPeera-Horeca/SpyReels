/** Reels above this count prompt for export scope (top 30 vs all). */
export const EXPORT_SCOPE_PROMPT_MIN_REELS = 31;

/** Max reels included in a top-viral scoped export. */
export const EXPORT_TOP_VIRAL_COUNT = 30;

export const EXPORT_SCOPES = ["all", "top_viral_30"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export function exportScopeNeedsPrompt(reelCount: number): boolean {
  return reelCount >= EXPORT_SCOPE_PROMPT_MIN_REELS;
}

export function resolveExportScope(
  reelCount: number,
  requested: ExportScope
): ExportScope {
  if (!exportScopeNeedsPrompt(reelCount)) return "all";
  return requested;
}

export function exportScopeLabel(scope: ExportScope): string {
  if (scope === "top_viral_30") return "Top 30 viral reels";
  return "All reels";
}
