import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LOADING_TIPS } from "@/data/loadingTips";
import { toast } from "sonner";
import {
  normalizeInstagramHandle,
  isValidInstagramHandleNormalized,
  INSTAGRAM_HANDLE_INVALID_MESSAGE,
} from "@shared/instagramHandle";
import { navigateAppReplace, resolveFromParamFallback } from "@shared/appNavigation";
import { useAppBack } from "@/hooks/useAppBack";
import { formatNumber } from "@/components/InlineWorkflow";
import { ScrapeJobProgressUI } from "@/components/ScrapeJobProgressUI";
import {
  navigateAfterScrapeStart,
  navigateWhenReelsReady,
} from "@/lib/scrapeNavigation";
import {
  snapshotFromProgressRow,
  scrapeDashboardPath,
} from "@shared/scrapeProgressUi";

export default function ScrapingProgress() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const jobId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const id = params.get("jobId");
    return id ? parseInt(id, 10) : null;
  }, [searchString]);
  const fromParam = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("from") ?? "research";
  }, [searchString]);

  // If someone lands here without a jobId, bounce them to /research.
  useEffect(() => {
    if (jobId === null) navigateAppReplace(setLocation, "/research");
  }, [jobId, setLocation]);

  const handleBack = useAppBack(resolveFromParamFallback(fromParam));

  const progressQuery = trpc.scrape.progress.useQuery(
    { jobId: jobId! },
    {
      enabled: jobId !== null,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 1500;
        if (data.status === "completed" || data.status === "failed") return false;
        return 1500;
      },
      refetchOnWindowFocus: false,
    }
  );

  const data = progressQuery.data;
  const status = data?.status;
  const reelsFound = data?.reelsFound ?? 0;
  const handle = data?.handle ?? "";
  const errorMessage = data?.errorMessage ?? null;

  // Redirect on success (replace so back from dashboard skips this loading screen).
  useEffect(() => {
    if (status === "completed") {
      const t = setTimeout(
        () =>
          navigateAppReplace(
            setLocation,
            `/dashboard?jobId=${jobId}&from=${fromParam}`
          ),
        400
      );
      return () => clearTimeout(t);
    }
  }, [status, jobId, fromParam, setLocation]);

  // User-controlled tips while waiting (no auto-rotate carousel).
  const tips = useMemo(() => [...LOADING_TIPS], []);
  const [tipIndex, setTipIndex] = useState(0);

  const partialReelsQuery = trpc.reels.list.useQuery(
    { jobId: jobId! },
    {
      enabled: jobId !== null && status !== "completed" && status !== "failed",
      refetchInterval: status === "running" || status === "pending" ? 2000 : false,
      refetchOnWindowFocus: false,
    }
  );

  const partialReels = partialReelsQuery.data?.reels ?? [];

  // Send users to the live dashboard as soon as we have enough reels to explore.
  useEffect(() => {
    if (jobId == null || status === "completed" || status === "failed") return;
    const count = Math.max(reelsFound, partialReels.length);
    navigateWhenReelsReady({
      jobId,
      reelsFound: count,
      from: fromParam,
      setLocation,
      replace: true,
    });
  }, [jobId, status, reelsFound, partialReels.length, fromParam, setLocation]);

  const goPrevTip = () => {
    setTipIndex((i) => (i - 1 + tips.length) % tips.length);
  };
  const goNextTip = () => {
    setTipIndex((i) => (i + 1) % tips.length);
  };

  // Retry: kick off a new scrape with the same handle / timeframe.
  const retryMutation = trpc.scrape.start.useMutation({
    onSuccess: (d) => {
      navigateAfterScrapeStart(d, setLocation, "research");
    },
    onError: (err) => {
      if (err.data?.code === "TOO_MANY_REQUESTS") {
        toast.error("Too many scrapes running right now", {
          description: "Try again in a few minutes.",
        });
        return;
      }
      toast.error("Could not start again", { description: err.message });
    },
  });

  const cancelMutation = trpc.scrape.cancel.useMutation({
    onSuccess: async () => {
      await progressQuery.refetch();
    },
    onError: (err) => {
      toast.error("Could not cancel", { description: err.message });
    },
  });

  const handleRetry = () => {
    if (!data) return;
    const n = normalizeInstagramHandle(data.handle);
    if (!isValidInstagramHandleNormalized(n)) {
      toast.error(INSTAGRAM_HANDLE_INVALID_MESSAGE);
      return;
    }
    retryMutation.mutate({
      handle: n,
      timeframeDays: data.timeframeDays,
    });
  };

  const handleCancel = () => {
    if (jobId == null || cancelMutation.isPending) return;
    cancelMutation.mutate({ jobId });
  };

  const handleBackToResearch = () => handleBack();

  const canCancel =
    status === "running" ||
    status === "pending" ||
    (data?.currentStep != null &&
      ["connecting", "fetching_profile", "pulling_reels", "ranking"].includes(
        data.currentStep
      ));

  if (progressQuery.isError) {
    return (
      <ErrorState
        title="We could not load this job"
        message={progressQuery.error.message}
        onBack={handleBackToResearch}
      />
    );
  }

  if (status === "failed") {
    return (
      <ErrorState
        title={`Could not load @${handle}`}
        message={errorMessage || "Something went wrong while pulling this account's reels."}
        onBack={handleBackToResearch}
        onRetry={handleRetry}
        retryPending={retryMutation.isPending}
      />
    );
  }

  const displayHandle = handle ? `@${handle}` : "your account";
  const progressSnapshot =
    data && jobId != null
      ? snapshotFromProgressRow(data, jobId)
      : null;
  const readyCount = Math.max(reelsFound, partialReels.length);

  const handleBrowseFeatured = () => {
    navigateAppReplace(setLocation, "/research#featured-creators");
  };

  const statusLine =
    reelsFound > 0
      ? `${reelsFound} reel${reelsFound === 1 ? "" : "s"} found`
      : "Collecting and ranking reels...";

  return (
    <div className="mx-auto max-w-lg px-3 sm:px-0 pt-4 sm:pt-8 md:pt-12 pb-16">
      <p className="mb-4 text-center text-xs text-muted-foreground">
        Step 2 of 3 · Collecting reels
      </p>

      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Pulling Reels from {displayHandle}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Instagram can take 1 to 3 minutes. Large accounts take longer.
        </p>
        <p className="mt-3 mx-auto max-w-md text-sm text-foreground/85">
          When done, you will land on a ranked list of their top Reels. Pick any
          to transcribe or remake in your voice.
        </p>
      </div>

      <div className="mt-8 space-y-2">
        {progressSnapshot ? (
          <ScrapeJobProgressUI snapshot={progressSnapshot} variant="inline" />
        ) : (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/40" />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{statusLine}</span>
          {canCancel && jobId != null ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
            </button>
          ) : null}
        </div>
      </div>

      {readyCount > 0 && jobId != null ? (
        <div className="mt-4">
          <Button
            type="button"
            className="w-full"
            onClick={() => setLocation(scrapeDashboardPath(jobId, fromParam))}
          >
            Watch reels now ({readyCount} ready)
          </Button>
        </div>
      ) : null}

      {readyCount > 0 ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
            <p className="text-xs font-medium text-foreground">Reels as they arrive</p>
            <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-400">
              Live
            </span>
          </div>
          <ul className="max-h-36 divide-y divide-border/40 overflow-hidden">
            {partialReels.slice(0, 5).map((reel) => (
              <li
                key={reel.id}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
              >
                <div className="h-8 w-5 shrink-0 rounded bg-muted" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {reel.caption?.trim() || "Reel collected"}
                </span>
                {reel.viewCount > 0 ? (
                  <span className="shrink-0 text-muted-foreground">
                    {formatNumber(reel.viewCount)}
                  </span>
                ) : null}
              </li>
            ))}
            {partialReels.length === 0 && reelsFound > 0 ? (
              <li className="px-4 py-2.5 text-xs text-muted-foreground">
                {reelsFound} reels collected, loading previews...
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Learn while you wait
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goPrevTip}
              aria-label="Previous tip"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-[10px] text-muted-foreground">
              {tipIndex + 1} / {tips.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goNextTip}
              aria-label="Next tip"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground">{tips[tipIndex]}</p>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-card/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">Do not want to wait?</p>
        <button
          type="button"
          onClick={handleBrowseFeatured}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          Browse creators we already researched →
        </button>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Your spy session keeps running in the background
        </p>
      </div>

      <div className="mt-8 text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToResearch}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */

function ErrorState({
  title,
  message,
  onBack,
  onRetry,
  retryPending,
}: {
  title: string;
  message: string;
  onBack: () => void;
  onRetry?: () => void;
  retryPending?: boolean;
}) {
  return (
    <div className="mx-auto max-w-lg px-3 sm:px-0 pt-4 sm:pt-8 md:pt-20 pb-16">
      <div className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Research
          </Button>
          {onRetry && (
            <Button onClick={onRetry} disabled={retryPending}>
              {retryPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
