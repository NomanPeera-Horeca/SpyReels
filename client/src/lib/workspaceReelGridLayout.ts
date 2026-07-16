/** Shared responsive grid for workspace reel tiles (Dashboard, Collected, Saved).
 * Phones stay 1 column so primary CTAs remain thumb-friendly (~390–430px). */
export const WORKSPACE_REEL_GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-stretch";

export function formatWorkspaceReelDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
  }
  return `${seconds}s`;
}
