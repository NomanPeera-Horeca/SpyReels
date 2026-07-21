import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ScoredReel = {
  shortcode: string;
  viralScore: number | null;
};

type Diagnosis = {
  winnerPattern: string;
  loserPattern: string;
  keyGap: string;
  actionPlan: string[];
};

type DiagnosticResult = {
  reels: ScoredReel[];
  diagnosis: Diagnosis | null;
};

export default function ViralityDiagnostic() {
  const [handle, setHandle] = useState("");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    let robotsMeta = document.querySelector('meta[name="robots"]');
    const created = !robotsMeta;
    const previousRobots = robotsMeta?.getAttribute("content") ?? null;

    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }

    document.title = "My Virality Report | SpyReels";
    robotsMeta.setAttribute("content", "noindex,nofollow");

    return () => {
      document.title = previousTitle;
      if (created && robotsMeta?.parentNode) {
        robotsMeta.parentNode.removeChild(robotsMeta);
      } else if (robotsMeta) {
        if (previousRobots) {
          robotsMeta.setAttribute("content", previousRobots);
        } else {
          robotsMeta.removeAttribute("content");
        }
      }
    };
  }, []);

  const startMutation = trpc.viralityDiagnostic.start.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly virality diagnostic limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const jobStatusQuery = trpc.viralityDiagnostic.jobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: activeJobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 3000;
      },
    }
  );

  const job = jobStatusQuery.data;

  useEffect(() => {
    if (!job) return;
    if (job.status === "failed") {
      toast.error(job.errorMessage?.trim() || "Virality diagnostic failed");
      setActiveJobId(null);
    }
  }, [job]);

  const isRunning =
    activeJobId != null && job?.status !== "completed" && job?.status !== "failed";

  const result =
    job?.status === "completed"
      ? ((job.resultJson as DiagnosticResult | null) ?? null)
      : null;
  const diagnosis = result?.diagnosis ?? null;

  const handleSubmit = () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setActiveJobId(null);
    startMutation.mutate({ handle: trimmed });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Virality Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          See why your own reels do or don&apos;t go viral, based on your
          actual posting history.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="Your Instagram handle, e.g. yourhandle"
          disabled={isRunning}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />
        <Button onClick={handleSubmit} disabled={isRunning || !handle.trim()}>
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            "Analyze my reels"
          )}
        </Button>
      </div>

      {isRunning ? (
        <div className="rounded-lg border border-border/40 bg-card p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {job?.reelsFound ? (
              <span>
                Found {job.reelsFound} reels, analyzed{" "}
                {job.reelsAnalyzed ?? 0}/{job.reelsFound}
              </span>
            ) : (
              <span>Finding your reels...</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This can take several minutes since we watch and analyze each
            reel individually.
          </p>
        </div>
      ) : null}

      {job?.status === "completed" && diagnosis ? (
        <div className="space-y-5 rounded-lg border border-border/40 bg-card p-6">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-500">
              <TrendingUp className="h-3.5 w-3.5" /> What&apos;s working
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">
              {diagnosis.winnerPattern}
            </p>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-500">
              <TrendingDown className="h-3.5 w-3.5" /> What&apos;s not
              working
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">
              {diagnosis.loserPattern}
            </p>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Lightbulb className="h-3.5 w-3.5" /> The key gap
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">
              {diagnosis.keyGap}
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/80">
              Your action plan
            </p>
            <ul className="space-y-1.5">
              {diagnosis.actionPlan.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90"
                >
                  <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {job?.status === "completed" && !diagnosis ? (
        <div className="rounded-lg border border-border/40 bg-card p-6 text-sm text-muted-foreground">
          We analyzed {job.reelsAnalyzed} of your reels, but there
          wasn&apos;t enough score spread yet to generate a reliable
          comparison. Post a bit more and check back.
        </div>
      ) : null}
    </div>
  );
}
