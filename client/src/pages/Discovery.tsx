import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Lightbulb,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { formatNumber } from "@/components/InlineWorkflow";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import Tooltip from "@/components/Tooltip";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import { LOADING_TIPS } from "@/data/loadingTips";
import { formatRelativeActive } from "@/lib/formatActivity";
import { cn } from "@/lib/utils";

type DiscoveryResultPayload =
  inferRouterOutputs<AppRouter>["discovery"]["getSearch"];
type DiscoveryJobStatus =
  inferRouterOutputs<AppRouter>["discovery"]["jobStatus"];
type RecentDiscoverySearch =
  inferRouterOutputs<AppRouter>["discovery"]["recentSearches"][number];
type ViralReel = DiscoveryResultPayload["viralReels"][number];
type ViralTier = ViralReel["viralTier"];

const MAX_DESCRIPTION_LENGTH = 500;
const MIN_DESCRIPTION_LENGTH = 20;
const REELS_PER_PAGE = 9;

const DISCOVERY_SEARCH_TIPS: readonly string[] = [
  "We map your description to a niche, then search real Instagram hashtags for recent Reels.",
  "Viral score blends reach (views vs followers) with engagement on each reel.",
  "Reels need at least 5,000 views and 3x reach vs the creator's followers to rank.",
  "Trending through Explosive tiers help you spot breakout formats fast.",
  "Creators behind the reels can be added to your library for full spy sessions.",
  ...LOADING_TIPS.slice(0, 8),
];

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tierBadgeClass(tier: ViralTier): string {
  switch (tier) {
    case "Explosive":
      return "bg-red-500/20 text-red-300 border-red-500/40";
    case "Viral":
      return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "Strong":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "Healthy":
      return "bg-green-500/20 text-green-300 border-green-500/40";
    case "Trending":
    default:
      return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}

function shouldShowViralTierBadge(reel: ViralReel): boolean {
  if (reel.tier === 1) return true;
  return reel.viralTier === "Healthy" || reel.viralTier === "Strong";
}

function DiscoverReelCard({
  reel,
  isPlaying,
  onPlayChange,
}: {
  reel: ViralReel;
  isPlaying: boolean;
  onPlayChange: (playing: boolean) => void;
}) {
  const captionPreview =
    reel.caption.trim().length > 0 ? reel.caption.trim() : null;
  const showTierBadge = shouldShowViralTierBadge(reel);

  return (
    <div className="group relative rounded-lg border border-border/40 bg-card transition-colors hover:border-border/70">
      <div className="relative aspect-[9/14] overflow-hidden">
        <DashboardReelGridMedia
          thumbnailUrl={reel.thumbnailUrl}
          videoUrl={reel.videoUrl}
          className="relative h-full w-full"
          playing={isPlaying}
          onPlayingChange={onPlayChange}
          fallbackLabel={`@${reel.owner.username}`}
        />
        {showTierBadge ? (
          <div className="absolute left-2 top-2 z-10 pointer-events-none">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                tierBadgeClass(reel.viralTier)
              )}
            >
              {reel.viralTier}
            </span>
          </div>
        ) : null}
        <a
          href={reel.reelUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 bottom-2 z-10 rounded-full bg-black/55 p-1.5 text-white/90 backdrop-blur hover:bg-black/75"
          title="Open on Instagram"
          aria-label="Open on Instagram"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="space-y-2 p-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <p className="truncate text-xs font-semibold text-foreground">
            @{reel.owner.username}
          </p>
          {reel.owner.isVerified ? (
            <BadgeCheck
              className="h-3.5 w-3.5 shrink-0 text-sky-400"
              aria-label="Verified"
            />
          ) : null}
        </div>
        {reel.owner.fullName ? (
          <p className="truncate text-[10px] text-muted-foreground">
            {reel.owner.fullName}
          </p>
        ) : null}
        <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
          {captionPreview ?? (
            <span className="italic text-muted-foreground">No caption</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>{formatNumber(reel.views)} views</span>
          <span aria-hidden>·</span>
          <span>{formatNumber(reel.likes)} likes</span>
          <span aria-hidden>·</span>
          <span>{formatNumber(reel.comments)} comments</span>
        </div>
        <a
          href={reel.reelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          Open on Instagram
          <ExternalLink className="h-3 w-3" />
        </a>
        <Tooltip content="Coming next">
          <span className="inline-block w-full">
            <Button type="button" variant="secondary" size="sm" className="w-full" disabled>
              Remake in my voice
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

type DerivedCreator = ViralReel["owner"];
type AddToLibraryState = "idle" | "adding" | "added" | "error";

function deriveUniqueCreators(reels: ViralReel[]): DerivedCreator[] {
  const byUsername = new Map<string, DerivedCreator>();
  for (const reel of reels) {
    const key = reel.owner.username.toLowerCase();
    if (!byUsername.has(key)) {
      byUsername.set(key, reel.owner);
    }
  }
  return [...byUsername.values()];
}

function creatorInitials(owner: DerivedCreator): string {
  const base = (owner.fullName || owner.username).replace(/^@/, "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

function CreatorBehindReelCard({
  owner,
  routedNiche,
  addState,
  onAddToLibrary,
}: {
  owner: DerivedCreator;
  routedNiche: string;
  addState: AddToLibraryState;
  onAddToLibrary: (handle: string) => void;
}) {
  const avatarSrc = owner.profilePicUrl?.trim() || null;
  const displayName = owner.fullName.trim() || `@${owner.username}`;
  const nicheLabel = routedNiche.trim() || "your niche";
  const isAdding = addState === "adding";
  const isAdded = addState === "added";

  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 bg-background/50 p-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 to-fuchsia-500/50 text-[10px] font-semibold text-white">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          creatorInitials(owner)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
          {owner.isVerified ? (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-label="Verified" />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          @{owner.username} · {formatNumber(owner.followers)} · {nicheLabel}
        </p>
      </div>
      <Button
        type="button"
        variant={isAdded ? "secondary" : "outline"}
        size="sm"
        className="h-8 shrink-0 px-2.5 text-xs"
        disabled={isAdding || isAdded}
        onClick={() => onAddToLibrary(owner.username)}
      >
        {isAdding ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            Adding...
          </>
        ) : isAdded ? (
          <>
            <Check className="mr-1 h-3.5 w-3.5" />
            Added
          </>
        ) : (
          "Add to library"
        )}
      </Button>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

function ReelGrid({
  reels,
  playingShortcode,
  onPlayShortcodeChange,
}: {
  reels: ViralReel[];
  playingShortcode: string | null;
  onPlayShortcodeChange: (shortcode: string | null) => void;
}) {
  if (reels.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {reels.map((reel) => (
        <DiscoverReelCard
          key={reel.shortcode}
          reel={reel}
          isPlaying={playingShortcode === reel.shortcode}
          onPlayChange={(playing) =>
            onPlayShortcodeChange(playing ? reel.shortcode : null)
          }
        />
      ))}
    </div>
  );
}

function ReelPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

function truncateText(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function RecentSearchesDropdown({
  open,
  items,
  onSelect,
  onDeleted,
  loadingId,
}: {
  open: boolean;
  items: RecentDiscoverySearch[];
  onSelect: (item: RecentDiscoverySearch) => void;
  onDeleted: () => void;
  loadingId: number | null;
}) {
  const deleteSearch = trpc.discovery.deleteSearch.useMutation({
    onSuccess: () => {
      void onDeleted();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!open || items.length === 0) return null;

  return (
    <div
      className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      <ul className="max-h-64 overflow-y-auto py-1">
        {items.map((item) => {
          const isLoading = loadingId === item.id;
          const isDeleting =
            deleteSearch.isPending && deleteSearch.variables?.id === item.id;
          return (
            <li key={item.id} className="flex items-stretch">
              <button
                type="button"
                disabled={isLoading || isDeleting}
                onClick={() => onSelect(item)}
                className={cn(
                  "min-w-0 flex-1 px-3 py-2 text-left transition-colors",
                  "hover:bg-muted/50 disabled:opacity-60"
                )}
              >
                <p className="text-xs font-medium text-foreground line-clamp-2">
                  {truncateText(item.businessDescription, 100)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {item.routedNiche ? `${item.routedNiche} · ` : ""}
                  {item.reelCount} reel{item.reelCount === 1 ? "" : "s"} ·{" "}
                  {formatRelativeActive(item.createdAt)}
                </p>
              </button>
              <button
                type="button"
                aria-label="Remove saved search"
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSearch.mutate({ id: item.id });
                }}
                className="shrink-0 px-2.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DiscoverySearchLoading() {
  const tips = useMemo(() => shuffle(DISCOVERY_SEARCH_TIPS), []);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const tipIndexRef = useRef(0);

  useEffect(() => {
    const rotate = setInterval(() => {
      setTipVisible(false);
      const fadeTimer = setTimeout(() => {
        tipIndexRef.current = (tipIndexRef.current + 1) % tips.length;
        setTipIndex(tipIndexRef.current);
        setTipVisible(true);
      }, 300);
      return () => clearTimeout(fadeTimer);
    }, 7000);
    return () => clearInterval(rotate);
  }, [tips.length]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center rounded-xl border border-border/60 bg-muted/20 w-full">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="space-y-2 max-w-md px-4">
        <p className="font-medium">Finding viral reels in your niche...</p>
        <p className="text-sm text-muted-foreground">
          This usually takes 10 to 20 seconds. We are routing your niche and searching
          hashtags on Instagram.
        </p>
        <div
          className={cn(
            "mt-4 rounded-lg border border-border/50 bg-background/60 px-4 py-3 text-left transition-opacity duration-300",
            tipVisible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                While you wait
              </p>
              <p className="text-sm text-foreground/90">{tips[tipIndex]}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoveryJobProgress({ job }: { job: DiscoveryJobStatus }) {
  if (job.status === "pending" || job.creatorsTotal === 0) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Finding creators...
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      Drilling {job.creatorsDrilled}/{job.creatorsTotal} creators · {job.reelsFound}{" "}
      reels so far
    </p>
  );
}

export default function Discovery() {
  if (!isDiscoveryV1Enabled) {
    return null;
  }

  const [description, setDescription] = useState("");
  const [result, setResult] = useState<DiscoveryResultPayload | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [reelPage, setReelPage] = useState(1);
  const [playingShortcode, setPlayingShortcode] = useState<string | null>(null);
  const [replayedAt, setReplayedAt] = useState<Date | null>(null);
  const [loadingReplayId, setLoadingReplayId] = useState<number | null>(null);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [hideRecentDropdown, setHideRecentDropdown] = useState(false);
  const [addStateByUsername, setAddStateByUsername] = useState<
    Record<string, AddToLibraryState>
  >({});

  const recentSearchesQuery = trpc.discovery.recentSearches.useQuery();
  const jobStatusQuery = trpc.discovery.jobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: activeJobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2500;
      },
    }
  );
  const trpcUtils = trpc.useUtils();
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      for (const id of pollIntervalsRef.current.values()) {
        clearInterval(id);
      }
      pollIntervalsRef.current.clear();
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const job = jobStatusQuery.data;
    if (!job || activeJobId == null) return;

    if (job.partialJson) {
      setResult(job.partialJson);
    }

    if (job.status === "completed") {
      setActiveJobId(null);
      setReelPage(1);
      setPlayingShortcode(null);
      setReplayedAt(null);
      setHideRecentDropdown(true);
      void recentSearchesQuery.refetch();
    } else if (job.status === "failed") {
      setActiveJobId(null);
      setResult(null);
      setReplayedAt(null);
      toast.error(job.errorMessage?.trim() || "Discovery search failed");
    }
  }, [jobStatusQuery.data, activeJobId]);

  const searchMutation = trpc.discovery.search.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setResult(null);
      setReelPage(1);
      setPlayingShortcode(null);
      setReplayedAt(null);
      setHideRecentDropdown(true);
      setTextareaFocused(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setActiveJobId(null);
      setResult(null);
      setReplayedAt(null);
    },
  });

  const startScrape = trpc.scrape.start.useMutation();

  const trimmed = description.trim();
  const jobStatus = jobStatusQuery.data;
  const isJobRunning =
    activeJobId != null &&
    jobStatus?.status !== "completed" &&
    jobStatus?.status !== "failed";
  const isSearching = searchMutation.isPending || isJobRunning;
  const isReplayLoading = loadingReplayId != null;
  const submitEnabled =
    trimmed.length >= MIN_DESCRIPTION_LENGTH && !isSearching && !isReplayLoading;

  const tier1Reels = useMemo(
    () => (result ? result.viralReels.filter((r) => r.tier === 1) : []),
    [result]
  );
  const tier2Reels = useMemo(
    () => (result ? result.viralReels.filter((r) => r.tier === 2) : []),
    [result]
  );
  const orderedReels = useMemo(
    () => [...tier1Reels, ...tier2Reels],
    [tier1Reels, tier2Reels]
  );

  const uniqueCreators = useMemo(
    () => (result ? deriveUniqueCreators(result.viralReels) : []),
    [result]
  );

  const totalPages = Math.ceil(orderedReels.length / REELS_PER_PAGE);
  const paginatedReels = useMemo(() => {
    const start = (reelPage - 1) * REELS_PER_PAGE;
    return orderedReels.slice(start, start + REELS_PER_PAGE);
  }, [orderedReels, reelPage]);

  const paginatedTier1 = useMemo(
    () => paginatedReels.filter((r) => r.tier === 1),
    [paginatedReels]
  );
  const paginatedTier2 = useMemo(
    () => paginatedReels.filter((r) => r.tier === 2),
    [paginatedReels]
  );

  const stopPollingForUser = (userKey: string) => {
    const intervalId = pollIntervalsRef.current.get(userKey);
    if (intervalId) clearInterval(intervalId);
    pollIntervalsRef.current.delete(userKey);
  };

  const startPollingScrapeJob = (username: string, jobId: number) => {
    const userKey = username.toLowerCase();
    stopPollingForUser(userKey);

    const pollOnce = async () => {
      try {
        const progress = await trpcUtils.scrape.progress.fetch({ jobId });
        if (progress.status === "completed") {
          stopPollingForUser(userKey);
          setAddStateByUsername((prev) => ({ ...prev, [userKey]: "added" }));
          toast.success(`@${username} added`);
        } else if (progress.status === "failed") {
          stopPollingForUser(userKey);
          setAddStateByUsername((prev) => ({ ...prev, [userKey]: "error" }));
          toast.error(
            progress.errorMessage?.trim() || `Failed to add @${username} to your library`
          );
        }
      } catch {
        // Keep polling until terminal status or user leaves the page.
      }
    };

    void pollOnce();
    const intervalId = setInterval(() => void pollOnce(), 3000);
    pollIntervalsRef.current.set(userKey, intervalId);
  };

  const handleSubmit = () => {
    if (!submitEnabled) return;
    setActiveJobId(null);
    setResult(null);
    setReelPage(1);
    setPlayingShortcode(null);
    setReplayedAt(null);
    setLoadingReplayId(null);
    setHideRecentDropdown(true);
    searchMutation.mutate({ businessDescription: trimmed });
  };

  const handleReplaySearch = async (item: RecentDiscoverySearch) => {
    setActiveJobId(null);
    setLoadingReplayId(item.id);
    setReplayedAt(new Date(item.createdAt));
    setHideRecentDropdown(true);
    setTextareaFocused(false);
    try {
      const data = await trpcUtils.discovery.getSearch.fetch({ id: item.id });
      setResult(data);
      setReelPage(1);
      setPlayingShortcode(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load saved search");
      setReplayedAt(null);
    } finally {
      setLoadingReplayId(null);
    }
  };

  const handleAddToLibrary = (username: string) => {
    const handle = username.replace(/^@/, "").trim();
    if (!handle) return;
    const userKey = handle.toLowerCase();
    const current = addStateByUsername[userKey] ?? "idle";
    if (current === "adding" || current === "added") return;

    setAddStateByUsername((prev) => ({ ...prev, [userKey]: "adding" }));
    toast(`Adding @${handle} to your library`);

    startScrape.mutate(
      { handle, timeframeDays: 90 },
      {
        onSuccess: (data) => {
          if ("redirect" in data && data.redirect === "featured") {
            setAddStateByUsername((prev) => ({ ...prev, [userKey]: "added" }));
            toast(`@${handle} is already in your library`);
            return;
          }
          startPollingScrapeJob(handle, data.jobId);
        },
        onError: (err) => {
          setAddStateByUsername((prev) => ({ ...prev, [userKey]: "error" }));
          toast.error(err.message);
        },
      }
    );
  };

  const handlePageChange = (page: number) => {
    setReelPage(page);
    setPlayingShortcode(null);
  };

  const showResults = result != null && !isReplayLoading;
  const showInitialLoading =
    (searchMutation.isPending || (isJobRunning && result == null)) &&
    !isReplayLoading;
  const reelCount = result?.viralReels.length ?? 0;
  const recentSearches = recentSearchesQuery.data ?? [];
  const showRecentDropdown =
    textareaFocused &&
    !hideRecentDropdown &&
    trimmed.length === 0 &&
    recentSearches.length > 0 &&
    !isSearching;

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20">
            <Compass className="h-6 w-6 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold">Discovery</h1>
        </div>
        <p className="text-muted-foreground">
          Describe your business in plain language. We find viral Reels in your niche
          and the creators behind them.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative space-y-2">
          <Textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
            }
            onFocus={() => {
              if (blurTimerRef.current) {
                clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
              }
              setTextareaFocused(true);
              if (trimmed.length === 0) setHideRecentDropdown(false);
            }}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => {
                setTextareaFocused(false);
              }, 200);
            }}
            placeholder="What do you make or sell, and who is it for? Be specific so we can route your niche."
            rows={5}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={isSearching}
            className="resize-y min-h-[120px]"
          />
          <RecentSearchesDropdown
            open={showRecentDropdown}
            items={recentSearches}
            onSelect={handleReplaySearch}
            onDeleted={() => void recentSearchesQuery.refetch()}
            loadingId={loadingReplayId}
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
            {trimmed.length > 0 && trimmed.length < MIN_DESCRIPTION_LENGTH
              ? ` (${MIN_DESCRIPTION_LENGTH} character minimum)`
              : ""}
          </p>
        </div>

        <Button type="button" onClick={handleSubmit} disabled={!submitEnabled}>
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            "Find viral reels"
          )}
        </Button>
      </div>

      {showInitialLoading || isReplayLoading ? <DiscoverySearchLoading /> : null}

      {showResults ? (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1 lg:w-[70%] space-y-6">
            {isJobRunning && jobStatus ? (
              <DiscoveryJobProgress job={jobStatus} />
            ) : null}
            {replayedAt ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground/90">
                Showing saved results from {formatRelativeActive(replayedAt)}. Run a
                new search for fresh data.
              </div>
            ) : null}
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Viral reels in {result.routedNiche || "your niche"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {reelCount} reel{reelCount === 1 ? "" : "s"} found
                {tier1Reels.length > 0 && tier2Reels.length > 0
                  ? ` (${tier1Reels.length} viral, ${tier2Reels.length} more)`
                  : ""}
              </p>
            </div>

            {reelCount === 0 ? (
              <Card>
                <CardContent className="p-6 space-y-3 text-center">
                  <p className="text-sm text-foreground/90">
                    No reels passed our viral filters this time. Try a more specific
                    description or a slightly different angle on your audience.
                  </p>
                  {result.hashtagFailures.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Some hashtags returned no results:{" "}
                      {result.hashtagFailures.map((h) => `#${h}`).join(", ")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <>
                {paginatedTier1.length > 0 ? (
                  <ReelGrid
                    reels={paginatedTier1}
                    playingShortcode={playingShortcode}
                    onPlayShortcodeChange={setPlayingShortcode}
                  />
                ) : null}

                {paginatedTier2.length > 0 ? (
                  <div className="space-y-4">
                    <h3
                      className={cn(
                        "text-base font-semibold",
                        paginatedTier1.length > 0 && "pt-2 border-t border-border/60"
                      )}
                    >
                      More in this niche
                    </h3>
                    <ReelGrid
                      reels={paginatedTier2}
                      playingShortcode={playingShortcode}
                      onPlayShortcodeChange={setPlayingShortcode}
                    />
                  </div>
                ) : null}

                <ReelPagination
                  page={reelPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </>
            )}
          </div>

          {uniqueCreators.length > 0 ? (
            <aside className="w-full lg:w-[30%] lg:sticky lg:top-6 lg:self-start space-y-3">
              <h3 className="text-base font-semibold">Creators behind these reels</h3>
              <div className="space-y-3">
                {uniqueCreators.map((owner) => (
                  <CreatorBehindReelCard
                    key={owner.username}
                    owner={owner}
                    routedNiche={result.routedNiche || "your niche"}
                    addState={
                      addStateByUsername[owner.username.toLowerCase()] ?? "idle"
                    }
                    onAddToLibrary={handleAddToLibrary}
                  />
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
