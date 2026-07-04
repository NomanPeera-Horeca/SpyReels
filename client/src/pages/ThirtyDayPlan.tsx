import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { STUDIO_PREFILL_KEY } from "@shared/studioHeit";
import { ONBOARDING_PLAN_AUTOSTART_KEY } from "@shared/onboardingFlow";
import { STUDIO_PREFILL_META_KEY } from "@shared/studioCoachUi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarDays, ExternalLink, Film, HelpCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import { useAgentProgressPoll } from "@/hooks/useAgentProgressPoll";
import { buildPlanProgressSteps, PLAN_AGENT_FOOTER } from "@shared/planAgentProgress";
import { audienceSourceLabel } from "@shared/audienceResearch";
import { useMobileCreateAppContext } from "@/contexts/MobileCreateAppContext";
import { HelpTipBadge } from "@/components/HelpTipBadge";
import { SparkDeckSection, type SparkPlanCard } from "@/components/SparkDeckSection";
import Tooltip from "@/components/Tooltip";
import {
  formatTooltip,
  funnelTooltip,
  PLAN_FORMAT_LABELS,
} from "@/lib/studioContentHelp";

type PlanCard = SparkPlanCard;

const GOALS = [
  { value: "grow", label: "Grow my audience", description: "Maximize reach and follower count" },
  { value: "viral", label: "Go viral", description: "Land one big breakout video" },
  { value: "authority", label: "Build authority", description: "Become the go-to expert in my niche" },
  { value: "monetize", label: "Start monetizing", description: "Convert followers into paying clients" },
] as const;

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
] as const;

const FORMAT_LABELS = PLAN_FORMAT_LABELS;

const FUNNEL_FILTER_TIPS: Record<string, string | null> = {
  all: null,
  tofu: funnelTooltip("tofu"),
  mofu: funnelTooltip("mofu"),
  bofu: funnelTooltip("bofu"),
};

const FUNNEL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  tofu: { label: "TOFU", color: "text-sky-700", bg: "bg-sky-100 dark:bg-sky-950/50" },
  mofu: { label: "MOFU", color: "text-violet-700", bg: "bg-violet-100 dark:bg-violet-950/50" },
  bofu: { label: "BOFU", color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-950/50" },
};

function PlanCardItem({
  card,
  selected,
  anySelected,
  isAdjusting,
  adjustText,
  isRegenerating,
  onToggle,
  onWriteScript,
  onStartAdjust,
  onCancelAdjust,
  onAdjustTextChange,
  onAdjustSubmit,
}: {
  card: PlanCard;
  selected: boolean;
  anySelected: boolean;
  isAdjusting: boolean;
  adjustText: string;
  isRegenerating: boolean;
  onToggle: () => void;
  onWriteScript: () => void;
  onStartAdjust: () => void;
  onCancelAdjust: () => void;
  onAdjustTextChange: (text: string) => void;
  onAdjustSubmit: () => void;
}) {
  const [showSignal, setShowSignal] = useState(false);
  const funnel = FUNNEL_CONFIG[card.funnelStage] ?? FUNNEL_CONFIG.tofu;
  const statusBorder = isAdjusting
    ? "border-amber-400 bg-amber-50/30 dark:bg-amber-950/20"
    : card.status === "approved"
      ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20"
      : card.status === "rejected"
        ? "border-red-400 bg-red-50/40 dark:bg-red-950/20"
        : selected
          ? "border-violet-500"
          : "border-border bg-card";

  return (
    <div
      className={`relative rounded-xl border-2 transition-all duration-150 group ${isAdjusting ? "" : "cursor-pointer"} ${statusBorder}`}
      onClick={isAdjusting ? undefined : onToggle}
    >
      {!isAdjusting && (
        <div
          className={`absolute top-2.5 left-2.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            selected
              ? "bg-violet-600 border-violet-600"
              : anySelected
                ? "border-border bg-background"
                : "border-transparent group-hover:border-border bg-background/80"
          }`}
        >
          {selected && <span className="text-white text-[10px] font-bold">✓</span>}
        </div>
      )}

      {card.status !== "pending" && !isAdjusting && (
        <div className="absolute top-2.5 right-2.5 text-sm">
          {card.status === "approved" ? (
            <span className="text-emerald-500">✓</span>
          ) : (
            <span className="text-red-400">✕</span>
          )}
        </div>
      )}

      <div className={`p-3 ${isAdjusting ? "pt-3" : "pt-8"}`}>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <HelpTipBadge
            label={funnel.label}
            tip={funnelTooltip(card.funnelStage)}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${funnel.bg} ${funnel.color}`}
          />
          <HelpTipBadge
            label={FORMAT_LABELS[card.contentFormat] ?? card.contentFormat}
            tip={formatTooltip(card.contentFormat)}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          />
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            SpyReels pick
          </span>
          <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Day {card.day}
          </span>
        </div>

        <p className="text-sm font-semibold leading-snug line-clamp-2 mb-1.5">{card.title}</p>
        <p className="text-xs italic text-muted-foreground line-clamp-2 leading-relaxed mb-2">
          &ldquo;{card.hook}&rdquo;
        </p>

        {!isAdjusting && (
          <p className="text-[10px] text-muted-foreground mb-2">{card.filmingLocation}</p>
        )}

        {!isAdjusting && card.researchSignal && (
          <div onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 mb-1"
              onClick={() => setShowSignal((v) => !v)}
            >
              Why this works {showSignal ? "▾" : "▸"}
            </button>
            {showSignal && (
              <div className="text-[10px] leading-relaxed text-violet-900 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 rounded-lg px-2.5 py-2 mt-1">
                {card.researchSignal}
              </div>
            )}
          </div>
        )}

        {isAdjusting && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
              What needs to change?
            </p>
            <Textarea
              value={adjustText}
              onChange={(e) => onAdjustTextChange(e.target.value)}
              placeholder='e.g. "Reframe from an observer perspective, not as the business owner."'
              className="text-xs min-h-[70px] resize-none border-amber-300 mb-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAdjustSubmit();
                if (e.key === "Escape") onCancelAdjust();
              }}
            />
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" className="flex-1 text-xs" onClick={onCancelAdjust} disabled={isRegenerating}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 text-xs bg-amber-500 hover:bg-amber-600"
                onClick={onAdjustSubmit}
                disabled={isRegenerating || !adjustText.trim()}
              >
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {!isAdjusting && (
        <div className="px-3 pb-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
            onClick={onWriteScript}
          >
            Write Script
          </Button>
          <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onStartAdjust}>
            Change this idea
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ThirtyDayPlan() {
  const [, setLocation] = useLocation();
  const mobileCreate = useMobileCreateAppContext();
  const utils = trpc.useUtils();

  const [phase, setPhase] = useState<"setup" | "generating" | "board">("setup");
  const [goal, setGoal] = useState<"grow" | "viral" | "authority" | "monetize">("grow");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Array<"instagram" | "tiktok" | "youtube">>([
    "instagram",
    "tiktok",
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterFunnel, setFilterFunnel] = useState("all");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [adjustingId, setAdjustingId] = useState<number | null>(null);
  const [adjustText, setAdjustText] = useState("");
  const [showOnboardingPlanHint, setShowOnboardingPlanHint] = useState(false);

  const cardsQuery = trpc.plan.listCards.useQuery();
  const sparkCards = cardsQuery.data?.sparkCards ?? [];
  const calendarCards = cardsQuery.data?.calendarCards ?? cardsQuery.data?.cards?.filter((c) => c.sourceType !== "user_spark" && c.day > 0) ?? [];
  const hasBoardContent = sparkCards.length > 0 || calendarCards.length > 0;
  const audienceQuery = trpc.audienceResearch.list.useQuery(undefined, {
    enabled: phase === "board",
    staleTime: 120_000,
  });
  const refreshAudienceMutation = trpc.audienceResearch.refresh.useMutation({
    onSuccess: () => {
      void utils.audienceResearch.list.invalidate();
      toast.success("Audience questions refreshed");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (hasBoardContent && phase === "setup") setPhase("board");
  }, [hasBoardContent, phase]);

  const generateMutation = trpc.plan.generate.useMutation({
    onSuccess: () => {
      setTimeout(() => setPhase("board"), 600);
      void utils.plan.listCards.invalidate();
      void utils.audienceResearch.list.invalidate();
    },
    onError: (err) => {
      setPhase("setup");
      toast.error(err.message);
    },
  });

  const fetchPlanProgress = useMemo(
    () => () => utils.plan.getGenerationProgress.fetch(undefined, { staleTime: 0 }),
    [utils.plan.getGenerationProgress]
  );

  const planProgressSteps = useAgentProgressPoll({
    enabled: phase === "generating" && generateMutation.isPending,
    initialSteps: buildPlanProgressSteps("read_profile"),
    fetchProgress: fetchPlanProgress,
  });

  const statusMutation = trpc.plan.updateStatus.useMutation({
    onSuccess: () => {
      void utils.plan.listCards.invalidate();
      setSelectedIds(new Set());
    },
    onError: (err) => toast.error(err.message),
  });

  const regenerateMutation = trpc.plan.regenerate.useMutation({
    onSuccess: () => {
      void utils.plan.listCards.invalidate();
      setSelectedIds(new Set());
      setShowRejectModal(false);
      setAdjustingId(null);
      setAdjustText("");
    },
    onError: (err) => toast.error(err.message),
  });

  const planAutostartRef = useRef(false);
  useEffect(() => {
    if (planAutostartRef.current) return;
    if (calendarCards.length > 0 || sparkCards.length > 0) return;
    if (sessionStorage.getItem(ONBOARDING_PLAN_AUTOSTART_KEY) !== "1") return;
    planAutostartRef.current = true;
    sessionStorage.removeItem(ONBOARDING_PLAN_AUTOSTART_KEY);
    setGoal("grow");
    setSelectedPlatforms(["instagram"]);
    setPhase("setup");
    setShowOnboardingPlanHint(true);
  }, [calendarCards.length, sparkCards.length]);

  function handleWriteScript(card: PlanCard) {
    const isSpark = card.sourceType === "user_spark" || card.day === 0;
    sessionStorage.setItem(
      STUDIO_PREFILL_KEY,
      isSpark
        ? `Spark idea: ${card.title}\n\n${card.userRawNote ?? card.angle}\n\nHook idea: "${card.hook}"`
        : `Day ${card.day} plan idea: ${card.title}\n\n${card.angle}\n\nHook idea: "${card.hook}"`
    );
    sessionStorage.setItem(
      STUDIO_PREFILL_META_KEY,
      JSON.stringify({
        planCardId: card.id,
        planCardTitle: card.title,
        planCardDay: isSpark ? null : card.day,
      })
    );
    setLocation("/studio");
  }

  const filteredCalendarCards =
    filterFunnel === "all"
      ? calendarCards
      : calendarCards.filter((c) => c.funnelStage === filterFunnel);
  const weeks = [
    { label: "Week 1", cards: filteredCalendarCards.filter((c) => c.day <= 7) },
    { label: "Week 2", cards: filteredCalendarCards.filter((c) => c.day >= 8 && c.day <= 14) },
    { label: "Week 3", cards: filteredCalendarCards.filter((c) => c.day >= 15 && c.day <= 21) },
    { label: "Week 4", cards: filteredCalendarCards.filter((c) => c.day >= 22) },
  ];
  const allCards = useMemo(() => [...sparkCards, ...calendarCards], [sparkCards, calendarCards]);
  const approvedCount = allCards.filter((c) => c.status === "approved").length;
  const anySelected = selectedIds.size > 0;

  function handleGenerate() {
    if (!selectedPlatforms.length) return;
    setPhase("generating");
    generateMutation.mutate({ goal, platforms: selectedPlatforms });
  }

  if (phase === "setup") {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center gap-2 mb-2 text-violet-600">
          <CalendarDays className="h-5 w-5" />
          <span className="text-sm font-medium">30-Day Content Plan</span>
        </div>
        <h1 className="text-2xl font-bold mb-1">Your 30-Day Content Plan</h1>
        <p className="text-sm text-muted-foreground mb-8">
          AI-generated content ideas tailored to your niche and goal
        </p>

        {showOnboardingPlanHint ? (
          <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-800 dark:bg-violet-950/20">
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
              Your first script is ready. Now build 30 more ideas like it.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-violet-800/80 dark:text-violet-200/80">
              We pre-selected Grow my audience on Instagram. Tap generate when you are ready.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-xs text-violet-700 dark:text-violet-300"
              onClick={() => setShowOnboardingPlanHint(false)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-3">What&apos;s your #1 goal right now?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    goal === g.value ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20" : "border-border hover:border-violet-300 bg-card"
                  }`}
                >
                  <div className="font-semibold text-sm">{g.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{g.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-3">Which platforms are you posting on?</label>
            <div className="flex flex-wrap gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() =>
                    setSelectedPlatforms((prev) =>
                      prev.includes(p.value) ? prev.filter((x) => x !== p.value) : [...prev, p.value]
                    )
                  }
                  className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedPlatforms.includes(p.value)
                      ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20"
                      : "border-border hover:border-violet-300"
                  }`}
                >
                  {p.label}
                  {selectedPlatforms.includes(p.value) && (
                    <span className="ml-2 text-violet-600 text-xs font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedPlatforms.length || generateMutation.isPending}
            className="w-full bg-violet-600 hover:bg-violet-700"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate My 30-Day Plan
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "generating") {
    return (
      <AgentProgressPanel
        steps={planProgressSteps}
        subheadline="Pulling real audience questions from Reddit and Quora, then building 30 custom ideas. Takes about 2 to 3 minutes."
        footer={PLAN_AGENT_FOOTER}
        badgeLabel="Planning"
      />
    );
  }

  return (
    <div
      className={`max-w-6xl mx-auto space-y-6 px-2 sm:px-0 ${mobileCreate ? "pb-mobile-tabs" : "pb-28"}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">30-Day Content Plan</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="text-emerald-600 font-medium">✓ {approvedCount} approved</span>
            <span>{allCards.filter((c) => c.status === "pending").length} to review</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPhase("setup")}>
          Regenerate plan
        </Button>
      </div>

      {(audienceQuery.data?.signals.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                Audience research for {audienceQuery.data?.niche ?? "your niche"}
              </p>
              <p className="text-xs text-sky-800/80 dark:text-sky-200/80">
                Real questions from Reddit and the web that shaped this plan
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => refreshAudienceMutation.mutate()}
              disabled={refreshAudienceMutation.isPending}
            >
              {refreshAudienceMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
          <ul className="space-y-2">
            {audienceQuery.data?.signals.slice(0, 5).map((signal) => (
              <li key={signal.id} className="rounded-lg border border-sky-200/80 bg-background/80 px-3 py-2 dark:border-sky-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {audienceSourceLabel(signal.source)}
                    </p>
                    <p className="text-sm font-medium leading-snug">{signal.title}</p>
                    {signal.snippet ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{signal.snippet}</p>
                    ) : null}
                  </div>
                  <a
                    href={signal.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sky-700 hover:text-sky-900 dark:text-sky-300"
                    aria-label="Open source"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cardsQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      )}

      {!cardsQuery.isLoading && !hasBoardContent && (
        <div className="border border-border rounded-lg p-8 text-center">
          <Film className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No plan yet. Generate your first 30-day plan or save sparks from reels.</p>
          <Button className="mt-4" onClick={() => setPhase("setup")}>
            Get started
          </Button>
        </div>
      )}

      {!cardsQuery.isLoading && phase === "board" && (
        <SparkDeckSection
          sparkCards={sparkCards}
          selectedIds={selectedIds}
          anySelected={anySelected}
          adjustingId={adjustingId}
          adjustText={adjustText}
          isRegenerating={regenerateMutation.isPending}
          onToggleSelect={(id) =>
            setSelectedIds((prev) => {
              const n = new Set(prev);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onWriteScript={handleWriteScript}
          onStartAdjust={(id) => {
            setAdjustingId(id);
            setAdjustText("");
          }}
          onCancelAdjust={() => {
            setAdjustingId(null);
            setAdjustText("");
          }}
          onAdjustTextChange={setAdjustText}
          onAdjustSubmit={() =>
            regenerateMutation.mutate({ ids: [adjustingId!], feedback: adjustText })
          }
          onCardsChanged={() => void utils.plan.listCards.invalidate()}
        />
      )}

      {approvedCount > 0 && !anySelected && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {approvedCount} idea{approvedCount !== 1 ? "s" : ""} approved, ready to script
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              Click Write Script on any card to open AI Coach
            </p>
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              const first = allCards.find((c) => c.status === "approved");
              if (first) handleWriteScript(first);
            }}
          >
            Write First Script
          </Button>
        </div>
      )}

      {calendarCards.length === 0 && sparkCards.length > 0 && !cardsQuery.isLoading && (
        <div className="rounded-xl border border-dashed border-violet-300 dark:border-violet-700 px-4 py-6 text-center">
          <p className="text-sm font-medium mb-1">Ready for a full month of SpyReels picks?</p>
          <p className="text-xs text-muted-foreground mb-4">
            Generate your SpyReels 30-day calendar. Your Spark Deck stays put.
          </p>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => setPhase("setup")}>
            Generate 30-day calendar
          </Button>
        </div>
      )}

      {calendarCards.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold">Your SpyReels 30-day calendar</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI picks tailored to your niche. Approve ideas, then Write Script.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {["all", "tofu", "mofu", "bofu"].map((f) => {
              const label = f === "all" ? "All" : f.toUpperCase();
              const tip = FUNNEL_FILTER_TIPS[f];
              const button = (
                <button
                  type="button"
                  onClick={() => setFilterFunnel(f)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    filterFunnel === f
                      ? "bg-violet-600 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  } ${tip ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
                >
                  {label}
                </button>
              );
              if (tip) {
                return (
                  <Tooltip key={f} content={tip}>
                    {button}
                  </Tooltip>
                );
              }
              return (
                <span key={f} className="inline-flex">
                  {button}
                </span>
              );
            })}
            <Tooltip
              content={
                <span>
                  <strong>Formats on each card</strong> (hover the gray badge): Talking Head, Voiceover,
                  BTS, Tutorial, Trending, or Faceless. Each is a different way to film the idea.
                </span>
              }
            >
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help ml-1">
                <HelpCircle className="h-3.5 w-3.5" />
                Format guide
              </span>
            </Tooltip>
          </div>

      {weeks.map(
        (week) =>
          week.cards.length > 0 && (
            <div key={week.label}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {week.label}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {week.cards.map((card) => (
                  <PlanCardItem
                    key={card.id}
                    card={card}
                    selected={selectedIds.has(card.id)}
                    anySelected={anySelected}
                    isAdjusting={adjustingId === card.id}
                    adjustText={adjustingId === card.id ? adjustText : ""}
                    isRegenerating={regenerateMutation.isPending}
                    onToggle={() =>
                      setSelectedIds((prev) => {
                        const n = new Set(prev);
                        if (n.has(card.id)) n.delete(card.id);
                        else n.add(card.id);
                        return n;
                      })
                    }
                    onWriteScript={() => handleWriteScript(card)}
                    onStartAdjust={() => {
                      setAdjustingId(card.id);
                      setAdjustText("");
                    }}
                    onCancelAdjust={() => {
                      setAdjustingId(null);
                      setAdjustText("");
                    }}
                    onAdjustTextChange={setAdjustText}
                    onAdjustSubmit={() =>
                      regenerateMutation.mutate({ ids: [card.id], feedback: adjustText })
                    }
                  />
                ))}
              </div>
            </div>
          )
      )}
        </div>
      )}

      {anySelected && (
        <div
          className={`fixed left-0 right-0 flex items-center justify-center px-4 pointer-events-none z-40 ${
            mobileCreate ? "bottom-[calc(4.25rem+env(safe-area-inset-bottom))] pb-2" : "bottom-0 pb-5"
          }`}
        >
          <div className="bg-card border border-border shadow-2xl rounded-2xl pointer-events-auto w-full max-w-lg overflow-hidden">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() =>
                  statusMutation.mutate({
                    ids: Array.from(selectedIds),
                    status: "approved",
                  })
                }
              >
                Approve {selectedIds.size}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => setShowRejectModal(true)}
              >
                Reject and redo
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-bold text-lg mb-1">What&apos;s wrong with these ideas?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tell AI what to change. It will regenerate only these {selectedIds.size} card
              {selectedIds.size !== 1 ? "s" : ""}.
            </p>
            <Textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder='e.g. "Too generic. I need B2B ideas, not consumer advice."'
              className="min-h-[100px] resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-violet-600 hover:bg-violet-700"
                onClick={() =>
                  regenerateMutation.mutate({
                    ids: Array.from(selectedIds),
                    feedback: rejectFeedback,
                  })
                }
                disabled={regenerateMutation.isPending}
              >
                {regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
