import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { ScrapeListJob } from "@/lib/activeScrapeJob";

type ActiveScrapeJobNoticeProps = {
  job: ScrapeListJob;
  variant?: "banner" | "sidebar";
};

export function ActiveScrapeJobNotice({
  job,
  variant = "banner",
}: ActiveScrapeJobNoticeProps) {
  const [, setLocation] = useLocation();
  const handle = job.handle ? `@${job.handle}` : "creator";

  const openProgress = () => {
    setLocation(`/scraping?jobId=${job.id}&from=research`);
  };

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={openProgress}
        className="mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-2 text-left transition hover:bg-primary/15 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        title={`Researching ${handle}`}
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary group-data-[collapsible=icon]:hidden">
          Researching {handle}
        </span>
      </button>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Research in progress
          </p>
          <p className="mt-1 font-medium text-foreground">
            Researching {handle}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your spy session is running. View progress or wait for it to finish.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 gap-2 border border-border/60"
          onClick={openProgress}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          View progress
        </Button>
      </div>
    </div>
  );
}
