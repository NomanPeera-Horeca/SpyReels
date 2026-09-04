import { useAuth } from "@/_core/hooks/useAuth";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import { OnboardingAhaView } from "@/components/OnboardingAhaView";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";
import { Button } from "@/components/ui/button";
import { FEATURE_LAUNCH_DATE_ISO } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { normalizeAnalyticsHandle } from "@/lib/utils";
import {
  ONBOARDING_AGENT_FOOTER,
  buildOnboardingProgressSteps,
  personalizedOnboardingStepLabels,
} from "@shared/onboardingAgentProgress";
import {
  ONBOARDING_AUDIENCE_CHIPS,
  ONBOARDING_AHA_SCRIPT_KEY,
  ONBOARDING_NICHE_CHIPS,
} from "@shared/onboardingFlow";
import { usePostHog } from "@posthog/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { navigateAppReplace } from "@shared/appNavigation";
import { isMobileCreateApp } from "@/lib/mobileCreateApp";
import { toast } from "sonner";
import type { CoachResultScript } from "@/components/AiCoachResultView";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);

type OnboardingPhase = "step1" | "step2" | "loading" | "aha";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function OnboardingShell({
  children,
  onSkip,
  showSkip,
  step,
  variant = "standalone",
}: {
  children: React.ReactNode;
  onSkip?: () => void;
  showSkip: boolean;
  step: number | null;
  variant?: "standalone" | "dashboard";
}) {
  const progressBar =
    step != null ? (
      <div className="flex gap-2">
        {[1, 2].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-colors ${
              n <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    ) : null;

  if (variant === "dashboard") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {(progressBar || (showSkip && onSkip)) && (
          <div className="border-b border-border/50 px-4 py-4 sm:px-6">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-4">
              {progressBar ? <div className="min-w-0 flex-1">{progressBar}</div> : <div className="flex-1" />}
              {showSkip && onSkip ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Skip setup
                </button>
              ) : null}
            </div>
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0">
            <SpyReelsWordmark size="header" />
          </Link>
          {showSkip && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Skip setup
            </button>
          ) : null}
        </div>
      </header>

      {step != null ? (
        <div className="mx-auto flex max-w-2xl gap-2 px-4 pt-5 sm:px-6">{progressBar}</div>
      ) : null}

      {children}
    </div>
  );
}

export default function OnboardingPage() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<OnboardingPhase>("step1");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [ahaScript, setAhaScript] = useState<CoachResultScript | null>(null);
  const [selectedNicheSlugs, setSelectedNicheSlugs] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progressSteps, setProgressSteps] = useState(() =>
    buildOnboardingProgressSteps("save_profile")
  );
  const pollTimerRef = useRef<number | null>(null);
  const nicheChipUsedRef = useRef(false);
  const audienceChipUsedRef = useRef(false);
  const loadingAbandonedFiredRef = useRef(false);

  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });

  useEffect(() => {
    if (user) {
      posthog?.identify(String(user.id), {
        email: user.email,
        name: user.name,
      });
    }
  }, [posthog, user?.id, user?.email, user?.name]);

  const trpcUtils = trpc.useUtils();
  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const startCreatingMutation = trpc.onboarding.startCreating.useMutation();
  const skipMutation = trpc.onboarding.skip.useMutation();

  const shouldBypassOnboarding = useMemo(() => {
    if (!user) return false;
    const createdAt = toDate(user.createdAt);
    const isPreLaunchUser = !createdAt || createdAt.getTime() <= FEATURE_LAUNCH_DATE.getTime();
    if (isPreLaunchUser) return true;

    const state = onboardingStateQuery.data;
    if (!state) return false;
    return Boolean(state.onboardingCompletedAt || state.onboardingSkippedAt);
  }, [user, onboardingStateQuery.data]);

  useEffect(() => {
    if (loading || onboardingStateQuery.isLoading || !user) return;
    // Bypass users briefly sit on phase step1 while restoring aha; do not count that as a view.
    if (shouldBypassOnboarding && phase === "step1") return;

    if (phase === "step1") {
      posthog?.capture("onboarding_step1_viewed");
    } else if (phase === "step2") {
      posthog?.capture("onboarding_step2_viewed");
    } else if (phase === "loading") {
      posthog?.capture("onboarding_loading_started");
    } else if (phase === "aha") {
      posthog?.capture("onboarding_aha_viewed");
    }
  }, [
    phase,
    posthog,
    loading,
    onboardingStateQuery.isLoading,
    user,
    shouldBypassOnboarding,
  ]);

  useEffect(() => {
    if (phase !== "loading") {
      loadingAbandonedFiredRef.current = false;
      return;
    }

    const fireAbandoned = () => {
      if (loadingAbandonedFiredRef.current) return;
      loadingAbandonedFiredRef.current = true;
      posthog?.capture("onboarding_loading_abandoned");
    };

    const onBeforeUnload = () => {
      fireAbandoned();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") fireAbandoned();
    };
    const onPageHide = () => {
      fireAbandoned();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [phase, posthog]);

  useEffect(() => {
    if (!shouldBypassOnboarding || phase === "aha" || phase === "loading" || phase === "step2") return;
    if (sessionStorage.getItem(ONBOARDING_AHA_SCRIPT_KEY)) return;
    navigateAppReplace(setLocation, "/dashboard");
  }, [setLocation, shouldBypassOnboarding, phase]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const state = onboardingStateQuery.data;
    if (!state?.onboardingCompletedAt || phase !== "step1" || ahaScript) return;
    const savedIdRaw = sessionStorage.getItem(ONBOARDING_AHA_SCRIPT_KEY);
    if (!savedIdRaw) return;
    const savedId = Number(savedIdRaw);
    if (!Number.isFinite(savedId) || savedId <= 0) return;

    void trpcUtils.studio.get
      .fetch({ id: savedId })
      .then((script) => {
        setAhaScript(script as CoachResultScript);
        setNiche(state.businessDescription?.trim() || niche);
        setAudience(state.targetAudience?.trim() || audience);
        setSelectedNicheSlugs(state.selectedNicheSlugs ?? []);
        setPhase("aha");
      })
      .catch(() => {
        sessionStorage.removeItem(ONBOARDING_AHA_SCRIPT_KEY);
        navigateAppReplace(setLocation, "/dashboard");
      });
  }, [
    ahaScript,
    audience,
    niche,
    onboardingStateQuery.data,
    phase,
    setLocation,
    trpcUtils.studio.get,
  ]);

  const onSkip = async () => {
    const skipStep = phase === "step2" ? "step2" : "step1";
    posthog?.capture("onboarding_skip_clicked", { step: skipStep });
    try {
      const result = await skipMutation.mutateAsync();
      if (!result.alreadyDone) {
        posthog?.capture("onboarding_skipped");
        posthog?.capture("onboarding_completed", {
          niches_selected: 0,
          creators_selected: 0,
          demo_creator_handle: normalizeAnalyticsHandle(result.demoCreatorHandle ?? ""),
          demo_seeded: Boolean(result.demoJobId),
        });
      }
      await trpcUtils.onboarding.getState.invalidate();
      const skipDestination = isMobileCreateApp() ? "/plan" : "/research";
      navigateAppReplace(setLocation, skipDestination);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not skip setup");
    }
  };

  const completeStep1 = () => {
    const value = niche.trim();
    if (value.length < 3) return;
    posthog?.capture("onboarding_step1_completed", {
      char_count: value.length,
      chip_used: nicheChipUsedRef.current,
    });
    setPhase("step2");
  };

  const stopProgressPoll = () => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startProgressPoll = (businessDescription: string, targetAudience: string) => {
    stopProgressPoll();
    const labels = personalizedOnboardingStepLabels({
      niche: businessDescription,
      audience: targetAudience,
    });
    setProgressSteps(buildOnboardingProgressSteps("save_profile", undefined, labels));

    void trpcUtils.onboarding.getGenerationProgress
      .fetch(undefined, { staleTime: 0 })
      .then((progress) => {
        if (progress?.steps?.length) setProgressSteps(progress.steps);
      })
      .catch(() => undefined);

    pollTimerRef.current = window.setInterval(() => {
      void trpcUtils.onboarding.getGenerationProgress
        .fetch(undefined, { staleTime: 0 })
        .then((progress) => {
          if (!progress?.steps?.length) return;
          setProgressSteps(progress.steps);
        })
        .catch(() => {
          // Ignore transient poll errors while the mutation is still running.
        });
    }, 800);
  };

  const runStartCreating = async () => {
    const businessDescription = niche.trim();
    const targetAudience = audience.trim();
    if (businessDescription.length < 3 || targetAudience.length < 3) return;

    posthog?.capture("onboarding_step2_completed", {
      char_count: targetAudience.length,
      chip_used: audienceChipUsedRef.current,
    });

    setSubmitError(null);
    setPhase("loading");
    startProgressPoll(businessDescription, targetAudience);

    try {
      const result = await startCreatingMutation.mutateAsync({
        businessDescription,
        targetAudience,
      });

      stopProgressPoll();

      if (!result.script) {
        throw new Error("Script generation failed. Please try again.");
      }

      setAhaScript(result.script as CoachResultScript);
      setSelectedNicheSlugs(result.selectedNicheSlugs);
      sessionStorage.setItem(ONBOARDING_AHA_SCRIPT_KEY, String(result.script.id));
      setPhase("aha");

      if (!result.alreadyComplete) {
        posthog?.capture("onboarding_completed", {
          niches_selected: result.selectedNicheSlugs.length,
          creators_selected: 0,
          demo_creator_handle: normalizeAnalyticsHandle(result.demoCreatorHandle ?? ""),
          demo_seeded: Boolean(result.demoJobId),
          first_script_id: result.script.id,
        });
        posthog?.capture("onboarding_first_script_ready", {
          script_id: result.script.id,
        });
      }

      await trpcUtils.onboarding.getState.invalidate();
      void trpcUtils.studio.list.invalidate();
    } catch (err) {
      stopProgressPoll();
      console.error("Onboarding start creating failed", err);
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSubmitError(message);
      toast.error("Could not create your first script", { description: message });
      setPhase("step2");
    }
  };

  const shellVariant = isMobileCreateApp() ? "standalone" : "dashboard";

  if (loading || onboardingStateQuery.isLoading) {
    if (shellVariant === "dashboard") {
      return (
        <div className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;
  if (shouldBypassOnboarding && phase !== "aha" && phase !== "loading" && phase !== "step2") return null;

  if (phase === "loading" || startCreatingMutation.isPending) {
    return (
      <OnboardingShell showSkip={false} step={null} variant={shellVariant}>
        <AgentProgressPanel
          steps={progressSteps}
          subheadline={`Tailored for ${audience.trim().slice(0, 48) || "your audience"}. Usually 1-2 minutes.`}
          footer={ONBOARDING_AGENT_FOOTER}
          badgeLabel="Creating"
        />
      </OnboardingShell>
    );
  }

  if (phase === "aha" && ahaScript) {
    return (
      <OnboardingShell showSkip={false} step={null} variant={shellVariant}>
        <OnboardingAhaView
          script={ahaScript}
          niche={niche.trim() || "Your niche"}
          audience={audience.trim() || "Your audience"}
          selectedNicheSlugs={selectedNicheSlugs}
          onCtaClick={(cta) => {
            posthog?.capture("onboarding_aha_cta_clicked", { cta });
          }}
        />
      </OnboardingShell>
    );
  }

  const stepNumber = phase === "step2" ? 2 : 1;

  return (
    <OnboardingShell onSkip={onSkip} showSkip step={stepNumber} variant={shellVariant}>
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-6 sm:px-6">
        {phase === "step1" ? (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              What do you create content about?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your niche shapes every script the AI writes for you.
            </p>
            <input
              type="text"
              value={niche}
              onChange={(e) => {
                nicheChipUsedRef.current = false;
                setNiche(e.target.value);
                setSubmitError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && niche.trim().length >= 3) completeStep1();
              }}
              placeholder="e.g. Fitness, Personal Finance, AI Tools..."
              maxLength={200}
              autoFocus
              autoComplete="off"
              className="mt-5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition focus:border-primary"
            />
            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Popular niches
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ONBOARDING_NICHE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    nicheChipUsedRef.current = true;
                    setNiche(chip);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    niche === chip
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <Button
                type="button"
                disabled={niche.trim().length < 3}
                onClick={completeStep1}
              >
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Who are you talking to?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Be specific. &quot;Busy moms who want to lose weight&quot; beats &quot;women.&quot;
            </p>
            <input
              type="text"
              value={audience}
              onChange={(e) => {
                audienceChipUsedRef.current = false;
                setAudience(e.target.value);
                setSubmitError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && audience.trim().length >= 3) void runStartCreating();
              }}
              placeholder="e.g. Busy moms who want to lose 20 lbs..."
              maxLength={200}
              autoFocus
              autoComplete="off"
              className="mt-5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition focus:border-primary"
            />
            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Common audiences
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ONBOARDING_AUDIENCE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    audienceChipUsedRef.current = true;
                    setAudience(chip);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    audience === chip
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            {submitError ? <p className="mt-4 text-sm text-destructive">{submitError}</p> : null}
            <div className="mt-8 flex flex-wrap justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setPhase("step1")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={audience.trim().length < 3 || startCreatingMutation.isPending}
                onClick={() => void runStartCreating()}
              >
                Start creating
              </Button>
            </div>
          </>
        )}
      </main>
    </OnboardingShell>
  );
}
