import { useAuth } from "@/_core/hooks/useAuth";
import { FEATURE_LAUNCH_DATE_ISO } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { normalizeAnalyticsHandle } from "@/lib/utils";
import { usePostHog } from "@posthog/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function OnboardingPage() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const [description, setDescription] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [clarifyingAnswer, setClarifyingAnswer] = useState("");
  const [completionText, setCompletionText] = useState<string>(
    "Finding the best creators for you..."
  );
  const [isCompleting, setIsCompleting] = useState(false);

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

  const completeMutation = trpc.onboarding.complete.useMutation();
  const skipMutation = trpc.onboarding.skip.useMutation();
  const routeNicheMutation = trpc.onboarding.routeNiche.useMutation();

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
    if (shouldBypassOnboarding) {
      setLocation("/dashboard");
    }
  }, [setLocation, shouldBypassOnboarding]);

  const onSkip = async () => {
    setIsCompleting(true);
    setCompletionText("Picking a great default creator for you...");
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
      await trpcUtils.onboarding.getState.refetch();
      setLocation("/research");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSubmit = async () => {
    const fullDescription =
      clarifyingQuestion && clarifyingAnswer.trim()
        ? `${description}. ${clarifyingAnswer}`
        : description;

    setIsRouting(true);
    try {
      const result = await routeNicheMutation.mutateAsync({
        businessDescription: fullDescription,
      });

      if (
        result.confidence < 0.6 &&
        result.clarifyingQuestion &&
        !clarifyingAnswer.trim()
      ) {
        setClarifyingQuestion(result.clarifyingQuestion);
        setIsRouting(false);
        return;
      }

      posthog?.capture("onboarding_niches_selected", {
        niche_slugs: result.selectedSlugs,
        count: result.selectedSlugs.length,
        method: "text_input",
      });
      setIsCompleting(true);
      setCompletionText("Finding the best creators for you...");
      const completeResult = await completeMutation.mutateAsync({
        selectedNicheSlugs: result.selectedSlugs,
      });
      if (!completeResult.alreadyComplete) {
        posthog?.capture("onboarding_completed", {
          niches_selected: result.selectedSlugs.length,
          creators_selected: 0,
          demo_creator_handle: normalizeAnalyticsHandle(
            completeResult.demoCreatorHandle ?? ""
          ),
          demo_seeded: Boolean(completeResult.demoJobId),
        });
      }
      await trpcUtils.onboarding.getState.invalidate();
      await trpcUtils.onboarding.getState.refetch();
      setLocation("/research");
    } catch (err) {
      console.error("Niche routing failed", err);
      setIsRouting(false);
      setIsCompleting(false);
    }
  };

  if (loading || onboardingStateQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;
  if (shouldBypassOnboarding) return null;

  if (isCompleting || completeMutation.isPending || skipMutation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <h2 className="text-3xl tracking-tight text-foreground">
            Finding the best creators for you...
          </h2>
          <p className="max-w-lg text-sm text-muted-foreground">This takes a few seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <SpyReelsWordmark size="lg" />
        <button
          onClick={onSkip}
          className="rounded-md px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          Skip setup →
        </button>
      </div>

      <main className="mx-auto w-full max-w-5xl px-6 pb-12">
        <h1 className="text-4xl tracking-tight mb-3">
          What do you <span className="italic text-primary">create</span>?
        </h1>
        <p className="text-muted-foreground text-sm mb-12 max-w-lg">
          Stop guessing. See exactly what&apos;s making creators go viral in your niche. Then make
          that.
        </p>

        <div className="max-w-2xl mb-6">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">
            Complete this sentence
          </p>
          <div className="flex items-baseline gap-3 text-xl font-medium flex-wrap">
            <span className="text-foreground whitespace-nowrap">I create content about</span>
            <input
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setClarifyingQuestion(null);
                setClarifyingAnswer("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && description.trim().length >= 8 && !isRouting) {
                  handleSubmit();
                }
              }}
              placeholder="fitness for busy moms..."
              maxLength={200}
              autoFocus
              autoComplete="off"
              className="flex-1 min-w-[220px] bg-transparent border-b-2 border-primary text-foreground text-xl font-medium outline-none px-1 py-0.5 placeholder:text-muted-foreground/40 focus:border-primary/80 transition-colors caret-primary"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Try an example
        </p>
        <div className="flex flex-wrap gap-2 max-w-2xl mb-12">
          {[
            "fitness for busy moms",
            "my restaurant in Houston",
            "real estate tips for first-time buyers",
            "skincare for people with acne",
            "business coaching for freelancers",
            "travel on a budget",
          ].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setDescription(example);
                setClarifyingQuestion(null);
                setClarifyingAnswer("");
              }}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground hover:bg-primary/5"
            >
              {example}
            </button>
          ))}
        </div>

        {clarifyingQuestion ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-5 mb-8">
            <p className="text-sm text-primary font-medium mb-3">{clarifyingQuestion}</p>
            <input
              type="text"
              value={clarifyingAnswer}
              onChange={(e) => setClarifyingAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && clarifyingAnswer.trim().length >= 3 && !isRouting) {
                  handleSubmit();
                }
              }}
              placeholder="e.g. small business owners, stay-at-home moms, beginners..."
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
        ) : null}
      </main>

      <div className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur px-6 py-4 flex items-center justify-end">
        <button
          type="button"
          disabled={description.trim().length < 8 || isRouting || isCompleting}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isRouting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding creators...
            </>
          ) : (
            <>
              Show me what&apos;s working
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
