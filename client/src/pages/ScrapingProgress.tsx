import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  Loader2,
  Circle,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { LOADING_TIPS } from "@/data/loadingTips";
import { toast } from "sonner";

/**
 * Ordered pipeline stages shown in the multi-step list. Index matches the
 * visual order; the backend `currentStep` value is compared against `id`.
 */
const STEPS = [
  { id: "connecting", label: "Connected to Instagram" },
  { id: "fetching_profile", label: "Fetched profile" },
  { id: "pulling_reels", label: "Pulling Reels" },
  { id: "ranking", label: "Analyzing engagement metrics" },
  { id: "complete", label: "Ranking by virality" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Fisher–Yates shuffle — pure, doesn't mutate the source array. */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function stepState(
  current: string | null | undefined,
  stepId: StepId
): "completed" | "active" | "pending" {
  if (!current) return "pending";
  if (current === "failed") return "pending";

  const currentIdx = STEPS.findIndex((s) => s.id === current);
  const thisIdx = STEPS.findIndex((s) => s.id === stepId);
  if (currentIdx === -1) return "pending";

  if (thisIdx < currentIdx) return "completed";
  if (thisIdx === currentIdx) return current === "complete" ? "completed" : "active";
  return "pending";
}

export default function ScrapingProgress() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const jobId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const id = params.get("jobId");
    return id ? parseInt(id, 10) : null;
  }, [searchString]);

  // If someone lands here without a jobId, bounce them to /research.
  useEffect(() => {
    if (jobId === null) setLocation("/research");
  }, [jobId, setLocation]);

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
  const currentStep = data?.currentStep ?? "pending";
  const reelsFound = data?.reelsFound ?? 0;
  const estimatedTotal = data?.estimatedTotal ?? 30;
  const progressPercent = data?.progressPercent ?? 0;
  const handle = data?.handle ?? "";
  const errorMessage = data?.errorMessage ?? null;

  // Redirect on success.
  useEffect(() => {
    if (status === "completed") {
      const t = setTimeout(() => setLocation(`/dashboard?jobId=${jobId}&from=research`), 400);
      return () => clearTimeout(t);
    }
  }, [status, jobId, setLocation]);

  // Elapsed-seconds timer for the "About X seconds remaining" copy.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (status === "completed" || status === "failed") return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Rotating tips — shuffled once on mount, advanced every 7s with a fade.
  const tips = useMemo(() => shuffle(LOADING_TIPS), []);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const tipIndexRef = useRef(0);

  useEffect(() => {
    const rotate = setInterval(() => {
      setTipVisible(false);
      const fadeTimer = setTimeout(() => {
        tipIndexRef.current = (tipIndexRef.current + 1) % tips.length;
        setTipIndex(tipIndexRef.current);
        setTipVisible(true);
      }, 300);
      return () => clearTimeout(fadeTimer);
    }, 7000);
    return () => clearInterval(rotate);
  }, [tips.length]);

  // "About X seconds remaining": interpolate between expected 30–45s and the
  // progress percent, whichever estimate is more conservative.
  const expectedTotalSec = 45;
  const remainingByTime = Math.max(0, expectedTotalSec - elapsedSec);
  const remainingByPct =
    progressPercent > 0
      ? Math.max(0, Math.round((elapsedSec / Math.max(1, progressPercent)) * (100 - progressPercent)))
      : expectedTotalSec;
  const remainingSec = Math.min(remainingByTime, remainingByPct);

  // Retry: kick off a new scrape with the same handle / timeframe and push
  // the user to the fresh /scraping URL.
  const retryMutation = trpc.scrape.start.useMutation({
    onSuccess: (d) => {
      setLocation(`/scraping?jobId=${d.jobId}`);
    },
    onError: (err) => {
      toast.error("Couldn't restart scrape", { description: err.message });
    },
  });

  const handleRetry = () => {
    if (!data) return;
    retryMutation.mutate({
      handle: data.handle,
      timeframeDays: data.timeframeDays,
    });
  };

  const handleBackToResearch = () => setLocation("/research");

  if (progressQuery.isError) {
    return (
      <ErrorState
        title="We couldn't load this scrape job"
        message={progressQuery.error.message}
        onBack={handleBackToResearch}
      />
    );
  }

  if (status === "failed") {
    return (
      <ErrorState
        title={`Scraping @${handle} failed`}
        message={errorMessage || "Something went wrong while pulling this account's reels."}
        onBack={handleBackToResearch}
        onRetry={handleRetry}
        retryPending={retryMutation.isPending}
      />
    );
  }

  const displayHandle = handle ? `@${handle}` : "your account";
  const rawPct = Math.min(100, Math.max(0, progressPercent));
  // Cap the bar at 95% while the job is in-flight; 100% is reserved for the
  // dashboard when reels are actually in the list (see Dashboard).
  const pctClamped =
    status === "completed" ? rawPct : Math.min(95, rawPct);

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-0 pt-4 sm:pt-8 md:pt-16 pb-16">
      <div className="mb-6 flex items-center justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Researching
        </span>
      </div>

      <div className="mb-10 text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Analyzing {displayHandle}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This usually takes 30–45 seconds
        </p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardContent className="pt-6">
          <ol className="space-y-4">
            {STEPS.map((step) => {
              const state = stepState(currentStep, step.id);
              const showCounter =
                step.id === "pulling_reels" &&
                (state === "active" || state === "completed") &&
                reelsFound > 0;
              const label = showCounter
                ? `Pulling Reels (${reelsFound} of ${Math.max(reelsFound, estimatedTotal)})`
                : step.label;
              return <StepRow key={step.id} state={state} label={label} />;
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="mt-6">
        <div
          className={`rounded-xl border border-border/50 bg-card/50 p-4 transition-opacity duration-300 ${
            tipVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                Reels tip
              </div>
              <div className="mt-1 text-sm leading-relaxed text-foreground">
                {tips[tipIndex]}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${pctClamped}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pctClamped}%</span>
          <span>
            {status === "completed"
              ? "Done!"
              : remainingSec > 0
                ? `About ${remainingSec} second${remainingSec === 1 ? "" : "s"} remaining`
                : "Almost there..."}
          </span>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToResearch}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Cancel and start over
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */

function StepRow({
  state,
  label,
}: {
  state: "completed" | "active" | "pending";
  label: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
          state === "completed"
            ? "bg-emerald-500/15 text-emerald-500"
            : state === "active"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {state === "completed" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : state === "active" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </div>
      <span
        className={`text-sm ${
          state === "pending"
            ? "text-muted-foreground"
            : state === "active"
              ? "font-medium text-foreground"
              : "text-foreground"
        }`}
      >
        {label}
      </span>
    </li>
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
      <Card className="border-destructive/30 bg-card">
        <CardContent className="pt-6 text-center">
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
        </CardContent>
      </Card>
    </div>
  );
}
