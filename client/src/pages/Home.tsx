import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  normalizeInstagramHandle,
  isValidInstagramHandleNormalized,
  INSTAGRAM_HANDLE_INVALID_MESSAGE,
} from "@shared/instagramHandle";
import {
  Film,
  Search,
  Clock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Lock,
  ImageIcon,
  BadgeCheck,
  ExternalLink,
} from "lucide-react";
import { useUsageGate } from "@/hooks/useUsageGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import Tooltip from "@/components/Tooltip";
import { isLikelyInstagramRateLimitMessage } from "@/utils/instagramErrors";

function formatCount(n: number): string {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

/** Featured grid: show DB URL or fall back to initials if load fails (expired IG CDN, etc.). */
function FeaturedProfileAvatar({
  profilePicUrl,
  handle,
}: {
  profilePicUrl: string;
  handle: string;
}) {
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
      alt=""
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function TipDot() {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
      i
    </span>
  );
}

export default function Home() {
  const posthog = usePostHog();
  const utils = trpc.useUtils();
  const [handle, setHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState("30");
  const [, setLocation] = useLocation();
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce handle input - only query after 800ms of no typing and min 2 chars
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const cleanHandle = handle.replace(/^@/, "").trim();
    if (cleanHandle.length < 2) {
      setDebouncedHandle("");
      return;
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedHandle(cleanHandle);
    }, 800);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [handle]);

  const RESEARCH_STALE_MS = 300_000;

  const profileQuery = trpc.scrape.profilePreview.useQuery(
    { handle: debouncedHandle },
    {
      enabled: debouncedHandle.length >= 2,
      retry: false,
      staleTime: RESEARCH_STALE_MS,
    }
  );

  const profile = profileQuery.data;
  const isLoadingProfile = profileQuery.isFetching;
  const profileFound = profile?.found === true;
  const profileError = profile?.found === false ? profile.error : null;

  const scrapeGate = useUsageGate("scrapeCount");
  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    staleTime: RESEARCH_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const normalizedTyped = useMemo(() => normalizeInstagramHandle(handle), [handle]);
  const clientStrictOk = useMemo(
    () => isValidInstagramHandleNormalized(normalizedTyped),
    [normalizedTyped]
  );
  const previewOk = Boolean(profileFound && profile?.found === true);
  const handleReadyForSubmit =
    handle.trim().length > 0 && (previewOk || clientStrictOk);

  useEffect(() => {
    if (previewOk) setHandleError(null);
  }, [previewOk]);

  const prioritizeFeatured =
    onboardingStateQuery.isSuccess &&
    onboardingStateQuery.data?.hasCompletedFirstSpy !== true;

  const dismissHintCardMutation = trpc.onboarding.dismissHintCard.useMutation();
  const nicheGroupsQuery = trpc.featured.nicheGroups.useQuery(undefined, {
    staleTime: RESEARCH_STALE_MS,
    refetchOnWindowFocus: false,
  });
  const [selectedNicheSlug, setSelectedNicheSlug] = useState<string>("all");
  const [hintDismissedLocally, setHintDismissedLocally] = useState(false);
  const initializedNicheDefaultRef = useRef(false);

  type NicheRow = { slug: string; name: string };
  const allNiches = useMemo<NicheRow[]>(
    () =>
      nicheGroupsQuery.data?.groups.flatMap((group) =>
        group.niches.map((niche) => ({ slug: niche.slug, name: niche.name }))
      ) ?? [],
    [nicheGroupsQuery.data]
  );
  const nicheNameBySlug = useMemo(
    () => new Map(allNiches.map((niche) => [niche.slug, niche.name])),
    [allNiches]
  );

  const accountsBySelectedNicheQuery = trpc.featured.accountsByNiche.useQuery(
    { nicheSlug: selectedNicheSlug },
    {
      enabled: selectedNicheSlug !== "all",
      staleTime: RESEARCH_STALE_MS,
      refetchOnWindowFocus: false,
    }
  );

  type FeaturedCreator = {
    id: number;
    handle: string;
    displayName: string;
    followerCount: number;
    avgEngagementRate: number;
    profilePicUrl: string;
    totalReelsEver: number;
    reelsAvailable: number;
    nicheName: string;
  };

  const allCacheRef = useRef<Record<string, FeaturedCreator[]>>({});
  const [allCreators, setAllCreators] = useState<FeaturedCreator[]>([]);
  const [allCreatorsLoading, setAllCreatorsLoading] = useState(false);
  const [allCreatorsError, setAllCreatorsError] = useState<string | null>(null);
  const [allRetryNonce, setAllRetryNonce] = useState(0);

  // Tech debt: "all niches" still uses a local ref cache + explicit fetch loop. Longer
  // trpc query staleTime helps, but a dedicated useQuery (or session cache) for the
  // merged list would make return visits to /research feel instant in all cases.
  useEffect(() => {
    if (selectedNicheSlug !== "all") return;
    if (allNiches.length === 0) return;
    let cancelled = false;

    const key = allNiches
      .map((niche) => niche.slug)
      .sort()
      .join("|");

    const load = async () => {
      const cached = allCacheRef.current[key];
      if (cached) {
        setAllCreators(cached);
        setAllCreatorsError(null);
        return;
      }

      setAllCreatorsLoading(true);
      setAllCreatorsError(null);
      try {
        const perNiche = await Promise.all(
          allNiches.map(async (niche) => {
            const creators = await utils.featured.accountsByNiche.fetch({
              nicheSlug: niche.slug,
            });
            return creators.map((creator) => ({
              ...creator,
              nicheName: niche.name,
            }));
          })
        );

        const deduped = new Map<number, FeaturedCreator>();
        for (const group of perNiche) {
          for (const creator of group) {
            const existing = deduped.get(creator.id);
            if (!existing || creator.followerCount > existing.followerCount) {
              deduped.set(creator.id, creator);
            }
          }
        }

        const merged = Array.from(deduped.values()).sort(
          (a, b) => b.followerCount - a.followerCount
        );
        allCacheRef.current[key] = merged;
        if (!cancelled) setAllCreators(merged);
      } catch (error) {
        if (!cancelled) {
          setAllCreatorsError(
            error instanceof Error ? error.message : "Failed to load creators"
          );
          setAllCreators([]);
        }
      } finally {
        if (!cancelled) setAllCreatorsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [allNiches, selectedNicheSlug, utils.featured.accountsByNiche, allRetryNonce]);

  useEffect(() => {
    if (initializedNicheDefaultRef.current) return;

    const selectedNicheSlugs = onboardingStateQuery.data?.selectedNicheSlugs ?? [];
    if (selectedNicheSlugs.length === 0) {
      initializedNicheDefaultRef.current = true;
      return;
    }
    if (allNiches.length === 0) return;

    const firstAvailable = selectedNicheSlugs.find((slug) =>
      allNiches.some((niche) => niche.slug === slug)
    );
    setSelectedNicheSlug(firstAvailable ?? "all");
    initializedNicheDefaultRef.current = true;
  }, [allNiches, onboardingStateQuery.data?.selectedNicheSlugs]);

  const onboardingState = onboardingStateQuery.data;
  const showHintCard = Boolean(
    onboardingState &&
      !hintDismissedLocally &&
      !onboardingState.hasDismissedHintCard &&
      !onboardingState.hasCompletedFirstSpy
  );

  // PostHog `welcome_modal_action`  -  event name reserved for a future Supademo / tour (no modal yet).

  const dismissHint = async () => {
    setHintDismissedLocally(true);
    try {
      await dismissHintCardMutation.mutateAsync();
      posthog?.capture("hint_card_dismissed");
      await onboardingStateQuery.refetch();
    } catch {
      // non-blocking UI hide
    }
  };

  const featuredCreators = useMemo<FeaturedCreator[]>(() => {
    if (selectedNicheSlug === "all") return allCreators;
    const nicheName = nicheNameBySlug.get(selectedNicheSlug) ?? "Featured";
    return (accountsBySelectedNicheQuery.data ?? []).map((creator) => ({
      ...creator,
      nicheName,
    }));
  }, [accountsBySelectedNicheQuery.data, allCreators, nicheNameBySlug, selectedNicheSlug]);

  const featuredLoading =
    selectedNicheSlug === "all"
      ? allCreatorsLoading || nicheGroupsQuery.isLoading
      : accountsBySelectedNicheQuery.isLoading;
  const featuredError =
    selectedNicheSlug === "all"
      ? allCreatorsError
      : accountsBySelectedNicheQuery.error?.message ?? null;

  const startScrape = trpc.scrape.start.useMutation({
    onSuccess: data => {
      // Search-to-featured shortcut (Commit 2.5): backend detected the
      // handle already exists as a featured creator, so jump straight to
      // the instant Path-B dashboard instead of scraping.
      if ("redirect" in data && data.redirect === "featured") {
        posthog?.capture("search_routed_to_featured", {
          handle: handle.replace(/^@/, "").trim().toLowerCase(),
          featured_account_id: data.featuredAccountId,
        });
        setLocation(
          `/dashboard?featuredAccountId=${data.featuredAccountId}&from=research`
        );
        return;
      }
      // Route to the dedicated scraping progress page; the toast would be
      // redundant on top of the full-page experience there.
      setLocation(`/scraping?jobId=${data.jobId}`);
    },
    onError: error => {
      const msg = error.message ?? "";
      if (isLikelyInstagramRateLimitMessage(msg)) {
        toast.error("Instagram is limiting requests right now", {
          description:
            "Try again in a few minutes — or open ready-made viral reels from featured creators.",
          duration: 12_000,
          action: {
            label: "Featured creators",
            onClick: () =>
              document
                .getElementById("featured-creators")
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
        });
        posthog?.capture("research_scrape_rate_limited", {
          surface: "research_start_toast",
        });
        return;
      }
      toast.error("Failed to start account research", {
        description: msg,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) {
      toast.error("Please enter an Instagram handle");
      return;
    }
    if (!previewOk && !isValidInstagramHandleNormalized(normalizeInstagramHandle(handle))) {
      setHandleError(INSTAGRAM_HANDLE_INVALID_MESSAGE);
      return;
    }
    const normalized =
      previewOk && profile?.found === true
        ? normalizeInstagramHandle(profile.username)
        : normalizeInstagramHandle(handle);
    setHandleError(null);
    if (profile?.found && profile.isPrivate) {
      toast.error("This account is private and cannot be analyzed.");
      return;
    }
    if (!scrapeGate.allowed) {
      toast.error(
        `Account research limit reached (${scrapeGate.used}/${scrapeGate.limit})`,
        {
          description: "Upgrade your plan for more account research.",
          action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
        }
      );
      return;
    }
    posthog?.capture("research_started", {
      handle: normalized,
      timeframe_days: parseInt(timeframe),
    });
    startScrape.mutate({
      handle: normalized,
      timeframeDays: parseInt(timeframe),
    });
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-3 pt-4 sm:px-0 sm:pt-8 md:pt-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Spy Viral Reels
          </h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Enter a public Instagram handle and select a timeframe to collect all
          Reels data including views, likes, comments, and more.
        </p>
      </div>

      {showHintCard ? (
        <div className="mb-6 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary">New to SpyReels?</p>
              <p className="text-xs text-muted-foreground">
                Get your first viral script in 3 minutes.
              </p>
            </div>
            <Tooltip content="Dismiss. We won't show this again.">
              <button
                type="button"
                onClick={dismissHint}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-card hover:text-foreground"
                aria-label="Dismiss hint card"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
              <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                1
              </span>
              <p>
                {prioritizeFeatured ? (
                  <>
                    <span className="font-medium text-foreground">Pick a creator.</span> Tap a
                    featured creator above, or type any public handle below.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">Pick a creator.</span> Type any
                    @handle or click a featured viral creator below.
                  </>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
              <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                2
              </span>
              <p>
                <span className="font-medium text-foreground">See viral reels instantly.</span>{" "}
                Sort by engagement, views, or date.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
              <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                3
              </span>
              <p>
                <span className="font-medium text-foreground">Transcribe, then generate.</span>{" "}
                Rewrite any hook in your voice with AI.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col">
      <div
        className={
          "max-w-2xl " + (prioritizeFeatured ? "order-3" : "order-1")
        }
      >
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-card-foreground">
              New Spy Session
            </CardTitle>
            <CardDescription>
              Provide the account details to start collecting Reels data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label
                  htmlFor="handle"
                  className="text-sm font-medium text-card-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    Instagram Handle
                    <Tooltip content="Enter the username without the @ symbol. The account must be public.">
                      <span>
                        <TipDot />
                      </span>
                    </Tooltip>
                  </span>
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="handle"
                    placeholder="e.g. natgeo"
                    value={handle}
                    onChange={e => {
                      setHandle(e.target.value);
                      setHandleError(null);
                    }}
                    onBlur={() => {
                      const n = normalizeInstagramHandle(handle);
                      if (
                        handle.trim() &&
                        !previewOk &&
                        !isValidInstagramHandleNormalized(n)
                      ) {
                        setHandleError(INSTAGRAM_HANDLE_INVALID_MESSAGE);
                      }
                    }}
                    className="pl-10 h-11 bg-background"
                    aria-invalid={Boolean(handleError)}
                    aria-describedby={handleError ? "handle-error" : undefined}
                  />
                  {isLoadingProfile && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!isLoadingProfile && profileFound && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                  {!isLoadingProfile && profileError && (
                    <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the username without the @ symbol. The account must be
                  public.
                </p>
                {handleError ? (
                  <p id="handle-error" className="text-sm text-destructive" role="alert">
                    {handleError}
                  </p>
                ) : null}
              </div>

              {/* Profile Preview Card */}
              {profileFound && profile.found && (
                <div className="rounded-lg border border-border bg-background p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-start gap-4">
                    {/* Profile Picture */}
                    <div className="shrink-0">
                      {profile.profilePicUrl ? (
                        <img
                          src={profile.profilePicUrl}
                          alt={profile.username}
                          className="w-16 h-16 rounded-full object-cover border-2 border-border"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Profile Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold text-foreground truncate">
                          {profile.username}
                        </h3>
                        {profile.isVerified && (
                          <BadgeCheck className="h-4 w-4 text-blue-500 shrink-0" />
                        )}
                        {profile.isPrivate && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 border-orange-500/50 text-orange-400"
                          >
                            <Lock className="mr-0.5 h-2.5 w-2.5" />
                            Private
                          </Badge>
                        )}
                      </div>

                      {profile.fullName && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {profile.fullName}
                        </p>
                      )}

                      {profile.category && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 mb-1.5"
                        >
                          {profile.category}
                        </Badge>
                      )}

                      {profile.biography && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                          {profile.biography}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-center">
                          <p className="font-bold text-foreground">
                            {formatCount(profile.postCount)}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            posts
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-foreground">
                            {formatCount(profile.followerCount)}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            followers
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-foreground">
                            {formatCount(profile.followingCount)}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            following
                          </p>
                        </div>
                        {profile.externalUrl && (
                          <a
                            href={profile.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline ml-auto"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="text-[10px] truncate max-w-[120px]">
                              {profile.externalUrl.replace(/^https?:\/\//, "")}
                            </span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {profile.isPrivate && (
                    <>
                      <Separator className="my-3" />
                      <p className="text-xs text-orange-400 flex items-center gap-1.5">
                        <Lock className="h-3 w-3" />
                        This account is private. Only public accounts can be
                        analyzed.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Profile Error */}
              {profileError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 animate-in fade-in duration-200">
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <XCircle className="h-3 w-3 shrink-0" />
                    {profileError}
                  </p>
                  {isLikelyInstagramRateLimitMessage(profileError) ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-destructive/15 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Skip the wait: open a hand-picked creator with reels already loaded.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() =>
                          document
                            .getElementById("featured-creators")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        Browse featured creators
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="timeframe"
                  className="text-sm font-medium text-card-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    Timeframe
                    <Tooltip content="We'll collect every Reel this creator posted within this date window.">
                      <span>
                        <TipDot />
                      </span>
                    </Tooltip>
                  </span>
                </Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="h-11 bg-background">
                    <Clock className="h-4 w-4 text-muted-foreground mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="180">Last 180 days</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reels posted within this window will be collected.
                </p>
              </div>

              {!scrapeGate.isLoading && !scrapeGate.allowed && (
                <UpgradePrompt
                  action="scrapeCount"
                  used={scrapeGate.used}
                  limit={scrapeGate.limit}
                  planRequired={scrapeGate.planRequired}
                  variant="inline"
                />
              )}

              {!scrapeGate.isLoading &&
                scrapeGate.allowed &&
                scrapeGate.limit > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    <span className="inline-flex items-center gap-1.5">
                      {scrapeGate.used}/{scrapeGate.limit} account research sessions this month
                      <Tooltip content="Your plan includes 50 spy credits per month. Resets on the 1st of every month.">
                        <span>
                          <TipDot />
                        </span>
                      </Tooltip>
                    </span>
                  </p>
                )}

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 text-base font-medium"
                disabled={
                  startScrape.isPending ||
                  !handleReadyForSubmit ||
                  (profile?.found === true && profile.isPrivate) ||
                  !scrapeGate.allowed
                }
              >
                {startScrape.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start Spying
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Separator className={"my-10 order-2"} />

      <section
        id="featured-creators"
        className={"scroll-mt-24 " + (prioritizeFeatured ? "order-1" : "order-3")}
      >
        <div className="mb-5">
          <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-primary">
            Instant research · No waiting
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {prioritizeFeatured
              ? "Start here: top viral creators"
              : "Or spy on top viral creators"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Hand-picked creators with massive audiences. Their top viral reels
            are already analyzed and ready.
          </p>
        </div>

        <div className="sticky top-0 z-10 mb-5 -mx-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur">
          <div className="flex w-max gap-2">
            <button
              type="button"
              onClick={() => setSelectedNicheSlug("all")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                selectedNicheSlug === "all"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tooltip content="Show every featured creator across all niches">
                <span>All niches</span>
              </Tooltip>
            </button>
            {allNiches.map((niche) => (
              <button
                key={niche.slug}
                type="button"
                onClick={() => setSelectedNicheSlug(niche.slug)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selectedNicheSlug === niche.slug
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {niche.slug === "business-entrepreneurship" ? (
                  <Tooltip content="Entrepreneurs, founders, CEOs">
                    <span>{niche.name}</span>
                  </Tooltip>
                ) : niche.slug === "marketing-sales" ? (
                  <Tooltip content="Growth, sales, branding experts">
                    <span>{niche.name}</span>
                  </Tooltip>
                ) : niche.slug === "content-marketing" ? (
                  <Tooltip content="Creators who teach content creation">
                    <span>{niche.name}</span>
                  </Tooltip>
                ) : niche.slug === "investing-crypto" ? (
                  <Tooltip content="Stocks, crypto, wealth building">
                    <span>{niche.name}</span>
                  </Tooltip>
                ) : (
                  niche.name
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {selectedNicheSlug === "all"
              ? "Top creators"
              : `Top creators · ${(
                  nicheNameBySlug.get(selectedNicheSlug) ?? selectedNicheSlug
                ).toUpperCase()}`}
          </span>
          <span className="text-xs text-muted-foreground">
            Sort: Followers (high to low)
          </span>
        </div>

        {featuredLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 h-5 w-36 animate-pulse rounded bg-muted" />
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3 border-y border-border py-3">
                  <div className="space-y-2">
                    <div className="h-2 w-14 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 w-14 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  </div>
                </div>
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : featuredError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
            <p className="text-destructive">
              Failed to load featured creators: {featuredError}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => {
                if (selectedNicheSlug === "all") {
                  setAllRetryNonce((v) => v + 1);
                } else {
                  accountsBySelectedNicheQuery.refetch();
                }
              }}
            >
              Retry
            </Button>
          </div>
        ) : featuredCreators.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center">
            <p className="text-lg font-semibold text-foreground">
              More creators coming to this niche soon
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {prioritizeFeatured
                ? "Use the spy session below to research any public handle directly."
                : "Use the spy session card above to research any handle directly."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredCreators.map((creator) => (
              <button
                key={creator.id}
                type="button"
                onClick={() => setLocation(`/dashboard?featuredAccountId=${creator.id}`)}
                className="rounded-xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/90"
              >
                <div className="mb-3 inline-flex rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
                  {creator.nicheName}
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-10 w-10 overflow-hidden rounded-full border border-border bg-muted">
                    <FeaturedProfileAvatar profilePicUrl={creator.profilePicUrl} handle={creator.handle} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {creator.displayName}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      @{creator.handle}
                    </p>
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3 border-y border-border py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Followers
                        <Tooltip content="Total Instagram followers as of last sync">
                          <span>
                            <TipDot />
                          </span>
                        </Tooltip>
                      </span>
                    </p>
                    <p className="font-mono text-sm text-foreground">
                      {formatCount(creator.followerCount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Avg ER
                        <Tooltip content="Engagement rate = (likes + comments) / followers. Higher = more engaged audience.">
                          <span>
                            <TipDot />
                          </span>
                        </Tooltip>
                      </span>
                    </p>
                    <p className="font-mono text-sm text-emerald-500">
                      {creator.avgEngagementRate.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    <Tooltip content="Top 30 viral reels already analyzed and ready to view">
                      <span>{creator.reelsAvailable} viral reels ready</span>
                    </Tooltip>
                  </span>
                  <span className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition group-hover:text-primary">
                    See Reels →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 border-t border-border pt-8 sm:grid-cols-3">
        {[
          {
            label: "Spy",
            desc: "Collect all Reels metadata from any public account",
          },
          {
            label: "Analyze",
            desc: "Sort by views, likes, comments, or date instantly",
          },
          {
            label: "Transcribe",
            desc: "Get full transcripts with hook analysis for any Reel",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border/50 bg-card/50 p-4"
          >
            <p className="mb-1 text-sm font-medium text-card-foreground">
              {item.label}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {item.desc}
            </p>
          </div>
        ))}
      </div>

    </div>
  );
}
