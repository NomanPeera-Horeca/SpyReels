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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { TRPCClientError } from "@trpc/client";
import { navigateAfterScrapeStart } from "@/lib/scrapeNavigation";
import { useActiveScrapeJob } from "@/lib/activeScrapeJob";
import { ActiveScrapeJobNotice } from "@/components/ActiveScrapeJobNotice";
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
  AtSign,
  Music2,
} from "lucide-react";
import { useUsageGate } from "@/hooks/useUsageGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import Tooltip from "@/components/Tooltip";
import { isLikelyInstagramRateLimitMessage } from "@/utils/instagramErrors";
import {
  creatorDisplayLabel,
  seeCreatorsViralReelsCta,
} from "@/lib/creatorCtaCopy";
import TikTokResearch from "@/pages/TikTokResearch";

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

const PROFILE_PREVIEW_INVALID_HANDLE_MESSAGE =
  "Instagram handles can only contain letters, numbers, underscores, and periods.";

export default function Home() {
  const posthog = usePostHog();
  const utils = trpc.useUtils();
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
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

  const debouncedNormalized = useMemo(
    () =>
      debouncedHandle.length > 0 ? normalizeInstagramHandle(debouncedHandle) : "",
    [debouncedHandle]
  );
  const debouncedHandleShapeOk = useMemo(
    () =>
      debouncedHandle.length >= 2 &&
      isValidInstagramHandleNormalized(debouncedNormalized),
    [debouncedHandle, debouncedNormalized]
  );

  const profileQuery = trpc.scrape.profilePreview.useQuery(
    { handle: debouncedHandle },
    {
      enabled: debouncedHandleShapeOk,
      retry: false,
      staleTime: RESEARCH_STALE_MS,
    }
  );

  const profile = profileQuery.data;
  const isLoadingProfile = profileQuery.isFetching;
  const profileFound = profile?.found === true;
  const profilePreviewInvalidShape =
    debouncedHandle.length >= 2 && !debouncedHandleShapeOk;
  const profileError = profilePreviewInvalidShape
    ? PROFILE_PREVIEW_INVALID_HANDLE_MESSAGE
    : profile?.found === false
      ? profile.error
      : null;

  const scrapeGate = useUsageGate("scrapeCount");
  const { activeJob: activeRunningJob } = useActiveScrapeJob();
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
  const onboardingNicheSlugs = onboardingStateQuery.data?.selectedNicheSlugs ?? [];
  const singleNicheMode = onboardingNicheSlugs.length === 1;

  const visibleNicheTabs = useMemo(() => {
    if (singleNicheMode) return [];
    const fromOnboarding = onboardingNicheSlugs
      .map((slug) => allNiches.find((niche) => niche.slug === slug))
      .filter((niche): niche is NicheRow => niche != null);
    if (fromOnboarding.length > 0) return fromOnboarding.slice(0, 5);
    return allNiches.slice(0, 5);
  }, [allNiches, onboardingNicheSlugs, singleNicheMode]);

  const showNicheTabBar = !singleNicheMode && allNiches.length > 1;

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

  const scrollToFeaturedCreators = () => {
    if (showHintCard) void dismissHint();
    document
      .getElementById("featured-creators")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const primaryNicheLabel = useMemo(() => {
    if (singleNicheMode) {
      return nicheNameBySlug.get(onboardingNicheSlugs[0]!) ?? null;
    }
    if (selectedNicheSlug !== "all") {
      return nicheNameBySlug.get(selectedNicheSlug) ?? null;
    }
    return null;
  }, [
    singleNicheMode,
    onboardingNicheSlugs,
    nicheNameBySlug,
    selectedNicheSlug,
  ]);

  const featuredBrowsePreview = useMemo(() => {
    if (featuredCreators.length === 0) return null;
    const names = featuredCreators
      .slice(0, 2)
      .map((c) => creatorDisplayLabel(c.displayName, c.handle));
    const rest =
      featuredCreators.length > 2 ? `, +${featuredCreators.length - 2}` : "";
    const nichePart = primaryNicheLabel ? ` in ${primaryNicheLabel}` : "";
    return `${names.join(", ")}${rest}${nichePart}`;
  }, [featuredCreators, primaryNicheLabel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#featured-creators") return;
    const t = window.setTimeout(() => {
      document
        .getElementById("featured-creators")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, featuredLoading ? 600 : 200);
    return () => window.clearTimeout(t);
  }, [featuredLoading]);

  const startScrape = trpc.scrape.start.useMutation({
    onSuccess: (data, variables) => {
      const normalizedHandle = normalizeInstagramHandle(variables.handle);
      posthog?.capture("research_started", {
        handle: normalizedHandle,
        timeframe_days: variables.timeframeDays,
        resumed: "resumed" in data && data.resumed,
      });
      if ("resumed" in data && data.resumed) {
        toast.message(`Already researching @${normalizedHandle}`, {
          description: "Opening your progress page.",
        });
      }
      // Search-to-featured shortcut (Commit 2.5): backend detected the
      // handle already exists as a featured creator, so jump straight to
      // the instant Path-B dashboard instead of scraping.
      if ("seededFromFeatured" in data && data.seededFromFeatured) {
        posthog?.capture("featured_spy_started", {
          handle: normalizedHandle,
          job_id: data.jobId,
        });
      }
      utils.scrape.list.invalidate();
      navigateAfterScrapeStart(data, setLocation, "research");
    },
    onError: error => {
      const msg = error.message ?? "";
      if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
        toast.error(msg, {
          action: {
            label: "Creator Radar",
            onClick: () => setLocation("/history"),
          },
        });
        return;
      }
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

  const requestStartSpy = () => {
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
    toast.message(`Researching @${normalized}...`, {
      description: "This usually takes 30-45 seconds.",
      duration: 6000,
    });
    startScrape.mutate({
      handle: normalized,
      timeframeDays: parseInt(timeframe),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestStartSpy();
  };

  const startSpyingDisabled =
    startScrape.isPending ||
    !handleReadyForSubmit ||
    (profile?.found === true && profile.isPrivate) ||
    !scrapeGate.allowed ||
    scrapeGate.isLoading;

  const profileCardCanStartSpy =
    profileFound &&
    profile?.found === true &&
    !isLoadingProfile &&
    !startSpyingDisabled;

  const handleProfileCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!profileCardCanStartSpy) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      requestStartSpy();
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-2 pt-4 sm:px-0 sm:pt-8 md:pt-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Spy Viral Reels
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            What do you want to research?
          </h1>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Pick one. You can always do the other later.
        </p>

        <div className="mt-5 flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
          <span>
            <strong className="font-medium text-foreground">1. Spy</strong> any
            handle
          </span>
          <span className="hidden sm:inline text-border" aria-hidden>
            ·
          </span>
          <span>
            <strong className="font-medium text-foreground">2. Sort</strong> top
            {platform === "instagram" ? " Reels" : " videos"}
          </span>
          <span className="hidden sm:inline text-border" aria-hidden>
            ·
          </span>
          <span>
            <strong className="font-medium text-foreground">3. Remake</strong> into
            your script
          </span>
        </div>

        {platform === "instagram" && activeRunningJob ? (
          <div className="mt-6">
            <ActiveScrapeJobNotice job={activeRunningJob} variant="banner" />
          </div>
        ) : null}

        {platform === "instagram" ? (
        <button
          type="button"
          onClick={scrollToFeaturedCreators}
          className="mt-8 block w-full rounded-2xl border border-primary/45 bg-card p-4 text-left shadow-[0_0_0_1px_oklch(0.65_0.2_280/0.12)] transition hover:border-primary/55 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Recommended
              </span>
              <p className="mt-3 text-lg font-semibold text-foreground">
                Browse creators in my niche
              </p>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                We already pulled and ranked their top Reels. Pick one and remake
                it in your voice. No waiting.
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ArrowRight className="h-5 w-5" aria-hidden />
            </span>
          </div>
          {featuredBrowsePreview ? (
            <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-5">
              <div className="flex -space-x-2">
                {featuredCreators.slice(0, 3).map((creator) => (
                  <div
                    key={creator.id}
                    className="h-8 w-8 overflow-hidden rounded-full border-2 border-card bg-muted"
                  >
                    <FeaturedProfileAvatar
                      profilePicUrl={creator.profilePicUrl}
                      handle={creator.handle}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{featuredBrowsePreview}</p>
            </div>
          ) : featuredLoading ? (
            <p className="mt-5 border-t border-border/50 pt-5 text-xs text-muted-foreground">
              Loading creators in your niche...
            </p>
          ) : null}
        </button>
        ) : null}

        <div className="mt-4 rounded-2xl border border-border/70 bg-card/50 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">
                Spy a specific account
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {platform === "instagram"
                  ? "Enter any public Instagram handle. Can take 1 to 3 minutes depending on account size."
                  : "Enter any public TikTok handle to find top-performing videos, transcripts, and script ideas."}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground">
              {platform === "instagram" ? (
                <AtSign className="h-5 w-5" aria-hidden />
              ) : (
                <Music2 className="h-5 w-5" aria-hidden />
              )}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border/60 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                Choose a platform
              </p>
              <p className="text-xs text-muted-foreground">
                The rest of your Research page stays in one place.
              </p>
            </div>
            <Tabs
              value={platform}
              onValueChange={(value) =>
                setPlatform(value as "instagram" | "tiktok")
              }
            >
              <TabsList className="grid w-full grid-cols-2 sm:w-64">
                <TabsTrigger value="instagram">Instagram</TabsTrigger>
                <TabsTrigger value="tiktok">TikTok</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {platform === "instagram" ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
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
                  <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary">
                    Paste handle here
                  </span>
                </div>
                <div className="relative rounded-xl ring-1 ring-primary/70 shadow-[0_0_0_3px_hsl(var(--primary)/0.08),0_10px_30px_hsl(var(--primary)/0.12)] transition focus-within:ring-2 focus-within:ring-primary">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
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
                    className="h-12 border-primary/30 bg-primary/5 pl-10"
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
                <div
                  className={
                    profileCardCanStartSpy
                      ? "relative rounded-lg border border-border bg-background p-4 animate-in fade-in slide-in-from-top-2 duration-300 cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      : "rounded-lg border border-border bg-background p-4 animate-in fade-in slide-in-from-top-2 duration-300"
                  }
                  role={profileCardCanStartSpy ? "button" : undefined}
                  tabIndex={profileCardCanStartSpy ? 0 : undefined}
                  aria-label={
                    profileCardCanStartSpy
                      ? `Start spy session for @${profile.username}`
                      : undefined
                  }
                  onClick={profileCardCanStartSpy ? () => requestStartSpy() : undefined}
                  onKeyDown={handleProfileCardKeyDown}
                >
                  {profileCardCanStartSpy && (
                    <span className="absolute top-3 right-3 hidden items-center gap-0.5 text-[10px] font-medium text-primary sm:flex">
                      Click to start
                      <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                    </span>
                  )}
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
                        <div className="hidden text-center sm:block">
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
                            onClick={e => e.stopPropagation()}
                            className="ml-auto hidden items-center gap-1 text-primary hover:underline sm:flex"
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
                        className="min-h-10 w-full shrink-0 sm:w-auto"
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
                disabled={startSpyingDisabled}
              >
                {startScrape.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start spying on Instagram
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <TikTokResearch />
          )}
        </div>
      </div>

      {platform === "instagram" ? (
      <>
      <Separator className="my-10" />

      <section id="featured-creators" className="scroll-mt-24">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Browse creators we already researched
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            No handle in mind? Jump straight to their top Reels. Already sorted
            and ready to remake.
          </p>
          {singleNicheMode && primaryNicheLabel ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {primaryNicheLabel}
              {!featuredLoading && featuredCreators.length > 0
                ? ` · ${featuredCreators.length} creator${featuredCreators.length === 1 ? "" : "s"}`
                : null}
            </p>
          ) : null}
        </div>

        {showNicheTabBar ? (
          <div className="mb-5 -mx-1 overflow-x-auto px-1">
            <div className="flex w-max gap-2">
              <button
                type="button"
                onClick={() => setSelectedNicheSlug("all")}
                className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium transition ${
                  selectedNicheSlug === "all"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Tooltip content="Show every featured creator across all niches">
                  <span>All niches</span>
                </Tooltip>
              </button>
              {visibleNicheTabs.map((niche) => (
                <button
                  key={niche.slug}
                  type="button"
                  onClick={() => setSelectedNicheSlug(niche.slug)}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium transition ${
                    selectedNicheSlug === niche.slug
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {niche.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!showNicheTabBar && !singleNicheMode && selectedNicheSlug !== "all" ? (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {primaryNicheLabel ?? "Featured creators"}
            </span>
            <span className="text-xs text-muted-foreground">
              Sort: Followers (high to low)
            </span>
          </div>
        ) : null}

        {featuredLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="min-h-[11.5rem] rounded-xl border border-border bg-card p-4"
                aria-hidden
              >
                <div className="mb-3 h-5 w-36 animate-pulse rounded bg-muted" />
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
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
              Use the spy form above to research any public handle directly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredCreators.map((creator) => (
              <button
                key={creator.id}
                type="button"
                onClick={() => {
                  if (showHintCard) void dismissHint();
                  setLocation(`/dashboard?featuredAccountId=${creator.id}`);
                }}
                className="rounded-xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/90"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                    <FeaturedProfileAvatar
                      profilePicUrl={creator.profilePicUrl}
                      handle={creator.handle}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {creator.displayName}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      @{creator.handle} · {formatCount(creator.followerCount)}{" "}
                      followers
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex min-h-10 w-full items-center justify-center rounded-lg border border-border bg-background/50 px-3 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary">
                  {seeCreatorsViralReelsCta(creator.displayName, creator.handle, {
                    includeArrow: true,
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 hidden grid-cols-1 gap-4 border-t border-border pt-8 sm:grid sm:grid-cols-3">
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
      </>
      ) : null}
    </div>
  );
}
