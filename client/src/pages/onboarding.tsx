import { useAuth } from "@/_core/hooks/useAuth";
import { FEATURE_LAUNCH_DATE_ISO, ONBOARDING_NICHES, ONBOARDING_NICHES_BY_SLUG } from "@/data/onboardingNiches";
import { trpc } from "@/lib/trpc";
import { normalizeAnalyticsHandle } from "@/lib/utils";
import { usePostHog } from "@posthog/react";
import { Loader2, Search, ArrowRight, ArrowLeft, PencilLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

type Creator = {
  id: number;
  handle: string;
  displayName: string;
  followerCount: number;
  avgEngagementRate: number;
  profilePicUrl: string;
  totalReelsEver: number;
  reelsAvailable: number;
};

const FEATURE_LAUNCH_DATE = new Date(FEATURE_LAUNCH_DATE_ISO);
const MAX_NICHES = 5;
const MAX_CREATORS = 5;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function OnboardingProfilePic({ profilePicUrl, handle }: { profilePicUrl: string; handle: string }) {
  const [failed, setFailed] = useState(false);
  const initials = handle.slice(0, 2).toUpperCase();
  if (!profilePicUrl?.trim() || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
        {initials}
      </div>
    );
  }
  return (
    <img
      src={profilePicUrl}
      alt={`@${handle}`}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function OnboardingPage() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [selectedCreatorHandles, setSelectedCreatorHandles] = useState<string[]>([]);
  /** True if the current step-2 selection came from "Pick for me" (not edited since). */
  const [isPickForMeSelection, setIsPickForMeSelection] = useState(false);
  const [completionText, setCompletionText] = useState<string>("Setting up your dashboard...");
  const [isCompleting, setIsCompleting] = useState(false);

  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
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

  const creatorsByNicheQuery = trpc.featured.accountsByNicheSlugs.useQuery(
    { slugs: selectedNiches },
    {
      enabled:
        Boolean(user) &&
        !loading &&
        !onboardingStateQuery.isLoading &&
        !shouldBypassOnboarding &&
        step === 2 &&
        selectedNiches.length > 0,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (shouldBypassOnboarding) {
      setLocation("/dashboard");
    }
  }, [setLocation, shouldBypassOnboarding]);

  const goToCreatorStep = useCallback(() => {
    if (selectedNiches.length === 0) return;
    posthog?.capture("onboarding_niches_selected", {
      niche_slugs: [...selectedNiches],
      count: selectedNiches.length,
    });
    setStep(2);
  }, [posthog, selectedNiches]);

  const groupedCreators = creatorsByNicheQuery.data?.groups ?? {};
  const hasAnyCreators = selectedNiches.some((slug) => (groupedCreators[slug] ?? []).length > 0);

  const onComplete = async () => {
    if (selectedNiches.length === 0 || selectedCreatorHandles.length === 0) return;
    setIsCompleting(true);
    setCompletionText("Setting up your dashboard...");
    try {
      const result = await completeMutation.mutateAsync({
        selectedNicheSlugs: selectedNiches,
        featuredAccountHandles: selectedCreatorHandles,
      });
      if (!result.alreadyComplete) {
        posthog?.capture("onboarding_creator_selected", {
          creator_handles: selectedCreatorHandles.map((h) => normalizeAnalyticsHandle(h)),
          count: selectedCreatorHandles.length,
          is_pick_for_me: isPickForMeSelection,
        });
        posthog?.capture("onboarding_completed", {
          niches_selected: selectedNiches.length,
          creators_selected: selectedCreatorHandles.length,
          demo_creator_handle: normalizeAnalyticsHandle(result.demoCreatorHandle ?? ""),
          demo_seeded: Boolean(result.demoJobId),
        });
      }
      if ("warning" in result && result.warning === "selected_creator_not_found") {
        setCompletionText("Your pick wasn’t available, so we selected a great fallback creator.");
      }
      // OnboardingGate reads the same getState query; must refresh after the
      // write before leaving /onboarding or the gate bounces the user back.
      await trpcUtils.onboarding.getState.invalidate();
      await trpcUtils.onboarding.getState.refetch();
      setLocation("/research");
    } finally {
      setIsCompleting(false);
    }
  };

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
  const canContinueStep2 =
    selectedCreatorHandles.length >= 1 && selectedCreatorHandles.length <= MAX_CREATORS;

  const toggleNiche = (slug: string) => {
    setSelectedCreatorHandles([]);
    setIsPickForMeSelection(false);
    setSelectedNiches((prev) => {
      if (prev.includes(slug)) return prev.filter((item) => item !== slug);
      if (prev.length >= MAX_NICHES) return prev;
      return [...prev, slug];
    });
  };

  const toggleCreator = (handle: string) => {
    setIsPickForMeSelection(false);
    setSelectedCreatorHandles((prev) => {
      if (prev.includes(handle)) return prev.filter((h) => h !== handle);
      if (prev.length >= MAX_CREATORS) return prev;
      return [...prev, handle];
    });
  };

  const pickForMeFromSelectedNiches = () => {
    const allCreators = selectedNiches.flatMap((slug) => groupedCreators[slug] ?? []);
    if (allCreators.length === 0) {
      setSelectedCreatorHandles([]);
      setIsPickForMeSelection(false);
      return;
    }
    const shuffled = shuffleInPlace([...allCreators]);
    const n = Math.min(3, shuffled.length);
    const picked = shuffled.slice(0, n);
    setSelectedCreatorHandles(picked.map((c) => c.handle));
    setIsPickForMeSelection(true);
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
        <div className="text-2xl tracking-tight">
          Spy<span className="text-primary italic">Reels</span>
        </div>
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
            <span className="text-primary">Step {step}</span> of 2
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded bg-border">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: step === 1 ? "50%" : "100%" }}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-6 pb-12">
        {step === 1 ? (
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
        ) : (
          <section>
            <header className="mb-6 space-y-3">
              <h1 className="text-4xl tracking-tight">
                Pick creators to <span className="italic text-primary">start with</span>
              </h1>
              <p className="max-w-2xl text-muted-foreground">
                We&apos;ll pre-load the first account&apos;s top viral reels on your dashboard so
                you can see how SpyReels works <span className="text-foreground">instantly</span>.
                You can add more creators later.
              </p>
            </header>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              {selectedNiches.map((slug) => {
                const niche = ONBOARDING_NICHES_BY_SLUG.get(slug);
                if (!niche) return null;
                return (
                  <span
                    key={slug}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary"
                  >
                    <span>{niche.emoji}</span>
                    <span>{niche.name}</span>
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setSelectedCreatorHandles([]);
                  setIsPickForMeSelection(false);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <PencilLine className="h-3 w-3" />
                Edit
              </button>
            </div>

            <div
              className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                selectedCreatorHandles.length > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <span className="text-sm">
                {selectedCreatorHandles.length === 0
                  ? "No creators selected"
                  : `${selectedCreatorHandles.length} of ${MAX_CREATORS} creators selected`}
              </span>
            </div>

            {creatorsByNicheQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading creators...
              </div>
            ) : (
              <div className="space-y-6">
                {selectedNiches.map((slug) => {
                  const niche = ONBOARDING_NICHES_BY_SLUG.get(slug);
                  const creators = (groupedCreators[slug] ?? []) as Creator[];
                  return (
                    <section key={slug} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span>{niche?.emoji ?? "•"}</span>
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {niche?.name ?? slug}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>

                      {creators.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                          No featured creators available in this niche yet.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {creators.map((creator) => {
                            const selected = selectedCreatorHandles.includes(creator.handle);
                            const atCap = !selected && selectedCreatorHandles.length >= MAX_CREATORS;
                            return (
                              <button
                                key={`${slug}-${creator.id}`}
                                type="button"
                                onClick={() => (atCap ? null : toggleCreator(creator.handle))}
                                disabled={atCap}
                                className={`relative rounded-xl border p-4 text-left transition ${
                                  atCap
                                    ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground opacity-50"
                                    : selected
                                      ? "border-primary bg-primary/8"
                                      : "border-border bg-card hover:border-primary/35 hover:bg-card/80"
                                }`}
                              >
                                {selected ? (
                                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                                    ✓
                                  </span>
                                ) : null}

                                <div className="mb-3 flex items-center gap-3">
                                  <div className="h-10 w-10 overflow-hidden rounded-full border border-border bg-muted">
                                    <OnboardingProfilePic
                                      profilePicUrl={creator.profilePicUrl}
                                      handle={creator.handle}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold">
                                      {creator.displayName || `@${creator.handle}`}
                                    </div>
                                    <div className="font-mono text-[11px] text-muted-foreground">@{creator.handle}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Followers</p>
                                    <p className="font-mono text-xs">{formatCount(creator.followerCount)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg ER</p>
                                    <p className="font-mono text-xs text-emerald-400">
                                      {creator.avgEngagementRate.toFixed(2)}%
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reels</p>
                                    <p className="font-mono text-xs">{creator.reelsAvailable}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={pickForMeFromSelectedNiches}
              className="mt-5 flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-transparent p-4 text-left transition hover:border-primary/30 hover:bg-card"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-sm text-muted-foreground">
                <span className="mb-0.5 block font-medium text-foreground">Pick for me</span>
                {!hasAnyCreators
                  ? "No creators in these niches? We'll choose a strong global default."
                  : "We’ll pick three featured creators at random from your selected niches."}
              </span>
            </button>
          </section>
        )}

        <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/90 px-1 py-4 backdrop-blur">
          {step === 1 ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setSelectedCreatorHandles([]);
                setIsPickForMeSelection(false);
              }}
              className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to niches
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              disabled={!canContinueStep1}
              onClick={goToCreatorStep}
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
          ) : (
            <button
              type="button"
              disabled={!canContinueStep2}
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Spy on them
              {canContinueStep2 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 py-0.5 font-mono text-[10px]">
                  ({selectedCreatorHandles.length})
                </span>
              ) : null}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
