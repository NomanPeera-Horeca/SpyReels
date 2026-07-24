import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { STUDIO_PREFILL_KEY } from "@shared/studioHeit";
import {
  buildPlanPrefill,
  parseStudioPrefillMeta,
  STUDIO_PREFILL_META_KEY,
  type CoachCapabilityId,
  type StudioPrefillMeta,
} from "@shared/studioCoachUi";
import { buildCoachModeActions, type CoachModeAction } from "@shared/coachModeActions";
import {
  buildIdeaStarterHeroSubhead,
  buildIdeaStarterPanelHeader,
} from "@shared/ideaStarterPrompts";
import type { CoachAction } from "@shared/studioCoachAgent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import { AiCoachResultView, type CoachResultScript } from "@/components/AiCoachResultView";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import { AiCoachCommandShell } from "@/components/AiCoachCommandShell";
import { AiCoachHistoryPanel } from "@/components/AiCoachHistoryPanel";
import { FounderInterviewBanner } from "@/components/FounderInterviewBanner";
import { combineBodyFromSections, flattenCoachScriptForCopy, parseCoachHookVariations, parseProductionNotes, type CoachHookVariation } from "@shared/coachScriptSections";
import { scriptFilmPath } from "@shared/scriptFilm";
import { resolvePrimaryNicheLabel } from "@shared/primaryNiche";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMobileCreateAppContext } from "@/contexts/MobileCreateAppContext";
import { useAgentProgressPoll } from "@/hooks/useAgentProgressPoll";
import {
  COACH_AGENT_FOOTER,
  buildCoachScriptProgressSteps,
} from "@shared/coachAgentProgress";
import type { AgentProgressStep } from "@shared/agentProgress";
import { isSparkOrPlanPrefill, shouldSkipCoachAnalyze } from "@shared/coachAnalyze";
import {
  formatCoachSaveScheduleLabel,
  pickDefaultPostSchedule,
  postDateFromPlanDay,
} from "@shared/coachScriptSave";
import {
  parseStudioRemakeSchedulePrefill,
  STUDIO_REMAKE_SCHEDULE_KEY,
} from "@shared/remakeStudioImport";

type FactCheck = {
  hasClaim: boolean;
  status: string;
  claimSummary: string | null;
  warning: string | null;
  safeAngle: string | null;
};

type AnalysisResult = {
  confidence: number;
  understood: string;
  gaps: string[];
  questions: string[];
  factCheck?: FactCheck;
};

type Phase = "idle" | "analyzing" | "clarifying" | "generating" | "result";

type PlanCardOption = {
  id: number;
  day: number;
  title: string;
  hook: string;
  angle: string;
  status: string;
};

export default function AiCoach() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const mobileCreate = useMobileCreateAppContext();
  const utils = trpc.useUtils();
  const [description, setDescription] = useState("");
  const [attachedContext, setAttachedContext] = useState<StudioPrefillMeta | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [clarifications, setClarifications] = useState<{ question: string; answer: string }[]>([]);
  const [result, setResult] = useState<CoachResultScript | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState({
    hook: "",
    explain: "",
    illustrate: "",
    teach: "",
    cta: "",
    hookVisualBeat: "",
    hookOnScreenText: "",
  });
  const [refineInput, setRefineInput] = useState("");
  const [hookVariations, setHookVariations] = useState<CoachHookVariation[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedLibraryScriptId, setSavedLibraryScriptId] = useState<number | null>(null);
  const [postDate, setPostDate] = useState<Date | undefined>(() => pickDefaultPostSchedule().postDate);
  const [postTime, setPostTime] = useState("09:00");
  const [saveNotes, setSaveNotes] = useState("");
  const [filmNowPending, setFilmNowPending] = useState(false);
  const pendingFilmRef = useRef(false);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [activeCapability, setActiveCapability] = useState<CoachCapabilityId | null>(null);
  const [pendingScriptId, setPendingScriptId] = useState<number | null>(null);

  const { data: historyData, isLoading: historyLoading } = trpc.studio.list.useQuery(
    { limit: 50 },
    {
      staleTime: 30_000,
    }
  );
  const { data: savedScriptsList } = trpc.scripts.list.useQuery({}, { staleTime: 60_000 });
  const { data: planData } = trpc.plan.listCards.useQuery(undefined, { staleTime: 60_000 });
  const { data: onboardingState } = trpc.onboarding.getState.useQuery(undefined, {
    staleTime: 60_000,
  });

  const planCards = planData?.cards ?? [];
  const recentScripts = historyData?.scripts ?? [];
  const savedScriptsCount = savedScriptsList?.length ?? 0;

  const modeActions = useMemo(() => {
    if (!activeCapability) return [];
    return buildCoachModeActions({
      capability: activeCapability,
      nicheContext: onboardingState,
      planCards,
      recentScripts: recentScripts.map((script) => ({
        id: script.id,
        title: script.title,
      })),
    });
  }, [activeCapability, onboardingState, planCards, recentScripts]);

  const heroSubhead = useMemo(
    () => buildIdeaStarterHeroSubhead(onboardingState),
    [onboardingState]
  );
  const writePanelHeader = useMemo(
    () => buildIdeaStarterPanelHeader(onboardingState),
    [onboardingState]
  );

  useEffect(() => {
    const prefill = sessionStorage.getItem(STUDIO_PREFILL_KEY);
    const metaRaw = sessionStorage.getItem(STUDIO_PREFILL_META_KEY);
    const meta = parseStudioPrefillMeta(metaRaw);
    if (prefill) {
      setDescription(prefill);
      sessionStorage.removeItem(STUDIO_PREFILL_KEY);
    }
    if (meta) {
      setAttachedContext(meta);
      sessionStorage.removeItem(STUDIO_PREFILL_META_KEY);
    }
    if (prefill || meta) {
      setPhase("idle");
      setResult(null);
      setEditMode(false);
      setHookVariations(null);
      setAnalysis(null);
      setClarifications([]);
      // Prefill the composer; keep the suggestion list closed until the user
      // explicitly clicks Write new script / From 30-day plan / etc.
      setActiveCapability(null);
      posthog?.capture("ai_coach_prefill_loaded", {
        has_plan_card: Boolean(meta?.planCardId),
      });
    }
  }, [posthog]);

  const launchQueryHandledRef = useRef(false);

  const applyScriptResult = (data: CoachResultScript) => {
    setResult(data);
    const production = parseProductionNotes(data.productionNotes) ?? {};
    setEditDraft({
      hook: data.hook,
      explain: data.explain,
      illustrate: data.illustrate,
      teach: data.teach,
      cta: data.cta,
      hookVisualBeat: production.hookVisualBeat?.trim() ?? "",
      hookOnScreenText:
        production.hookOnScreenText?.trim() ||
        production.textOverlay?.trim() ||
        "",
    });
    setPhase("result");
    setEditMode(false);
    setHookVariations(null);
  };

  // Same 2s interval as remake/transcription polling while production notes generate.
  const productionPollEnabled =
    Boolean(result?.id) &&
    (result?.productionNotesStatus === "processing" ||
      result?.productionNotesStatus === "pending");
  const productionPollQuery = trpc.studio.get.useQuery(
    { id: result?.id ?? 0 },
    {
      enabled: productionPollEnabled,
      refetchInterval: (query) => {
        const status =
          query.state.data?.productionNotesStatus ?? result?.productionNotesStatus;
        return status === "processing" || status === "pending" ? 2000 : false;
      },
    }
  );

  useEffect(() => {
    const data = productionPollQuery.data;
    if (!data || !result || data.id !== result.id) return;
    if (
      data.productionNotesStatus === result.productionNotesStatus &&
      data.productionNotes === result.productionNotes
    ) {
      return;
    }
    applyScriptResult(data);
  }, [
    productionPollQuery.data,
    result?.id,
    result?.productionNotes,
    result?.productionNotesStatus,
  ]);

  const resolveIntentMutation = trpc.studio.resolveIntent.useMutation();

  const buildGenerateInput = (overrides?: {
    description?: string;
    clarifications?: { question: string; answer: string }[];
  }) => ({
    description: overrides?.description ?? description,
    clarifications: overrides?.clarifications ?? [],
    planCardId: attachedContext?.planCardId,
    audienceSignalIds: attachedContext?.audienceSignalId
      ? [attachedContext.audienceSignalId]
      : [],
  });

  const generateMutation = trpc.studio.generate.useMutation({
    onSuccess: (data) => {
      applyScriptResult(data);
      void utils.studio.list.invalidate();
      posthog?.capture("ai_coach_script_generated", {
        script_id: data.id,
        plan_card_id: attachedContext?.planCardId ?? null,
      });
    },
    onError: (err) => {
      toast.error(err.message);
      setPhase("idle");
    },
  });

  const fetchCoachProgress = useMemo(
    () => () => utils.studio.getGenerationProgress.fetch(undefined, { staleTime: 0 }),
    [utils.studio.getGenerationProgress]
  );

  const coachProgressSteps = useAgentProgressPoll({
    enabled: phase === "generating" && generateMutation.isPending,
    initialSteps: buildCoachScriptProgressSteps("read_profile"),
    fetchProgress: fetchCoachProgress,
  });

  const analyzingSteps = useMemo<AgentProgressStep[]>(
    () => [{ id: "analyze", label: "Understanding your idea", status: "active" }],
    []
  );

  const analyzeMutation = trpc.studio.analyze.useMutation({
    onSuccess: (data) => {
      setAnalysis(data);
      const hasQ = data.questions?.length > 0;
      const hasBadFact =
        data.factCheck?.hasClaim &&
        ["viral_rumor", "likely_false", "satire"].includes(data.factCheck.status);
      if (hasQ || hasBadFact) {
        setClarifications((data.questions ?? []).map((q) => ({ question: q, answer: "" })));
        setPhase("clarifying");
      } else {
        setPhase("generating");
        generateMutation.mutate(buildGenerateInput({ clarifications: [] }));
      }
    },
    onError: () => {
      toast.message("Could not analyze your idea. Writing your script anyway...");
      setPhase("generating");
      generateMutation.mutate(buildGenerateInput({ clarifications: [] }));
    },
  });

  const refineMutation = trpc.studio.refine.useMutation({
    onSuccess: (data) => {
      applyScriptResult(data);
      setRefineInput("");
      void utils.studio.list.invalidate();
      posthog?.capture("ai_coach_script_refined", { script_id: data.id });
    },
    onError: (err) => {
      toast.error(err.message);
      setPhase(result ? "result" : "idle");
    },
  });

  const updateMutation = trpc.studio.update.useMutation({
    onSuccess: (data) => {
      applyScriptResult(data);
      setEditMode(false);
      void utils.studio.list.invalidate();
      posthog?.capture("ai_coach_script_updated", { script_id: data.id });
      toast.success("Script saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const saveToLibraryMutation = trpc.studio.saveToLibrary.useMutation({
    onSuccess: (data, variables) => {
      setSavedLibraryScriptId(data.savedScriptId);
      void utils.scripts.list.invalidate();
      void utils.library.scripts.invalidate();
      posthog?.capture("ai_coach_saved_to_library", {
        script_id: result?.id,
        saved_script_id: data.savedScriptId,
        with_date: variables.addToCalendar ?? true,
        updated: data.updated ?? false,
      });
      if (pendingFilmRef.current) {
        pendingFilmRef.current = false;
        setFilmNowPending(false);
        posthog?.capture("ai_coach_film_now", {
          script_id: result?.id,
          saved_script_id: data.savedScriptId,
        });
        setLocation(scriptFilmPath(data.savedScriptId));
        return;
      }
      const label =
        variables.addToCalendar && postDate
          ? formatCoachSaveScheduleLabel(postDate, variables.postTime ?? postTime)
          : null;
      toast.success(
        label ? `Saved to My Scripts for ${label}` : "Saved to My Scripts"
      );
    },
    onError: (err) => {
      pendingFilmRef.current = false;
      setFilmNowPending(false);
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (!result) return;

    const raw = sessionStorage.getItem(STUDIO_REMAKE_SCHEDULE_KEY);
    const prefill = parseStudioRemakeSchedulePrefill(raw);
    if (prefill) {
      sessionStorage.removeItem(STUDIO_REMAKE_SCHEDULE_KEY);
      setSavedLibraryScriptId(null);
      if (prefill.postDate) {
        const parsed = new Date(`${prefill.postDate}T12:00:00`);
        if (!Number.isNaN(parsed.getTime())) setPostDate(parsed);
      }
      if (prefill.postTime) setPostTime(prefill.postTime);
      setSaveNotes(prefill.notes ?? "");
      return;
    }

    const existing = savedScriptsList?.find((s) => s.coachScriptId === result.id);
    if (existing) {
      setSavedLibraryScriptId(existing.id);
      setPostDate(existing.postDate ? new Date(existing.postDate) : pickDefaultPostSchedule().postDate);
      setPostTime(existing.postTime || "09:00");
      setSaveNotes(existing.notes && existing.notes !== "Saved from AI Coach" ? existing.notes : "");
      return;
    }

    setSavedLibraryScriptId(null);
    const planCard = planCards.find((c) => c.id === attachedContext?.planCardId);
    if (planCard?.day) {
      setPostDate(postDateFromPlanDay(planCard.day));
      setPostTime("09:00");
    } else {
      const defaults = pickDefaultPostSchedule();
      setPostDate(defaults.postDate);
      setPostTime(defaults.postTime);
    }
    setSaveNotes("");
  }, [result?.id, savedScriptsList, attachedContext?.planCardId, planCards]);

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
          posthog?.capture("ai_coach_hook_variations_generated", { script_id: result?.id });
          return;
        }
        toast.error("Could not read hook variations. Try again.");
        return;
      }
      setHookVariations(parsed);
      posthog?.capture("ai_coach_hook_variations_generated", { script_id: result?.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const applyHookVariation = (variation: CoachHookVariation) => {
    if (!result) return;
    const production = parseProductionNotes(result.productionNotes) ?? {};
    const updatedNotes = JSON.stringify({
      ...production,
      hookVisualBeat: variation.visualHook,
      hookOnScreenText: variation.onScreenText,
      frame0OnScreenText: variation.onScreenText,
      textOverlay: variation.onScreenText,
      hookType: variation.hookType,
    });
    setResult({
      ...result,
      hook: variation.spokenHook,
      productionNotes: updatedNotes,
    });
    setEditDraft((draft) => ({
      ...draft,
      hook: variation.spokenHook,
      hookVisualBeat: variation.visualHook,
      hookOnScreenText: variation.onScreenText,
    }));
    setHookVariations(null);
  };

  const reset = () => {
    setPhase("idle");
    setDescription("");
    setAnalysis(null);
    setClarifications([]);
    setResult(null);
    setEditMode(false);
    setHookVariations(null);
    setAttachedContext(null);
    setAgentMessage(null);
    setIsRouting(false);
    setActiveCapability(null);
    setPendingScriptId(null);
    setSavedLibraryScriptId(null);
    setPostDate(pickDefaultPostSchedule().postDate);
    setPostTime("09:00");
    setSaveNotes("");
    pendingFilmRef.current = false;
    setFilmNowPending(false);
  };

  useEffect(() => {
    if (launchQueryHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      launchQueryHandledRef.current = true;
      reset();
      window.history.replaceState(null, "", "/studio");
      return;
    }
    const scriptIdRaw = params.get("script");
    if (!scriptIdRaw) return;
    const id = Number(scriptIdRaw);
    if (!Number.isFinite(id) || id <= 0) return;
    launchQueryHandledRef.current = true;
    void utils.studio.get
      .fetch({ id })
      .then((data) => {
        applyScriptResult(data);
        posthog?.capture("ai_coach_script_loaded", { script_id: id, source: "url_param" });
      })
      .catch(() => {
        toast.error("Could not load that script");
      });
    window.history.replaceState(null, "", "/studio");
  }, [posthog, utils.studio.get]);

  const goFilm = (savedScriptId: number) => {
    posthog?.capture("ai_coach_film_now", {
      script_id: result?.id,
      saved_script_id: savedScriptId,
    });
    setLocation(scriptFilmPath(savedScriptId));
  };

  const saveCoachScript = (withDate: boolean, extras?: { caption: string; hashtags: string[] }) => {
    if (!result) return;
    pendingFilmRef.current = false;
    saveToLibraryMutation.mutate({
      id: result.id,
      addToCalendar: withDate,
      postDate: withDate && postDate ? postDate.toISOString().slice(0, 10) : undefined,
      postTime: withDate ? postTime : undefined,
      notes: saveNotes.trim() || undefined,
      generatedCaption: extras?.caption?.trim() || undefined,
      generatedHashtags: extras?.hashtags?.length ? extras.hashtags : undefined,
    });
  };

  const handleSaveToMyScripts = () => {
    if (savedLibraryScriptId) {
      handleOpenMyScripts();
      return;
    }
    saveCoachScript(true);
  };

  const handleOpenMyScripts = () => {
    if (savedLibraryScriptId) {
      setLocation(`/scripts/${savedLibraryScriptId}`);
      return;
    }
    setLocation("/scripts");
  };

  const handleFilmNow = () => {
    if (!result) return;
    if (savedLibraryScriptId) {
      goFilm(savedLibraryScriptId);
      return;
    }
    pendingFilmRef.current = true;
    setFilmNowPending(true);
    saveToLibraryMutation.mutate({
      id: result.id,
      addToCalendar: true,
      postDate: postDate ? postDate.toISOString().slice(0, 10) : undefined,
      postTime,
      notes: saveNotes.trim() || undefined,
    });
  };

  const beginWriteFlow = (trimmed: string) => {
    posthog?.capture("ai_coach_started", {
      plan_card_id: attachedContext?.planCardId ?? null,
    });
    setAgentMessage("Writing your viral script...");
    if (shouldSkipCoachAnalyze(trimmed, { planCardId: attachedContext?.planCardId })) {
      setPhase("generating");
      generateMutation.mutate(buildGenerateInput({ description: trimmed }));
      return;
    }
    setPhase("analyzing");
    analyzeMutation.mutate({ description: trimmed });
  };

  const executeCoachAction = async (action: CoachAction, trimmed: string) => {
    if (action.assistantMessage) {
      setAgentMessage(action.assistantMessage);
    }

    switch (action.tool) {
      case "load_plan_card": {
        // Never replace a Spark or plan prompt the user already filled and submitted.
        // Old from_plan routing did that and looped without generating a script.
        if (trimmed.length >= 10 && isSparkOrPlanPrefill(trimmed)) {
          beginWriteFlow(trimmed);
          setIsRouting(false);
          return;
        }
        const card =
          planCards.find((c) => c.id === action.planCardId) ??
          planCards.find((c) => c.status === "approved") ??
          planCards[0];
        if (!card) {
          toast.message("Generate a 30-day plan first, then come back here.");
          setPhase("idle");
          setIsRouting(false);
          return;
        }
        attachPlanCard(card);
        setPhase("idle");
        setIsRouting(false);
        toast.message(action.assistantMessage ?? "Plan idea attached. Hit the arrow to write your script.");
        return;
      }
      case "refine_script": {
        const scriptId = action.scriptId ?? recentScripts[0]?.id;
        if (!scriptId) {
          toast.message("Write a script first, then refine it here.");
          setPhase("idle");
          setIsRouting(false);
          return;
        }
        setPhase("generating");
        const loaded = await utils.studio.get.fetch({ id: scriptId });
        applyScriptResult(loaded);
        const instruction = action.refineInstruction?.trim() ?? trimmed;
        if (instruction.length >= 8) {
          refineMutation.mutate({ id: scriptId, instruction });
        } else {
          setRefineInput(instruction);
          setPhase("result");
          toast.message("Add a refine instruction below your script.");
        }
        setIsRouting(false);
        return;
      }
      case "generate_hook_ideas": {
        if (isSparkOrPlanPrefill(trimmed)) {
          beginWriteFlow(trimmed);
          setIsRouting(false);
          return;
        }
        const scriptId = action.scriptId ?? recentScripts[0]?.id;
        if (!scriptId) {
          toast.message("Write a script first, then try new hook ideas.");
          setPhase("idle");
          setIsRouting(false);
          return;
        }
        setPhase("generating");
        setAgentMessage("Generating new hook ideas...");
        const loaded = await utils.studio.get.fetch({ id: scriptId });
        applyScriptResult(loaded);
        hookVariationsMutation.mutate({ id: scriptId });
        setIsRouting(false);
        return;
      }
      case "write_viral_script":
      default:
        beginWriteFlow(trimmed);
        setIsRouting(false);
    }
  };

  const runCoachFlow = async (capabilityId?: CoachCapabilityId) => {
    const trimmed = description.trim();
    if (!capabilityId && !trimmed) return;

    setIsRouting(true);
    setAgentMessage("Understanding what you want to do...");

    try {
      const action = await resolveIntentMutation.mutateAsync({
        message: trimmed || "Write a viral script from my idea",
        capabilityId,
        activeScriptId: pendingScriptId ?? result?.id,
        attachedPlanCardId: attachedContext?.planCardId,
      });

      posthog?.capture("ai_coach_agent_routed", {
        tool: action.tool,
        source: action.source,
        confidence: action.confidence,
      });

      await executeCoachAction(action, trimmed);
    } catch {
      toast.error("Could not route your request. Writing a new script instead.");
      beginWriteFlow(trimmed || description.trim());
      setIsRouting(false);
    }
  };

  const loadScript = async (id: number) => {
    try {
      const data = await utils.studio.get.fetch({ id });
      applyScriptResult(data);
      setHistoryOpen(false);
      posthog?.capture("ai_coach_script_loaded", { script_id: id });
    } catch {
      toast.error("Could not load that script");
    }
  };

  const applyPlanContext = (card: PlanCardOption) => {
    setAttachedContext((prev) => ({
      ...prev,
      planCardId: card.id,
      planCardTitle: card.title,
      planCardDay: card.day,
    }));
    posthog?.capture("ai_coach_context_attached", {
      type: "plan_card",
      plan_card_id: card.id,
    });
  };

  const attachPlanCard = (card: PlanCardOption) => {
    applyPlanContext(card);
    setDescription(buildPlanPrefill(card));
  };

  const clearPlanContext = () => {
    setAttachedContext((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      delete next.planCardId;
      delete next.planCardTitle;
      delete next.planCardDay;
      return Object.keys(next).length > 0 ? next : null;
    });
  };

  const handleCapabilitySelect = (id: CoachCapabilityId | null) => {
    setActiveCapability(id);
  };

  const handleActionApplied = (action: CoachModeAction) => {
    if (action.planCardId != null) {
      const card = planCards.find((c) => c.id === action.planCardId);
      if (card) applyPlanContext(card);
    } else {
      clearPlanContext();
    }
    setPendingScriptId(action.scriptId ?? null);
    // Keep prompt filled; close the list until the user opens a mode again.
    setActiveCapability(null);
  };

  const handleSubmit = () => {
    const trimmed = description.trim();
    if (trimmed.length < 10) {
      toast.error("Add a bit more detail about your idea (at least 10 characters).");
      return;
    }
    // Spark Deck or plan day already in the box: always write.
    // from_plan alone is only for picking a day when the box is empty.
    const capability =
      attachedContext?.planCardId != null || isSparkOrPlanPrefill(trimmed)
        ? "write_script"
        : (activeCapability ?? undefined);
    void runCoachFlow(capability);
  };

  const historyPanel = (
    <AiCoachHistoryPanel
      scripts={recentScripts}
      activeScriptId={result?.id ?? null}
      onSelect={(id) => void loadScript(id)}
      onNewScript={reset}
      loading={historyLoading}
    />
  );

  const shellLayout = (content: ReactNode) => (
    <div className={mobileCreate ? "flex min-h-[70vh]" : "-mx-2 flex min-h-[80vh] sm:-mx-4"}>
      <aside className="hidden w-72 shrink-0 border-r lg:block">{historyPanel}</aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-2 border-b px-3 py-2 lg:hidden">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <History className="h-3.5 w-3.5" />
                Recent scripts
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(100vw-2rem,20rem)] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Recent scripts</SheetTitle>
              </SheetHeader>
              {historyPanel}
            </SheetContent>
          </Sheet>
        </div>
        {content}
        <FounderInterviewBanner scriptsCount={savedScriptsCount} />
      </div>
    </div>
  );

  if (phase === "idle") {
    return shellLayout(
      <AiCoachCommandShell
        description={description}
        onDescriptionChange={setDescription}
        onSubmit={handleSubmit}
        isBusy={isRouting || resolveIntentMutation.isPending || analyzeMutation.isPending}
        attachedContext={attachedContext}
        onClearPlanContext={clearPlanContext}
        activeCapability={activeCapability}
        onCapabilitySelect={handleCapabilitySelect}
        modeActions={modeActions}
        onActionApplied={handleActionApplied}
        heroSubhead={heroSubhead}
        writePanelHeader={writePanelHeader}
      />
    );
  }

  if (phase === "analyzing" || phase === "generating") {
    const isRefining = refineMutation.isPending;
    const isHookVariations = hookVariationsMutation.isPending;
    const showCoachProgress =
      phase === "generating" && generateMutation.isPending && !isRefining && !isHookVariations;

    if (showCoachProgress || phase === "analyzing") {
      const steps = phase === "analyzing" ? analyzingSteps : coachProgressSteps;
      const subheadline =
        phase === "analyzing"
          ? agentMessage ?? "Checking context before writing your script"
          : `Tailored to your idea. Usually 20 to 40 seconds.`;

      return shellLayout(
        <AgentProgressPanel
          steps={steps}
          subheadline={subheadline}
          footer={phase === "generating" ? COACH_AGENT_FOOTER : undefined}
          badgeLabel={phase === "analyzing" ? "Understanding" : "Writing"}
        />
      );
    }

    const statusTitle = isRefining
      ? "Refining your script..."
      : isHookVariations
        ? "Generating new hook ideas..."
        : "Working on your script...";

    return shellLayout(
      <div className="flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="flex items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div>
                <p className="font-semibold">{statusTitle}</p>
                <p className="text-sm text-muted-foreground">
                  {agentMessage ?? "This usually takes a few seconds"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "clarifying" && analysis) {
    return shellLayout(
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950/30">
            <p className="mb-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
              Here&apos;s what I understood
            </p>
            <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">{analysis.understood}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-blue-200 dark:bg-blue-900">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${analysis.confidence}%` }}
                />
              </div>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                {analysis.confidence}% confident
              </span>
            </div>
          </div>

          {analysis.factCheck?.warning ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              {analysis.factCheck.warning}
            </div>
          ) : null}

          {clarifications.map((c, i) => (
            <div key={c.question} className="rounded-2xl border border-border bg-card p-5">
              <p className="mb-2 text-sm font-semibold">{c.question}</p>
              <Textarea
                value={c.answer}
                onChange={(e) =>
                  setClarifications((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x))
                  )
                }
                placeholder="Your answer..."
                className="min-h-[80px] resize-none"
                autoFocus={i === 0}
              />
            </div>
          ))}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setPhase("generating");
                generateMutation.mutate(buildGenerateInput({ clarifications: [] }));
              }}
            >
              Skip
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setPhase("generating");
                generateMutation.mutate(buildGenerateInput({ clarifications }));
              }}
            >
              Write my viral script
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    return shellLayout(
      <AiCoachResultView
        result={result}
        editMode={editMode}
        editDraft={editDraft}
        onEditDraftChange={setEditDraft}
        refineInput={refineInput}
        onRefineInputChange={setRefineInput}
        onRefine={() => {
          if (refineInput.trim()) {
            refineMutation.mutate({ id: result.id, instruction: refineInput });
          }
        }}
        onReset={reset}
        onToggleEdit={() => setEditMode(true)}
        onSaveEdits={() => {
          updateMutation.mutate({
            id: result.id,
            hook: editDraft.hook,
            explain: editDraft.explain,
            illustrate: editDraft.illustrate,
            teach: editDraft.teach,
            cta: editDraft.cta,
            hookVisualBeat: editDraft.hookVisualBeat,
            hookOnScreenText: editDraft.hookOnScreenText,
          });
        }}
        onCancelEdit={() => {
          const production = parseProductionNotes(result.productionNotes) ?? {};
          setEditDraft({
            hook: result.hook,
            explain: result.explain,
            illustrate: result.illustrate,
            teach: result.teach,
            cta: result.cta,
            hookVisualBeat: production.hookVisualBeat?.trim() ?? "",
            hookOnScreenText:
              production.hookOnScreenText?.trim() ||
              production.textOverlay?.trim() ||
              "",
          });
          setEditMode(false);
        }}
        hookVariations={hookVariations}
        onRequestHookVariations={() => hookVariationsMutation.mutate({ id: result.id })}
        hookVariationsPending={hookVariationsMutation.isPending}
        onApplyHookVariation={applyHookVariation}
        onDismissHookVariations={() => setHookVariations(null)}
        refinePending={refineMutation.isPending}
        savePending={updateMutation.isPending}
        scheduleSave={{
          coachScriptId: result.id,
          scriptContent: flattenCoachScriptForCopy({
            title: result.title,
            hook: result.hook,
            sections: {
              explain: result.explain,
              illustrate: result.illustrate,
              teach: result.teach,
              cta: result.cta,
            },
            userFriendly: true,
          }),
          niche: resolvePrimaryNicheLabel({
            businessDescription: onboardingState?.businessDescription,
            selectedNicheSlugs: onboardingState?.selectedNicheSlugs,
          }) || undefined,
          postDate,
          onPostDateChange: setPostDate,
          postTime,
          onPostTimeChange: setPostTime,
          notes: saveNotes,
          onNotesChange: setSaveNotes,
          savedScriptId: savedLibraryScriptId,
          initialCaption:
            savedScriptsList?.find((s) => s.coachScriptId === result.id)?.generatedCaption ?? null,
          initialHashtagsJson:
            savedScriptsList?.find((s) => s.coachScriptId === result.id)?.generatedHashtags ?? null,
          isSaving: saveToLibraryMutation.isPending && !filmNowPending,
          onSave: saveCoachScript,
          onOpenMyScripts: handleOpenMyScripts,
        }}
        onSaveToMyScripts={handleSaveToMyScripts}
        saveToMyScriptsPending={saveToLibraryMutation.isPending && !filmNowPending}
        savedScriptId={savedLibraryScriptId}
        onOpenMyScripts={handleOpenMyScripts}
        onFilmNow={mobileCreate ? handleFilmNow : undefined}
        filmNowPending={filmNowPending && saveToLibraryMutation.isPending}
      />
    );
  }

  return null;
}
