import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { cn } from "@/lib/utils";

/** Single placeholder matching WorkspaceReelGridTile media + footer heights. */
export function WorkspaceReelGridSkeletonTile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "workspace-reel-card flex h-full flex-col overflow-hidden",
        className
      )}
      aria-hidden
    >
      <div className="relative aspect-[9/14] animate-pulse bg-muted" />
      <div className="flex min-h-[7.5rem] flex-1 flex-col px-2.5 pb-2.5 pt-2">
        <div className="min-h-6 shrink-0" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-[80%] animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-[70%] animate-pulse rounded bg-muted/80" />
        </div>
        <div className="mt-auto min-h-10 shrink-0 pt-2">
          <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

/** Grid of skeleton tiles using the same layout class as live reel grids. */
export function WorkspaceReelGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(WORKSPACE_REEL_GRID_CLASS, className)}
      role="status"
      aria-label="Loading reels"
    >
      {Array.from({ length: count }, (_, i) => (
        <WorkspaceReelGridSkeletonTile key={i} />
      ))}
    </div>
  );
}
