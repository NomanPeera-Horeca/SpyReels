import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { TRPCClientError } from "@trpc/client";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Lightbulb,
  Loader2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { formatNumber } from "@/components/InlineWorkflow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import { formatRelativeActive } from "@/lib/formatActivity";
import { LOADING_TIPS } from "@/data/loadingTips";
import { cn } from "@/lib/utils";

type CreatorDiscoveryResult =
  inferRouterOutputs<AppRouter>["creatorDiscovery"]["getSearch"];
type CreatorDiscoveryJobStatus =
  inferRouterOutputs<AppRouter>["creatorDiscovery"]["jobStatus"];
type RecentCreatorDiscoverySearch =
  inferRouterOutputs<AppRouter>["creatorDiscovery"]["recentSearches"][number];
type RankedCreator = CreatorDiscoveryResult["rankedCreators"][number];

const MAX_DESCRIPTION_LENGTH = 1000;
const MIN_DESCRIPTION_LENGTH = 20;
const DISCOVERY_CREATORS_PER_PAGE = 9;

const CREATOR_DISCOVERY_SEARCH_TIPS: readonly string[] = [
  "We route your business to a niche, then generate topic phrases real creators rank for on Instagram.",
  "Each topic is searched on Instagram to find reels from creators in your space.",
  "Viral score blends reach (views vs followers) with engagement on each creator's best reel.",
  "We collapse multiple hits into one entry per creator, keeping their strongest reel.",
  "A peer filter removes keyword collisions: creators who matched a word but are not in your niche.",
  "Creators with 10,000+ followers and strong reach multipliers rise to the top of your list.",
  ...LOADING_TIPS.slice(0, 6),
];

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]!];
  }
  return out;
}

function creatorTierBadgeClass(tier: 1 | 2): string {
  if (tier === 1) {
    return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  }
  return "bg-slate-500/20 text-slate-300 border-slate-500/40";
}

function creatorTierLabel(tier: 1 | 2): string {
  return tier === 1 ? "Tier 1" : "Tier 2";
}

function formatQuotaResetDate(resetsAt: string): string {
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return resetsAt;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isValidEngagementCount(value: number | null | undefined): boolean {
  return value != null && value >= 0;
}

function formatReelStatsOverlay(views: number, likes: number): string {
  const viewsPart = `${formatNumber(views)} views`;
  if (!isValidEngagementCount(likes)) {
    return viewsPart;
  }
  return `${viewsPart} · ${formatNumber(likes)} likes`;
}

function ReelThumbnailPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/90 via-muted/50 to-muted/30">
      <Clapperboard className="h-8 w-8 text-muted-foreground/45" aria-hidden />
      <span className="text-[10px] text-muted-foreground/70">No preview</span>
    </div>
  );
}

function ReelThumbnail({ src }: { src: string | null }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const trimmed = src?.trim() ?? "";

  if (!trimmed || loadFailed) {
    return <ReelThumbnailPlaceholder />;
  }

  return (
    <img
      src={trimmed}
      alt=""
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setLoadFailed(true)}
    />
  );
}

function creatorInitials(creator: RankedCreator): string {
  const base = (creator.owner.fullName || creator.owner.username)
    .replace(/^@/, "")
    .trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
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
  items: RecentCreatorDiscoverySearch[];
  onSelect: (item: RecentCreatorDiscoverySearch) => void;
  onDeleted: () => void;
  loadingId: number | null;
}) {
  const deleteSearch = trpc.creatorDiscovery.deleteSearch.useMutation({
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
                  {item.creatorCount} creator
                  {item.creatorCount === 1 ? "" : "s"} ·{" "}
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

function isPrePeer(result: CreatorDiscoveryResult | null): boolean {
  const list = result?.rankedCreators ?? [];
  return (
    list.length > 0 &&
    list.some((c) => c.peerReason === "pending peer-score")
  );
}

function CreatorDiscoverySearchLoading() {
  const tips = useMemo(() => shuffle(CREATOR_DISCOVERY_SEARCH_TIPS), []);
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
        <p className="font-medium">Finding peer creators in your niche...</p>
        <p className="text-sm text-muted-foreground">
          This usually takes 5 to 10 minutes. We route your niche, search topics
          on Instagram, and filter for genuine peers.
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

function CreatorDiscoveryProgress({
  job,
  result,
  isJobRunning,
  isSearchStarting,
  preFilterCount,
}: {
  job: CreatorDiscoveryJobStatus | undefined;
  result: CreatorDiscoveryResult | null;
  isJobRunning: boolean;
  isSearchStarting: boolean;
  preFilterCount: number | null;
}) {
  const rankedCount = result?.rankedCreators.length ?? 0;

  if (
    !isJobRunning &&
    !isSearchStarting &&
    result &&
    rankedCount > 0
  ) {
    const niche = result.routedNiche.trim() || "your niche";
    const filteredFrom =
      preFilterCount != null && preFilterCount > rankedCount
        ? preFilterCount
        : null;

    return (
      <div className="space-y-1">
        <p className="text-lg font-semibold">
          {rankedCount} top peer{rankedCount === 1 ? "" : "s"} in {niche}
        </p>
        {filteredFrom != null ? (
          <p className="text-sm text-muted-foreground">
            (filtered from {filteredFrom} creators searched)
          </p>
        ) : null}
      </div>
    );
  }

  if (!isJobRunning && !isSearchStarting) return null;

  const topicsTotal = job?.topicsTotal ?? 0;
  const topicsSearched = job?.topicsSearched ?? 0;
  const creatorsFound =
    job?.creatorsFound ?? result?.rankedCreators.length ?? 0;
  const prePeer = isPrePeer(result);

  let message = "Routing your niche...";

  if (job?.status === "pending" || (topicsTotal === 0 && !prePeer)) {
    message = "Routing your niche...";
  } else if (topicsTotal > 0 && topicsSearched === 0) {
    message = "Building search topics...";
  } else if (topicsSearched < topicsTotal) {
    message = `Searching topics ${topicsSearched}/${topicsTotal} · ${creatorsFound} creators found so far`;
  } else if (prePeer) {
    const n = result?.rankedCreators.length ?? creatorsFound;
    message = `Found ${n} creators · selecting best peers...`;
  } else {
    const n = preFilterCount ?? creatorsFound;
    message = `Selecting best peers from ${n} creators...`;
  }

  return (
    <p className="text-sm text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      {message}
    </p>
  );
}

function CreatorDiscoveryCard({ creator }: { creator: RankedCreator }) {
  const rank = creator.rank ?? 0;
  const avatarSrc = creator.owner.profilePicUrl?.trim() || null;
  const displayName =
    creator.owner.fullName.trim() || `@${creator.owner.username}`;
  const captionPreview = creator.bestReel.caption.trim();
  const thumbSrc = creator.bestReel.thumbnailUrl?.trim() || null;

  return (
    <div className="group relative flex flex-col rounded-lg border border-border/40 bg-card transition-colors hover:border-border/70">
      <div className="flex items-center gap-2.5 border-b border-border/40 p-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 to-fuchsia-500/50 text-[10px] font-semibold text-white">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            creatorInitials(creator)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          <p className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/90">
              @{creator.owner.username}
            </span>
            <span aria-hidden> · </span>
            <span>{formatNumber(creator.owner.followers)} followers</span>
          </p>
        </div>
        {rank > 0 ? (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
            #{rank}
          </span>
        ) : null}
      </div>

      <div className="relative aspect-[9/14] overflow-hidden bg-muted/30">
        <ReelThumbnail src={thumbSrc} />
        <div className="absolute left-3 top-3 z-10 pointer-events-none max-w-[calc(100%-1.5rem)]">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-md backdrop-blur-[2px]",
              creatorTierBadgeClass(creator.bestReel.tier)
            )}
          >
            {creatorTierLabel(creator.bestReel.tier)}
            <span className="font-mono tabular-nums opacity-95">
              {creator.bestReel.viralScore.toFixed(1)}
            </span>
          </span>
        </div>
        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 rounded-md bg-black/70 px-2 py-1 text-[10px] leading-snug text-white pointer-events-none">
          {formatReelStatsOverlay(
            creator.bestReel.views,
            creator.bestReel.likes
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
          {captionPreview.length > 0 ? (
            captionPreview
          ) : (
            <span className="italic text-muted-foreground">No caption</span>
          )}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Found via{" "}
          <span className="text-foreground/80">{creator.foundViaPillar}</span>
          {creator.foundViaTopic.trim() ? (
            <>
              {" "}
              · <span className="italic">&quot;{creator.foundViaTopic}&quot;</span>
            </>
          ) : null}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mt-auto inline-flex w-full cursor-not-allowed">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-none w-full opacity-60"
                disabled
                tabIndex={-1}
                aria-disabled="true"
              >
                See their reels
                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                  Coming soon
                </span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Dive into a creator&apos;s full reel library in a future update.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function CreatorGrid({ creators }: { creators: RankedCreator[] }) {
  if (creators.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {creators.map((creator) => (
        <CreatorDiscoveryCard
          key={creator.owner.username.toLowerCase()}
          creator={creator}
        />
      ))}
    </div>
  );
}

function CreatorPagination({
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

export default function CreatorDiscovery() {
  if (!isDiscoveryV1Enabled) {
    return null;
  }

  const [description, setDescription] = useState("");
  const [result, setResult] = useState<CreatorDiscoveryResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [creatorPage, setCreatorPage] = useState(1);
  const [preFilterCount, setPreFilterCount] = useState<number | null>(null);
  const [replayedAt, setReplayedAt] = useState<Date | null>(null);
  const [loadingReplayId, setLoadingReplayId] = useState<number | null>(null);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [hideRecentDropdown, setHideRecentDropdown] = useState(false);
  const preFilterCountRef = useRef<number | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentSearchesQuery = trpc.creatorDiscovery.recentSearches.useQuery();
  const quotaQuery = trpc.creatorDiscovery.getQuota.useQuery();
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);
  const jobStatusQuery = trpc.creatorDiscovery.jobStatus.useQuery(
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

  useEffect(() => {
    const job = jobStatusQuery.data;
    if (!job || activeJobId == null) return;

    if (job.partialJson) {
      setResult(job.partialJson);
      if (isPrePeer(job.partialJson)) {
        const n = Math.max(
          job.creatorsFound ?? 0,
          job.partialJson.rankedCreators.length
        );
        if (n > 0) {
          preFilterCountRef.current = n;
          setPreFilterCount(n);
        }
      }
    }

    if (job.status === "completed") {
      setActiveJobId(null);
      setCreatorPage(1);
      setReplayedAt(null);
      setHideRecentDropdown(true);
      if (preFilterCountRef.current != null) {
        setPreFilterCount(preFilterCountRef.current);
      }
      void recentSearchesQuery.refetch();
      void quotaQuery.refetch();
    } else if (job.status === "failed") {
      setActiveJobId(null);
      setResult(null);
      setReplayedAt(null);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
      toast.error(job.errorMessage?.trim() || "Creator discovery search failed");
    }
  }, [jobStatusQuery.data, activeJobId, recentSearchesQuery, quotaQuery]);

  const searchMutation = trpc.creatorDiscovery.search.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setResult(null);
      setCreatorPage(1);
      setReplayedAt(null);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
      setHideRecentDropdown(true);
      setTextareaFocused(false);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly search limit reached.");
        void quotaQuery.refetch();
      } else {
        toast.error(err.message);
      }
      setActiveJobId(null);
      setResult(null);
      setReplayedAt(null);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
    },
  });

  const trimmed = description.trim();
  const jobStatus = jobStatusQuery.data;
  const quotaUsed = quotaQuery.data?.used ?? 0;
  const quotaLimit = quotaQuery.data?.limit ?? 0;
  const quotaResetsAt = quotaQuery.data?.resetsAt;
  const quotaAtLimit =
    quotaQuery.data != null && quotaUsed >= quotaLimit && quotaLimit > 0;
  const quotaNearLimit =
    quotaQuery.data != null &&
    quotaLimit > 0 &&
    quotaUsed >= quotaLimit - 1 &&
    !quotaAtLimit;
  const isJobRunning =
    activeJobId != null &&
    jobStatus?.status !== "completed" &&
    jobStatus?.status !== "failed";
  const isSearching = searchMutation.isPending || isJobRunning;
  const isReplayLoading = loadingReplayId != null;
  const submitEnabled =
    trimmed.length >= MIN_DESCRIPTION_LENGTH &&
    !isSearching &&
    !isReplayLoading &&
    !quotaAtLimit;

  const rankedCreators = result?.rankedCreators ?? [];
  const recentSearches = recentSearchesQuery.data ?? [];
  const showRecentDropdown =
    textareaFocused &&
    !hideRecentDropdown &&
    trimmed.length === 0 &&
    recentSearches.length > 0 &&
    !isSearching;
  const totalPages = Math.ceil(
    rankedCreators.length / DISCOVERY_CREATORS_PER_PAGE
  );
  const paginatedCreators = useMemo(() => {
    const start = (creatorPage - 1) * DISCOVERY_CREATORS_PER_PAGE;
    return rankedCreators.slice(start, start + DISCOVERY_CREATORS_PER_PAGE);
  }, [rankedCreators, creatorPage]);

  const showInitialLoading =
    (searchMutation.isPending || (isJobRunning && result == null)) &&
    !isReplayLoading;
  const showResults =
    result != null && rankedCreators.length > 0 && !isReplayLoading;

  const handleSubmit = () => {
    if (!submitEnabled) return;
    setActiveJobId(null);
    setResult(null);
    setCreatorPage(1);
    setReplayedAt(null);
    setLoadingReplayId(null);
    setPreFilterCount(null);
    preFilterCountRef.current = null;
    setHideRecentDropdown(true);
    searchMutation.mutate({ businessDescription: trimmed });
  };

  const handleReplaySearch = async (item: RecentCreatorDiscoverySearch) => {
    setActiveJobId(null);
    setLoadingReplayId(item.id);
    setReplayedAt(new Date(item.createdAt));
    setHideRecentDropdown(true);
    setTextareaFocused(false);
    try {
      const data = await trpcUtils.creatorDiscovery.getSearch.fetch({
        id: item.id,
      });
      setResult(data);
      setCreatorPage(1);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load saved search"
      );
      setReplayedAt(null);
    } finally {
      setLoadingReplayId(null);
    }
  };

  const handlePageChange = useCallback((page: number) => {
    setCreatorPage(page);
  }, []);

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
            <Users className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold">Discover Creators</h1>
        </div>
        <p className="text-muted-foreground">
          Describe your business in plain language. We find peer creators in your
          niche who are already winning with content like yours.
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

        <div className="space-y-2">
          <Button type="button" onClick={handleSubmit} disabled={!submitEnabled}>
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              "Find peer creators"
            )}
          </Button>
          {quotaQuery.data ? (
            <p className="text-xs text-muted-foreground">
              {quotaUsed} / {quotaLimit} discovery searches used this month
              {(quotaAtLimit || quotaNearLimit) && quotaResetsAt ? (
                <>
                  {" "}
                  · Resets {formatQuotaResetDate(quotaResetsAt)}
                </>
              ) : null}
            </p>
          ) : null}
          {quotaAtLimit && quotaResetsAt ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              You&apos;ve used all {quotaLimit} discovery searches this month.
              Resets {formatQuotaResetDate(quotaResetsAt)}.
            </p>
          ) : null}
        </div>
      </div>

      {showInitialLoading || isReplayLoading ? (
        <CreatorDiscoverySearchLoading />
      ) : null}

      {showResults || isJobRunning || searchMutation.isPending ? (
        <div className="space-y-6">
          <CreatorDiscoveryProgress
            job={jobStatus}
            result={result}
            isJobRunning={isJobRunning}
            isSearchStarting={searchMutation.isPending}
            preFilterCount={preFilterCount}
          />
          {replayedAt ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground/90">
              Showing saved results from {formatRelativeActive(replayedAt)}. Run a
              new search for fresh data.
            </div>
          ) : null}
          {showResults ? (
            <>
              <CreatorGrid creators={paginatedCreators} />
              <CreatorPagination
                page={creatorPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </>
          ) : isJobRunning ? (
            <p className="text-sm text-muted-foreground">
              Creators will appear here as topics are searched...
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
