import { useAuth } from "@/_core/hooks/useAuth";
import { FEATURE_LAUNCH_DATE_ISO } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { normalizeAnalyticsHandle } from "@/lib/utils";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";
import { Button } from "@/components/ui/button";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function OnboardingShell({
  children,
  onSkip,
}: {
  children: React.ReactNode;
  onSkip?: () => void;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="inline-flex min-w-0">
            <SpyReelsWordmark size="header" />
          </Link>
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Skip setup →
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}

export default function OnboardingPage() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const [description, setDescription] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const [completionText, setCompletionText] = useState<string>(
    "Finding the best creators for you..."
  );
  const [isCompleting, setIsCompleting] = useState(false);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [clarifyingAnswer, setClarifyingAnswer] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        ? `${description.trim()}. ${clarifyingAnswer.trim()}`
        : description.trim();

    if (fullDescription.length < 6) {
      setSubmitError("Add a few more words so we know your niche.");
      return;
    }

    if (clarifyingQuestion && !clarifyingAnswer.trim()) {
      setSubmitError("Answer the question above to continue.");
      return;
    }

    setSubmitError(null);
    setIsRouting(true);
    posthog?.capture("onboarding_submit_started", {
      has_clarifying_answer: Boolean(clarifyingAnswer.trim()),
      description_length: fullDescription.length,
    });
    try {
      const result = await routeNicheMutation.mutateAsync({
        businessDescription: fullDescription,
      });

      if (result.clarifyingQuestion && !clarifyingAnswer.trim()) {
        setClarifyingQuestion(result.clarifyingQuestion);
        setSubmitError("We need one detail about your niche or audience, then tap the button again.");
        posthog?.capture("onboarding_clarifying_question_shown");
        return;
      }

      posthog?.capture("onboarding_route_success", {
        niche_count: result.selectedSlugs.length,
      });

      posthog?.capture("onboarding_niches_selected", {
        niche_slugs: result.selectedSlugs,
        count: result.selectedSlugs.length,
        method: "text_input",
      });
      setIsCompleting(true);
      setCompletionText("Finding the best creators for you...");
      const completeResult = await completeMutation.mutateAsync({
        selectedNicheSlugs: result.selectedSlugs,
        businessDescription: fullDescription,
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
        posthog?.capture("onboarding_complete_success", {
          demo_seeded: Boolean(completeResult.demoJobId),
        });
      }
      await trpcUtils.onboarding.getState.invalidate();
      await trpcUtils.onboarding.getState.refetch();
      setLocation("/research");
    } catch (err) {
      console.error("Onboarding submit failed", err);
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSubmitError(message);
      toast.error("Could not finish setup", { description: message });
      posthog?.capture("onboarding_submit_failed", {
        message: message.slice(0, 200),
        stage: isCompleting ? "complete" : "route",
      });
      setIsCompleting(false);
    } finally {
      setIsRouting(false);
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

  if (isRouting || isCompleting || completeMutation.isPending || skipMutation.isPending) {
    const progressTitle = isRouting && !isCompleting
      ? "Understanding your niche..."
      : completionText;
    const progressHint = isRouting && !isCompleting
      ? "Usually 10 to 30 seconds. Please keep this tab open."
      : "This takes a few seconds";
    return (
      <OnboardingShell>
        <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-6 py-16 text-center">
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <h2 className="text-3xl tracking-tight text-foreground">{progressTitle}</h2>
            <p className="max-w-lg text-sm text-muted-foreground">{progressHint}</p>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell onSkip={onSkip}>
      <main className="mx-auto w-full max-w-6xl px-6 pb-12">
        <header className="mb-8 space-y-3 pt-8">
          <h1 className="text-4xl font-semibold tracking-tight">
            What do you <span className="italic text-primary">create</span>?
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Stop guessing. See exactly what&apos;s making creators go viral in your niche. Then make
            that.
          </p>
        </header>

        <div className="mb-6 max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
            Complete this sentence
          </p>
          <div className="flex flex-wrap items-baseline gap-3 text-xl font-medium">
            <span className="whitespace-nowrap text-foreground">I create content about</span>
            <input
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSubmitError(null);
                setClarifyingQuestion(null);
                setClarifyingAnswer("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && description.trim().length >= 6 && !isRouting) {
                  handleSubmit();
                }
              }}
              placeholder="first-time home buyers in Houston..."
              maxLength={200}
              autoFocus
              autoComplete="off"
              className="min-w-[220px] flex-1 border-b-2 border-primary bg-transparent px-1 py-0.5 text-xl font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/80 caret-primary"
            />
          </div>
        </div>

        <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
          Try an example
        </p>
        <div className="mb-8 flex max-w-2xl flex-wrap gap-2">
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
              disabled={isRouting || isCompleting}
              onClick={() => {
                setDescription(example);
                setSubmitError(null);
                setClarifyingQuestion(null);
                setClarifyingAnswer("");
              }}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>

        {clarifyingQuestion ? (
          <div className="mb-8 max-w-2xl rounded-xl border border-primary/30 bg-primary/5 p-5">
            <p className="mb-3 text-sm font-medium text-primary">{clarifyingQuestion}</p>
            <input
              type="text"
              value={clarifyingAnswer}
              onChange={(e) => setClarifyingAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && clarifyingAnswer.trim().length >= 3 && !isRouting) {
                  handleSubmit();
                }
              }}
              placeholder="Your niche or who you create for..."
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
          </div>
        ) : null}

        {submitError ? (
          <p className="mb-4 max-w-2xl text-sm text-destructive">{submitError}</p>
        ) : null}

        <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/90 px-1 py-4 backdrop-blur">
          <Button
            type="button"
            disabled={description.trim().length < 6 || isRouting || isCompleting}
            onClick={handleSubmit}
            className="gap-2"
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
          </Button>
        </div>
      </main>
    </OnboardingShell>
  );
}
