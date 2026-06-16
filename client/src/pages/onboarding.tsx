import { useAuth } from "@/_core/hooks/useAuth";
import { FEATURE_LAUNCH_DATE_ISO, ONBOARDING_NICHES } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { normalizeAnalyticsHandle } from "@/lib/utils";
import { usePostHog } from "@posthog/react";
import { Loader2, Search, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);
const MAX_NICHES = 5;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function OnboardingPage() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [completionText, setCompletionText] = useState<string>("Setting up your dashboard...");
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

  if (loading || onboardingStateQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;
  if (shouldBypassOnboarding) return null;

  const canContinueStep1 = selectedNiches.length > 0;

  const toggleNiche = (slug: string) => {
    setSelectedNiches((prev) => {
      if (prev.includes(slug)) return prev.filter((item) => item !== slug);
      if (prev.length >= MAX_NICHES) return prev;
      return [...prev, slug];
    });
  };

  const filteredNiches = ONBOARDING_NICHES.filter((niche) =>
    niche.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (isCompleting || completeMutation.isPending || skipMutation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <h2 className="text-3xl tracking-tight text-foreground">Setting up your dashboard...</h2>
          <p className="max-w-lg text-sm text-muted-foreground">{completionText}</p>
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

      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mb-8 flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span className="text-primary">Step 1</span> of 1
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded bg-border">
            <div className="h-full w-full bg-primary transition-all duration-300" />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-6 pb-12">
        <section>
          <header className="mb-6 space-y-3">
            <h1 className="text-4xl tracking-tight">
              What are you <span className="italic text-primary">into</span>?
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Pick all niches you&apos;re interested in: what you create, admire, or want to
              learn from.{" "}
              <span className="text-foreground">The more we know, the smarter our recommendations get.</span>
            </p>
          </header>

          <div
            className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
              selectedNiches.length > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-mono text-xs ${
                  selectedNiches.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {selectedNiches.length}
              </span>
              <span className="text-sm">
                {`${selectedNiches.length} of ${MAX_NICHES} niches selected`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-primary">Tip:</span> Pick up to 5 niches. The more we know, the
              smarter our recommendations
            </p>
          </div>

          <div className="relative mb-5 max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search niches..."
              className="w-full rounded-xl border border-border bg-card py-3 pl-9 pr-4 text-sm text-foreground outline-none transition focus:border-primary"
            />
          </div>

          {filteredNiches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No niches match &quot;{search}&quot;. Try a different search.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {filteredNiches.map((niche) => {
                const selected = selectedNiches.includes(niche.slug);
                const atCap = !selected && selectedNiches.length >= MAX_NICHES;
                return (
                  <button
                    key={niche.slug}
                    type="button"
                    onClick={() => (atCap ? null : toggleNiche(niche.slug))}
                    disabled={atCap}
                    className={`relative min-h-28 rounded-xl border p-4 text-center transition ${
                      atCap
                        ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground opacity-50"
                        : selected
                          ? "border-primary bg-primary/8"
                          : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
                    }`}
                  >
                    {selected ? (
                      <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                        ✓
                      </span>
                    ) : null}
                    <div className="mb-2 text-2xl">{niche.emoji}</div>
                    <div className={`text-xs leading-snug ${selected ? "text-primary" : "text-foreground"}`}>
                      {niche.name}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/90 px-1 py-4 backdrop-blur">
          <button
            type="button"
            disabled={!canContinueStep1}
            onClick={async () => {
              if (selectedNiches.length === 0) return;
              posthog?.capture("onboarding_niches_selected", {
                niche_slugs: [...selectedNiches],
                count: selectedNiches.length,
              });
              setIsCompleting(true);
              setCompletionText("Setting up your dashboard...");
              try {
                const result = await completeMutation.mutateAsync({
                  selectedNicheSlugs: selectedNiches,
                });
                if (!result.alreadyComplete) {
                  posthog?.capture("onboarding_completed", {
                    niches_selected: selectedNiches.length,
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
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            {selectedNiches.length > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 py-0.5 font-mono text-[10px]">
                {selectedNiches.length}
              </span>
            ) : null}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
