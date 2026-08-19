import { useMemo, useState } from "react";
import { ChevronRight, CalendarDays, Flame, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AiCoachResultView,
  type CoachResultScript,
} from "@/components/AiCoachResultView";
import { isMobileCreateApp } from "@/lib/mobileCreateApp";
import { trpc } from "@/lib/trpc";
import { scriptFilmPath } from "@shared/scriptFilm";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  DISCOVERY_AUTORUN_KEY,
  DISCOVERY_PREFILL_KEY,
  ONBOARDING_AHA_SCRIPT_KEY,
  ONBOARDING_PLAN_AUTOSTART_KEY,
} from "@shared/onboardingFlow";
import {
  parseCoachHookVariations,
  parseProductionNotes,
  type CoachHookVariation,
} from "@shared/coachScriptSections";

type OnboardingAhaViewProps = {
  script: CoachResultScript;
  niche: string;
  audience: string;
  selectedNicheSlugs: string[];
  subtitle?: string;
  proofDetail?: string;
};

function shortLabel(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildDiscoveryPrefill(niche: string, audience: string): string {
  const nicheText = niche.trim();
  const audienceText = audience.trim();
  if (nicheText && audienceText) {
    return `I create content about ${nicheText} for ${audienceText}.`;
  }
  return nicheText || audienceText;
}

export function OnboardingAhaView({
  script,
  niche,
  audience,
  selectedNicheSlugs,
  subtitle,
  proofDetail,
}: OnboardingAhaViewProps) {
  const [, setLocation] = useLocation();
  const mobileCreate = isMobileCreateApp();
  const [filmNowPending, setFilmNowPending] = useState(false);
  const [savedLibraryScriptId, setSavedLibraryScriptId] = useState<number | null>(null);
  const [displayScript, setDisplayScript] = useState(script);
  const [hookVariations, setHookVariations] = useState<CoachHookVariation[] | null>(null);

  const hookVariationsMutation = trpc.studio.hookVariations.useMutation({
    onSuccess: (data) => {
      const parsed = parseCoachHookVariations(data);
      if (!parsed || parsed.length === 0) {
        const legacy = parseCoachHookVariations({
          context: typeof data.context === "string" ? data.context : "",
          contrarian: typeof data.contrarian === "string" ? data.contrarian : "",
          intrigue: typeof data.intrigue === "string" ? data.intrigue : "",
        });
        if (legacy && legacy.length > 0) {
          setHookVariations(legacy);
          return;
        }
        toast.error("Could not read hook variations. Try again.");
        return;
      }
      setHookVariations(parsed);
    },
    onError: (err) => toast.error(err.message),
  });

  const applyHookVariation = (variation: CoachHookVariation) => {
    const production = parseProductionNotes(displayScript.productionNotes) ?? {};
    const updatedNotes = JSON.stringify({
      ...production,
      hookVisualBeat: variation.visualHook,
      hookOnScreenText: variation.onScreenText,
      hookType: variation.hookType,
    });
    setDisplayScript({
      ...displayScript,
      hook: variation.spokenHook,
      productionNotes: updatedNotes,
    });
    // Keep compare grid open; selection updates the hook above.
  };

  const saveToLibraryMutation = trpc.studio.saveToLibrary.useMutation({
    onSuccess: (data) => {
      setSavedLibraryScriptId(data.savedScriptId);
      if (filmNowPending) {
        setFilmNowPending(false);
        sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
        setLocation(scriptFilmPath(data.savedScriptId));
      }
    },
    onError: (err) => {
      setFilmNowPending(false);
      toast.error(err.message);
    },
  });

  const proofLine = useMemo(() => {
    const n = niche.toLowerCase();
    if (n.includes("finance") || n.includes("money")) {
      return "Myth-bust hooks are trending in personal finance";
    }
    if (n.includes("fit") || n.includes("weight") || n.includes("gym")) {
      return "Question hooks are winning for fitness creators this week";
    }
    return "Story hooks are performing in your niche";
  }, [niche]);

  const goStudio = (query: string) => {
    sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
    setLocation(`/studio${query}`);
  };

  const handleFilmNow = () => {
    if (savedLibraryScriptId) {
      sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
      setLocation(scriptFilmPath(savedLibraryScriptId));
      return;
    }
    setFilmNowPending(true);
    saveToLibraryMutation.mutate({
      id: displayScript.id,
      addToCalendar: true,
    });
  };

  const handleSteerPlan = () => {
    sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
    sessionStorage.setItem(ONBOARDING_PLAN_AUTOSTART_KEY, "1");
    setLocation("/plan");
  };

  const handleSteerReels = () => {
    sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
    setLocation("/research");
  };

  const handleSteerCreators = () => {
    sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
    const prefill = buildDiscoveryPrefill(niche, audience);
    sessionStorage.setItem(DISCOVERY_PREFILL_KEY, prefill);
    sessionStorage.setItem(DISCOVERY_AUTORUN_KEY, "1");
    setLocation("/discover-creators");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6">
      <div className="mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          ✓ Your first script is ready
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">Film this today</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle ?? "Written for your niche and audience. No blank prompt box."}
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="relative h-[68px] w-[52px] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-violet-900 to-violet-500">
          <span className="absolute inset-0 grid place-items-center text-white text-sm">▶</span>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            What is working in your niche
          </p>
          <p className="text-sm font-semibold leading-snug">{proofLine}</p>
          <p className="text-xs text-muted-foreground">
            {proofDetail ?? `Based on formats winning in ${shortLabel(niche, 36)}`}
          </p>
        </div>
      </div>

      <div className="-mx-2 sm:-mx-4">
        <AiCoachResultView
          previewMode
          result={displayScript}
          editMode={false}
          editDraft={{
            hook: displayScript.hook,
            explain: displayScript.explain,
            illustrate: displayScript.illustrate,
            teach: displayScript.teach,
            cta: displayScript.cta,
            hookVisualBeat: "",
            hookOnScreenText: "",
          }}
          onEditDraftChange={() => {}}
          refineInput=""
          onRefineInputChange={() => {}}
          onRefine={() => {}}
          onReset={() => goStudio("?new=1")}
          onToggleEdit={() => {}}
          onSaveEdits={() => {}}
          onCancelEdit={() => {}}
          hookVariations={hookVariations}
          onRequestHookVariations={() => hookVariationsMutation.mutate({ id: displayScript.id })}
          hookVariationsPending={hookVariationsMutation.isPending}
          onApplyHookVariation={applyHookVariation}
          refinePending={false}
        />
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" className="w-full sm:w-auto" onClick={() => goStudio(`?script=${displayScript.id}`)}>
          See full script
        </Button>
        {mobileCreate ? (
          <Button
            type="button"
            variant="default"
            className="w-full gap-2 sm:w-auto"
            onClick={handleFilmNow}
            disabled={filmNowPending || saveToLibraryMutation.isPending}
          >
            <Video className="h-4 w-4" />
            {filmNowPending ? "Opening teleprompter..." : "Film now"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => goStudio("?new=1")}>
          Write another idea
        </Button>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          What&apos;s next
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSteerPlan}
            className="flex w-full items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-left transition hover:border-primary/40 hover:bg-primary/10"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">Get 30 viral-ready ideas</span>
                <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary-foreground">
                  Grow faster
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
                30 more viral ideas like this for {shortLabel(niche, 36)}. Built to get views, followers, and
                engagement.
              </span>
            </span>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          {!mobileCreate ? (
            <button
              type="button"
              onClick={handleSteerReels}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/30 hover:bg-muted/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Flame className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-bold">Find Reels going viral now</span>
                <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
                  See what&apos;s hitting millions of views in {shortLabel(niche, 36)}. Steal the hooks that blow up.
                </span>
              </span>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ) : null}

          {!mobileCreate ? (
            <button
              type="button"
              onClick={handleSteerCreators}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/30 hover:bg-muted/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-bold">Spy top creators</span>
                <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
                  Study creators winning with {shortLabel(audience, 32)} in {shortLabel(niche, 24)} to gain more
                  followers.
                </span>
              </span>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </div>

      {selectedNicheSlugs.length > 0 ? (
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Niche routed: {selectedNicheSlugs.slice(0, 2).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
