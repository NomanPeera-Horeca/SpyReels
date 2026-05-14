/**
 * BrandCoachBadge - AI viral-potential score on a single Reel.
 *
 * Three visual states:
 *   - locked: free / starter user sees a "Coach" pill that opens the
 *     upgrade side sheet on click (Pro feature).
 *   - unscored: Pro user with no cached score sees "Score" -> click runs
 *     the LLM mutation, shows a spinner, then flips to the scored state.
 *   - scored: colored badge with the overall number. Click opens the
 *     full breakdown dialog (hook / retention / payoff / replicability,
 *     strengths, weaknesses, suggestions, reasoning).
 *
 * Cached scores are fetched lazily via trpc.brandCoach.get on the first
 * render of a badge. The Dashboard render path could be optimised to use
 * brandCoach.getBatch in a follow-up - kept simple here so a single
 * <BrandCoachBadge> drop-in works without parent wiring.
 */
import { useState } from "react";
import { Loader2, Sparkles, Lock, Crown, Mic, TrendingUp, Zap, AlertTriangle, Lightbulb, CheckCircle2, Repeat2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFeatureLock, useUpgrade } from "@/components/UpgradeSidesheet";
import { toast } from "sonner";

/** Must match server `BRAND_COACH_SCORE_VERSION` in server/routers.ts for refresh prompts. */
const BRAND_COACH_SCORE_VERSION = 3;

type BrandCoachSource =
  | { kind: "reel"; reelId: number }
  | { kind: "featured"; featuredReelId: number };

interface BrandCoachBadgeProps {
  source: BrandCoachSource;
  /** Smaller variant for compact card layouts. */
  size?: "sm" | "md";
  className?: string;
  /** Whether the reel has a transcript - drives the nudge in the dialog. */
  hasTranscript?: boolean;
}

interface CachedScore {
  overallScore: number;
  hookScore: number;
  retentionScore: number;
  payoffScore: number;
  replicabilityScore?: number | null;
  scoreVersion?: number | null;
  verdict: "viral" | "strong" | "average" | "weak";
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  reasoning: string;
  usedTranscript: boolean;
}

function colorFor(score: number) {
  if (score >= 85)
    return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
  if (score >= 70)
    return "border-sky-400/35 bg-sky-400/10 text-sky-300";
  if (score >= 50)
    return "border-amber-400/35 bg-amber-400/10 text-amber-300";
  return "border-rose-400/35 bg-rose-400/10 text-rose-300";
}

function verdictLabel(v: CachedScore["verdict"]) {
  return v === "viral" ? "Viral pattern"
    : v === "strong" ? "Strong"
    : v === "average" ? "Average"
    : "Weak";
}

export function BrandCoachBadge({
  source,
  size = "sm",
  className,
  hasTranscript,
}: BrandCoachBadgeProps) {
  const { locked, loading: gateLoading } = useFeatureLock("brandCoach");
  const { open: openUpgrade } = useUpgrade();
  const [detailOpen, setDetailOpen] = useState(false);

  const queryInput =
    source.kind === "reel"
      ? { reelId: source.reelId }
      : { featuredReelId: source.featuredReelId };

  const getQuery = trpc.brandCoach.get.useQuery(queryInput, {
    enabled: !gateLoading && !locked,
    staleTime: 5 * 60 * 1000,
  });

  const utils = trpc.useUtils();
  const scoreMutation = trpc.brandCoach.score.useMutation({
    onSuccess: (data) => {
      utils.brandCoach.get.setData(queryInput, data);
      // Auto-transcribe may have run on the server, so refresh the
      // caches that surface transcription status in parent UI.
      if (source.kind === "reel") {
        void utils.collected.invalidate?.();
        void utils.search.invalidate?.();
        void utils.reels.invalidate?.();
      } else {
        void utils.featured.invalidate?.();
      }
      setDetailOpen(true);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to score this Reel");
    },
  });

  const cached = getQuery.data as CachedScore | null | undefined;

  const heightClass = size === "sm" ? "h-6 px-1.5" : "h-7 px-2";
  const textClass = size === "sm" ? "text-[10px]" : "text-xs";

  if (gateLoading) {
    return null;
  }

  // ── Locked state ─────────────────────────────────────────
  if (locked) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openUpgrade("brandCoach");
        }}
        className={`inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-400/10 font-semibold text-purple-300 transition-colors hover:bg-purple-400/15 ${heightClass} ${textClass} ${className ?? ""}`}
        title="Brand Coach - AI viral-potential score (Pro feature)"
      >
        <Lock className="h-3 w-3" />
        Coach
      </button>
    );
  }

  // ── Scored state ─────────────────────────────────────────
  if (cached) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDetailOpen(true);
          }}
          className={`inline-flex items-center gap-1 rounded-full border font-semibold transition-opacity hover:opacity-80 ${colorFor(cached.overallScore)} ${heightClass} ${textClass} ${className ?? ""}`}
          title={`Brand Coach: ${cached.overallScore}/100 - ${verdictLabel(cached.verdict)}`}
        >
          <Sparkles className="h-3 w-3" />
          {cached.overallScore}
        </button>
        <BrandCoachDetailDialog
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          score={cached}
          hasTranscript={hasTranscript}
          onRescore={() => scoreMutation.mutate(queryInput)}
          rescorePending={scoreMutation.isPending}
        />
      </>
    );
  }

  // ── Unscored: show "Score" button (Pro user, no cached row) ──
  const isPending = scoreMutation.isPending;
  const willTranscribe = !hasTranscript;
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation();
        if (willTranscribe) {
          toast.message("Transcribing audio for a sharper score", {
            description: "This takes a few seconds the first time.",
            duration: 4000,
          });
        }
        scoreMutation.mutate(queryInput);
      }}
      className={`inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60 ${heightClass} ${textClass} ${className ?? ""}`}
      title={
        willTranscribe
          ? "Score this Reel (auto-transcribes the audio first for a sharper read)"
          : "Score this Reel for viral potential"
      }
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      {isPending ? (willTranscribe ? "Analyzing" : "Scoring") : "Score"}
    </button>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────
function BrandCoachDetailDialog({
  open,
  onClose,
  score,
  hasTranscript,
  onRescore,
  rescorePending,
}: {
  open: boolean;
  onClose: () => void;
  score: CachedScore;
  hasTranscript?: boolean;
  onRescore?: () => void;
  rescorePending?: boolean;
}) {
  const showFourMetrics =
    (score.scoreVersion ?? 0) >= 2 && typeof score.replicabilityScore === "number";
  const needsRescore = (score.scoreVersion ?? 0) < BRAND_COACH_SCORE_VERSION;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[84dvh]">
        <div className="shrink-0 border-b border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 sm:p-5">
          <DialogHeader className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/15 p-1.5">
                  <Crown className="h-4 w-4 text-primary" />
                </div>
                <DialogTitle className="text-lg">Brand Coach</DialogTitle>
              </div>
              <ScoreCircle score={score.overallScore} verdict={score.verdict} />
            </div>
            <DialogDescription className="max-h-28 overflow-y-auto pr-1 text-xs leading-relaxed text-muted-foreground sm:max-h-36 sm:text-sm">
              {score.reasoning}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div
            className={`grid gap-3 min-w-0 ${showFourMetrics ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}
          >
            <SubScore label="Hook" icon={Zap} score={score.hookScore} />
            <SubScore label="Retention" icon={TrendingUp} score={score.retentionScore} />
            <SubScore label="Payoff" icon={Sparkles} score={score.payoffScore} />
            {showFourMetrics ? (
              <SubScore label="Copy format" icon={Repeat2} score={score.replicabilityScore!} />
            ) : null}
          </div>

          {needsRescore ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-sky-400/25 bg-sky-400/5 p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
              <p className="text-xs leading-relaxed text-sky-100/90">
                A newer Brand Coach pass is available (tighter layout in the app and shorter, easier to read bullets). Tap &quot;Update score&quot; to refresh this reel.
              </p>
            </div>
          ) : null}

          {!score.usedTranscript && !hasTranscript ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
              <Mic className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-xs leading-relaxed text-amber-200/90">
                No transcript was available for this Reel (silent, music only, or speech could not be detected), so the score is based on caption and engagement signals only.
              </p>
            </div>
          ) : null}

          <Section
            title="What is working"
            icon={CheckCircle2}
            tone="emerald"
            items={score.strengths}
          />
          <Section
            title="What is fragile"
            icon={AlertTriangle}
            tone="amber"
            items={score.weaknesses}
          />
          <Section
            title="How to remix this"
            icon={Lightbulb}
            tone="primary"
            items={score.suggestions}
          />
        </div>

        <div className="shrink-0 border-t border-border bg-card/95 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {needsRescore && onRescore ? (
              <Button
                type="button"
                variant="secondary"
                disabled={rescorePending}
                onClick={() => onRescore()}
                className="mr-auto"
              >
                {rescorePending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating
                  </>
                ) : (
                  "Update score"
                )}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScoreCircle({
  score,
  verdict,
}: {
  score: number;
  verdict: CachedScore["verdict"];
}) {
  const ring =
    score >= 85 ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
    : score >= 70 ? "border-sky-400/60 bg-sky-400/10 text-sky-300"
    : score >= 50 ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
    : "border-rose-400/60 bg-rose-400/10 text-rose-300";
  return (
    <div className="flex items-center gap-2 text-right">
      <div className={`flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 ${ring}`}>
        <span className="text-xl font-bold leading-none">{score}</span>
        <span className="text-[8px] uppercase tracking-wider opacity-70">/100</span>
      </div>
      <div className="hidden flex-col items-start sm:flex">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Verdict
        </span>
        <span className="text-sm font-medium text-foreground">
          {verdictLabel(verdict)}
        </span>
      </div>
    </div>
  );
}

function SubScore({
  label,
  icon: Icon,
  score,
}: {
  label: string;
  icon: typeof Zap;
  score: number;
}) {
  const colorBar =
    score >= 85 ? "bg-emerald-400"
    : score >= 70 ? "bg-sky-400"
    : score >= 50 ? "bg-amber-400"
    : "bg-rose-400";
  return (
    <div className="flex min-h-[5.5rem] min-w-0 flex-col gap-2 rounded-md border border-border bg-card/40 p-2.5 sm:min-h-0 sm:p-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words leading-snug">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-none text-foreground sm:text-2xl">
        {score}
      </div>
      <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${colorBar}`}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  icon: typeof Zap;
  tone: "emerald" | "amber" | "primary";
  items: string[];
}) {
  if (!items || items.length === 0) return null;
  const iconColor =
    tone === "emerald" ? "text-emerald-400"
    : tone === "amber" ? "text-amber-400"
    : "text-primary";
  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/80">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} /> {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((it, idx) => (
          <li
            key={`${title}-${idx}`}
            className="flex items-start gap-2 text-xs leading-snug text-foreground/90 sm:text-sm sm:leading-relaxed"
          >
            <span className={`mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full ${iconColor.replace("text-", "bg-")}`} />
            <span className="min-w-0 break-words">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
