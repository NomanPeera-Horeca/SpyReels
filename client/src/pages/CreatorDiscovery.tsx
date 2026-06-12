import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Loader2,
  Users,
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
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No thumbnail
          </div>
        )}
        <div className="absolute left-2 top-2 z-10 pointer-events-none">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              creatorTierBadgeClass(creator.bestReel.tier)
            )}
          >
            {creatorTierLabel(creator.bestReel.tier)}
            <span className="font-mono opacity-90">
              {creator.bestReel.viralScore.toFixed(1)}
            </span>
          </span>
        </div>
        <div className="absolute bottom-2 left-2 right-2 z-10 rounded bg-black/65 px-2 py-1 text-[10px] text-white pointer-events-none">
          {formatNumber(creator.bestReel.views)} views ·{" "}
          {formatNumber(creator.bestReel.likes)} likes
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
  const preFilterCountRef = useRef<number | null>(null);

  const recentSearchesQuery = trpc.creatorDiscovery.recentSearches.useQuery();
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
      if (preFilterCountRef.current != null) {
        setPreFilterCount(preFilterCountRef.current);
      }
      void recentSearchesQuery.refetch();
    } else if (job.status === "failed") {
      setActiveJobId(null);
      setResult(null);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
      toast.error(job.errorMessage?.trim() || "Creator discovery search failed");
    }
  }, [jobStatusQuery.data, activeJobId, recentSearchesQuery]);

  const searchMutation = trpc.creatorDiscovery.search.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setResult(null);
      setCreatorPage(1);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
    },
    onError: (err) => {
      toast.error(err.message);
      setActiveJobId(null);
      setResult(null);
      setPreFilterCount(null);
      preFilterCountRef.current = null;
    },
  });

  const trimmed = description.trim();
  const jobStatus = jobStatusQuery.data;
  const isJobRunning =
    activeJobId != null &&
    jobStatus?.status !== "completed" &&
    jobStatus?.status !== "failed";
  const isSearching = searchMutation.isPending || isJobRunning;
  const submitEnabled = trimmed.length >= MIN_DESCRIPTION_LENGTH && !isSearching;

  const rankedCreators = result?.rankedCreators ?? [];
  const totalPages = Math.ceil(
    rankedCreators.length / DISCOVERY_CREATORS_PER_PAGE
  );
  const paginatedCreators = useMemo(() => {
    const start = (creatorPage - 1) * DISCOVERY_CREATORS_PER_PAGE;
    return rankedCreators.slice(start, start + DISCOVERY_CREATORS_PER_PAGE);
  }, [rankedCreators, creatorPage]);

  const showInitialLoading =
    (searchMutation.isPending || (isJobRunning && result == null)) &&
    rankedCreators.length === 0;
  const showResults = result != null && rankedCreators.length > 0;

  const handleSubmit = () => {
    if (!submitEnabled) return;
    setActiveJobId(null);
    setResult(null);
    setCreatorPage(1);
    setPreFilterCount(null);
    preFilterCountRef.current = null;
    searchMutation.mutate({ businessDescription: trimmed });
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
        <div className="space-y-2">
          <Textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
            }
            placeholder="What do you make or sell, and who is it for? Be specific so we can route your niche."
            rows={5}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={isSearching}
            className="resize-y min-h-[120px]"
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
            "Find peer creators"
          )}
        </Button>
      </div>

      {showInitialLoading ? <CreatorDiscoverySearchLoading /> : null}

      {(showResults || isJobRunning || searchMutation.isPending) &&
      !showInitialLoading ? (
        <div className="space-y-6">
          <CreatorDiscoveryProgress
            job={jobStatus}
            result={result}
            isJobRunning={isJobRunning}
            isSearchStarting={searchMutation.isPending}
            preFilterCount={preFilterCount}
          />
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
