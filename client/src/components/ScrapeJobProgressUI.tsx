import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  scrapeDashboardPath,
  scrapeDisplayPercent,
  scrapePhaseLabel,
  scrapeProgressDetail,
  type ScrapeProgressSnapshot,
} from "@shared/scrapeProgressUi";

export type ScrapeJobProgressVariant = "banner" | "sidebar" | "card" | "inline";

type ScrapeJobProgressUIProps = {
  snapshot: ScrapeProgressSnapshot;
  variant: ScrapeJobProgressVariant;
  className?: string;
  onOpen?: () => void;
  showBar?: boolean;
};

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ScrapeJobProgressUI({
  snapshot,
  variant,
  className,
  onOpen,
  showBar = true,
}: ScrapeJobProgressUIProps) {
  const handle = snapshot.handle ? `@${snapshot.handle.replace(/^@/, "")}` : "creator";
  const inFlight = snapshot.status === "running" || snapshot.status === "pending";
  const displayPct = scrapeDisplayPercent(snapshot.status, snapshot.progressPercent);
  const phase = scrapePhaseLabel(snapshot.currentStep, snapshot.status);
  const detail = scrapeProgressDetail(snapshot);

  if (variant === "sidebar") {
    const body = (
      <>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary group-data-[collapsible=icon]:hidden">
          {inFlight ? `Researching ${handle} · ${displayPct}%` : `Researching ${handle}`}
        </span>
      </>
    );

    const sharedClass =
      "mx-2 mb-2 flex w-[calc(100%-1rem)] flex-col gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-2 text-left transition hover:bg-primary/15 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0";

    if (onOpen) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className={cn(sharedClass, className)}
          title={detail}
        >
          <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center">
            {body}
          </div>
          {showBar ? (
            <ProgressBar
              percent={displayPct}
              className="group-data-[collapsible=icon]:hidden"
            />
          ) : null}
        </button>
      );
    }

    return (
      <div className={cn(sharedClass, className)} title={detail}>
        <div className="flex w-full items-center gap-2">{body}</div>
        {showBar ? <ProgressBar percent={displayPct} /> : null}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("space-y-1.5 pt-2", className)}>
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            {inFlight ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {phase}
          </span>
          <span>{displayPct}%</span>
        </div>
        {showBar ? <ProgressBar percent={displayPct} className="h-1" /> : null}
        {snapshot.reelsFound > 0 ? (
          <p className="text-[10px] text-muted-foreground">
            {snapshot.reelsFound} reel{snapshot.reelsFound === 1 ? "" : "s"} collected so far
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {inFlight ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
            <span>{detail}</span>
          </span>
        </div>
        {showBar ? <ProgressBar percent={displayPct} /> : null}
      </div>
    );
  }

  // banner (dashboard + home)
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground">
              {inFlight ? `Updating reels from ${handle}` : `Research on ${handle}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {snapshot.reelsFound > 0
                ? typeof snapshot.timeframeDays === "number"
                  ? `${snapshot.reelsFound} reels ready while we finish your last ${snapshot.timeframeDays} days. New posts appear automatically.`
                  : `${snapshot.reelsFound} reels ready. New posts appear automatically.`
                : phase}
            </p>
          </div>
          {showBar ? <ProgressBar percent={displayPct} /> : null}
          <p className="text-[11px] font-medium text-primary">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function openScrapeDashboard(
  setLocation: (path: string) => void,
  jobId: number,
  from = "research"
): void {
  setLocation(scrapeDashboardPath(jobId, from));
}
