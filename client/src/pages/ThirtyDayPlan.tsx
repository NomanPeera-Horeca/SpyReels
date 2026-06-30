import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { STUDIO_PREFILL_KEY } from "@shared/studioHeit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarDays, Film, Loader2, Sparkles } from "lucide-react";

type PlanCard = {
  id: number;
  day: number;
  funnelStage: string;
  contentFormat: string;
  platform: string;
  title: string;
  hook: string;
  angle: string;
  filmingLocation: string;
  researchSignal: string | null;
  status: string;
  goal: string | null;
};

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

const AGENT_STEPS = [
  "Researching what your audience asks on Reddit, Quora, and YouTube...",
  "Analyzing top creators and trending angles in your niche...",
  "Balancing TOFU, MOFU, and BOFU across 30 days...",
  "Assigning formats and filming locations to each day...",
  "Writing hook lines for each idea...",
  "Building your content board...",
];

const FORMAT_LABELS: Record<string, string> = {
  "talking-head": "Talking Head",
  "voiceover-broll": "Voiceover",
  "behind-the-scenes": "BTS",
  "tutorial-demo": "Tutorial",
  "trending-audio": "Trending",
  faceless: "Faceless",
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
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${funnel.bg} ${funnel.color}`}>
            {funnel.label}
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {FORMAT_LABELS[card.contentFormat] ?? card.contentFormat}
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
  const utils = trpc.useUtils();

  const [phase, setPhase] = useState<"setup" | "generating" | "board">("setup");
  const [goal, setGoal] = useState<"grow" | "viral" | "authority" | "monetize">("grow");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Array<"instagram" | "tiktok" | "youtube">>([
    "instagram",
    "tiktok",
  ]);
  const [agentStep, setAgentStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterFunnel, setFilterFunnel] = useState("all");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [adjustingId, setAdjustingId] = useState<number | null>(null);
  const [adjustText, setAdjustText] = useState("");
  const agentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cardsQuery = trpc.plan.listCards.useQuery();
  const cards = cardsQuery.data?.cards ?? [];

  useEffect(() => {
    if (cards.length > 0 && phase === "setup") setPhase("board");
  }, [cards.length, phase]);

  const generateMutation = trpc.plan.generate.useMutation({
    onSuccess: () => {
      if (agentIntervalRef.current) clearInterval(agentIntervalRef.current);
      setAgentStep(AGENT_STEPS.length);
      setTimeout(() => setPhase("board"), 600);
      void utils.plan.listCards.invalidate();
    },
    onError: (err) => {
      if (agentIntervalRef.current) clearInterval(agentIntervalRef.current);
      setPhase("setup");
      toast.error(err.message);
    },
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

  function handleGenerate() {
    if (!selectedPlatforms.length) return;
    setPhase("generating");
    setAgentStep(0);
    let step = 0;
    agentIntervalRef.current = setInterval(() => {
      step += 1;
      if (step < AGENT_STEPS.length - 1) setAgentStep(step);
      else if (agentIntervalRef.current) clearInterval(agentIntervalRef.current);
    }, 1400);
    generateMutation.mutate({ goal, platforms: selectedPlatforms });
  }

  function handleWriteScript(card: PlanCard) {
    sessionStorage.setItem(
      STUDIO_PREFILL_KEY,
      `${card.title}\n\n${card.angle}\n\nHook idea: "${card.hook}"`
    );
    setLocation("/studio");
  }

  const filteredCards =
    filterFunnel === "all" ? cards : cards.filter((c) => c.funnelStage === filterFunnel);
  const weeks = [
    { label: "Week 1", cards: filteredCards.filter((c) => c.day <= 7) },
    { label: "Week 2", cards: filteredCards.filter((c) => c.day >= 8 && c.day <= 14) },
    { label: "Week 3", cards: filteredCards.filter((c) => c.day >= 15 && c.day <= 21) },
    { label: "Week 4", cards: filteredCards.filter((c) => c.day >= 22) },
  ];
  const approvedCount = cards.filter((c) => c.status === "approved").length;
  const anySelected = selectedIds.size > 0;

  if (phase === "setup") {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center gap-2 mb-2 text-violet-600">
          <CalendarDays className="h-5 w-5" />
          <span className="text-sm font-medium">30-Day Content Plan</span>
        </div>
        <h1 className="text-2xl font-bold mb-1">Your 30-Day Content Plan</h1>
        <p className="text-sm text-muted-foreground mb-8">
          AI-researched ideas from your audience&apos;s real questions
        </p>

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
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-violet-100 dark:bg-violet-950/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-7 w-7 text-violet-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold mb-1">Researching your niche...</h2>
            <p className="text-sm text-muted-foreground">
              AI is building 30 custom content ideas. Takes about a minute.
            </p>
          </div>
          <div className="space-y-3">
            {AGENT_STEPS.map((step, i) => (
              <div
                key={step}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  i <= agentStep ? "bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800" : "opacity-30"
                }`}
              >
                <span className={`text-sm flex-1 ${i <= agentStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {step}
                </span>
                {i < agentStep && <span className="text-emerald-500 text-xs font-bold">✓</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-28 px-2 sm:px-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">30-Day Content Plan</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="text-emerald-600 font-medium">✓ {approvedCount} approved</span>
            <span>{cards.filter((c) => c.status === "pending").length} to review</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPhase("setup")}>
          Regenerate plan
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "tofu", "mofu", "bofu"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilterFunnel(f)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              filterFunnel === f
                ? "bg-violet-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f === "all" ? "All" : f.toUpperCase()}
          </button>
        ))}
      </div>

      {approvedCount > 0 && !anySelected && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {approvedCount} idea{approvedCount !== 1 ? "s" : ""} approved — ready to script
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              Click Write Script on any card to open AI Coach
            </p>
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              const first = cards.find((c) => c.status === "approved");
              if (first) handleWriteScript(first);
            }}
          >
            Write First Script
          </Button>
        </div>
      )}

      {cardsQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      )}

      {!cardsQuery.isLoading && cards.length === 0 && (
        <div className="border border-border rounded-lg p-8 text-center">
          <Film className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No plan yet. Generate your first 30-day plan.</p>
          <Button className="mt-4" onClick={() => setPhase("setup")}>
            Get started
          </Button>
        </div>
      )}

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

      {anySelected && (
        <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center pb-5 px-4 pointer-events-none z-50">
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
