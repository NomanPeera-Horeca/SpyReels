import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { Flame, Loader2, Zap } from "lucide-react";
import { RemakeHowSpyReelsWritesDialog } from "@/components/RemakeHowSpyReelsWritesDialog";
import { ExploreSearchLoading } from "@/components/viral-posts/ExploreSearchLoading";
import { SavedPostFilters } from "@/components/viral-posts/SavedPostFilters";
import { ViralPostFilters } from "@/components/viral-posts/ViralPostFilters";
import { ViralPostGrid } from "@/components/viral-posts/ViralPostGrid";
import { WhyItWorksModal } from "@/components/viral-posts/WhyItWorksModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import {
  EXPLORE_SUGGESTED_SEARCHES,
} from "@/lib/viralPosts/viralPostsService";
import { browserTimezone, formatFeedLocalDate, localDateString } from "@/lib/viralPosts/format";
import type {
  ExploreAdvancedFilters,
  ExploreQuickFilter,
  SavedPostsFilter,
  ViralPost,
  ViralPostsTab,
} from "@/lib/viralPosts/types";
import { DEFAULT_EXPLORE_FILTERS, normalizeExploreFilters } from "@/lib/viralPosts/types";
import type { ViralDailyFeedResponse } from "@shared/viralPosts";
import {
  applyExplorePostFilters,
  exploreEmptyCopy,
} from "@shared/viralPostsExploreFilters";

function parseTab(raw: string | null): ViralPostsTab {
  if (raw === "explore" || raw === "saved" || raw === "for-you") return raw;
  return "for-you";
}

function filterVisiblePosts(
  items: ViralPost[],
  hiddenCreatorKeys: Set<string>
): ViralPost[] {
  return items.filter((p) => {
    const key = (p.creatorId || p.creatorHandle || "")
      .toLowerCase()
      .replace(/^@/, "");
    return !key || !hiddenCreatorKeys.has(key);
  });
}

export default function ViralPosts() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const tab = useMemo(
    () => parseTab(new URLSearchParams(searchString).get("tab")),
    [searchString]
  );

  const timezone = useMemo(() => browserTimezone(), []);
  const localDate = useMemo(() => localDateString(), []);

  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreQuick, setExploreQuick] = useState<ExploreQuickFilter>("all");
  const [exploreFilters, setExploreFiltersRaw] = useState<ExploreAdvancedFilters>(
    DEFAULT_EXPLORE_FILTERS
  );
  const setExploreFilters = (value: ExploreAdvancedFilters) =>
    setExploreFiltersRaw(normalizeExploreFilters(value));
  const [savedFilter, setSavedFilter] = useState<SavedPostsFilter>("all");
  const [bannerVisible, setBannerVisible] = useState(true);

  const [whyPost, setWhyPost] = useState<ViralPost | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [remakeBusy, setRemakeBusy] = useState(false);
  const [hiddenCreatorKeys, setHiddenCreatorKeys] = useState<Set<string>>(
    () => new Set()
  );

  const utils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const { startRemake, RemakeDialogs } = useLibraryRemakeChain();

  const [feed, setFeed] = useState<{
    items: ViralPost[];
    generatedAt: string;
    fromCache: boolean;
    status: string;
    errorMessage?: string | null;
    poolRefreshStarted?: boolean;
  } | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const ensureFeed = trpc.viralPosts.getDailyFeed.useMutation({
    onSuccess: (data) => {
      setFeed({
        items: data.items,
        generatedAt: data.generatedAt,
        fromCache: data.fromCache,
        status: data.status,
        errorMessage: data.errorMessage,
        poolRefreshStarted: data.poolRefreshStarted,
      });
      setFeedError(
        data.status === "error" ? data.errorMessage || "Feed unavailable" : null
      );
    },
    onError: (err) => {
      setFeedError(err.message || "Could not load feed");
    },
  });

  const historyQuery = trpc.viralPosts.getFeedHistory.useInfiniteQuery(
    {
      excludeLocalDate: localDate,
      limit: 5,
    },
    {
      enabled: tab === "for-you",
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      staleTime: 60_000,
    }
  );

  const historyFeeds = useMemo((): ViralDailyFeedResponse[] => {
    return historyQuery.data?.pages.flatMap((p) => p.feeds) ?? [];
  }, [historyQuery.data]);

  const loadFeed = useCallback(() => {
    setFeedLoading(true);
    setFeedError(null);
    ensureFeed.mutate(
      { timezone, localDate },
      { onSettled: () => setFeedLoading(false) }
    );
  }, [ensureFeed, timezone, localDate]);

  useEffect(() => {
    if (tab === "for-you") loadFeed();
    // intentionally once per tab/date
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, localDate, timezone]);

  // Explore: debounce submitted query; changing key cancels stale React Query fetches
  const [exploreSubmitted, setExploreSubmitted] = useState("");
  const [exploreDebounceMs] = useState(400);
  useEffect(() => {
    const q = exploreQuery.trim();
    if (q.length < 3) {
      setExploreSubmitted("");
      return;
    }
    const t = window.setTimeout(() => setExploreSubmitted(q), exploreDebounceMs);
    return () => window.clearTimeout(t);
  }, [exploreQuery, exploreDebounceMs]);

  const searchQuery = trpc.viralPosts.search.useQuery(
    {
      query: exploreSubmitted,
    },
    {
      enabled: tab === "explore" && exploreSubmitted.trim().length >= 3,
      staleTime: 60_000,
    }
  );

  const savedQuery = trpc.viralPosts.getSaved.useQuery(undefined, {
    enabled: tab === "saved",
    staleTime: 30_000,
  });

  const saveMutation = trpc.viralPosts.save.useMutation({
    onError: (err) => toast.error(err.message || "Could not save"),
  });
  const unsaveMutation = trpc.viralPosts.unsave.useMutation({
    onError: (err) => toast.error(err.message || "Could not unsave"),
  });
  const feedbackMutation = trpc.viralPosts.feedback.useMutation();
  const hideMutation = trpc.viralPosts.hideCreator.useMutation();

  const setTab = useCallback(
    (next: ViralPostsTab) => {
      setLocation(`/viral-posts?tab=${next}`, { replace: true });
    },
    [setLocation]
  );

  const dailyPosts = useMemo(
    () => filterVisiblePosts(feed?.items ?? [], hiddenCreatorKeys),
    [feed?.items, hiddenCreatorKeys]
  );

  const explorePosts = useMemo(
    () =>
      applyExplorePostFilters({
        posts: searchQuery.data?.items ?? [],
        platforms: exploreFilters.platforms,
        postedWithin: exploreFilters.postedWithin,
        quickFilter: exploreQuick,
        hiddenCreatorKeys,
      }),
    [
      searchQuery.data?.items,
      exploreFilters.platforms,
      exploreFilters.postedWithin,
      exploreQuick,
      hiddenCreatorKeys,
    ]
  );
  const exploreEmpty = exploreEmptyCopy({
    platforms: exploreFilters.platforms,
    usingSearch: exploreSubmitted.trim().length >= 3,
    rawResultCount: searchQuery.data?.items.length ?? 0,
    quickFilter: exploreQuick,
  });

  const exploreSearching =
    tab === "explore" &&
    exploreSubmitted.trim().length >= 3 &&
    searchQuery.isFetching &&
    explorePosts.length === 0;

  const savedPosts = useMemo(() => {
    let items = savedQuery.data?.items ?? [];
    items = items.filter((p) => {
      const key = (p.creatorId || p.creatorHandle || "")
        .toLowerCase()
        .replace(/^@/, "");
      return !key || !hiddenCreatorKeys.has(key);
    });
    if (savedFilter === "remade") items = items.filter((p) => p.remade);
    if (savedFilter === "unused") items = items.filter((p) => !p.remade);
    return items;
  }, [savedQuery.data?.items, savedFilter, hiddenCreatorKeys]);

  const patchHistoryItems = useCallback(
    (updater: (items: ViralPost[]) => ViralPost[]) => {
      utils.viralPosts.getFeedHistory.setInfiniteData(
        { excludeLocalDate: localDate, limit: 5 },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              feeds: page.feeds.map((day) => ({
                ...day,
                items: updater(day.items),
              })),
            })),
          };
        }
      );
    },
    [utils.viralPosts.getFeedHistory, localDate]
  );

  const patchFeedSaved = useCallback(
    (postId: string, saved: boolean) => {
      setFeed((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((p) =>
                p.id === postId ? { ...p, saved } : p
              ),
            }
          : prev
      );
      patchHistoryItems((items) =>
        items.map((p) => (p.id === postId ? { ...p, saved } : p))
      );
    },
    [patchHistoryItems]
  );

  const removeFromFeed = useCallback(
    (postId: string) => {
      setFeed((prev) =>
        prev
          ? { ...prev, items: prev.items.filter((p) => p.id !== postId) }
          : prev
      );
      patchHistoryItems((items) => items.filter((p) => p.id !== postId));
    },
    [patchHistoryItems]
  );

  const handleToggleSave = useCallback(
    async (post: ViralPost) => {
      const prev = post.saved;
      const next = !prev;
      patchFeedSaved(post.id, next);
      try {
        if (prev) {
          await unsaveMutation.mutateAsync({ postId: post.id });
          toast.message("Removed from saved");
        } else {
          await saveMutation.mutateAsync({ postId: post.id });
          toast.success("Saved");
        }
        await utils.viralPosts.getSaved.invalidate();
      } catch {
        patchFeedSaved(post.id, prev);
      }
    },
    [patchFeedSaved, saveMutation, unsaveMutation, utils]
  );

  const handleMoreLikeThis = useCallback(
    async (post: ViralPost) => {
      try {
        await feedbackMutation.mutateAsync({
          postId: post.id,
          feedbackType: "more_like_this",
        });
        toast.success("We'll show more posts like this");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save feedback");
      }
    },
    [feedbackMutation]
  );

  const handleNotRelevant = useCallback(
    async (post: ViralPost) => {
      removeFromFeed(post.id);
      try {
        await feedbackMutation.mutateAsync({
          postId: post.id,
          feedbackType: "not_relevant",
        });
        toast.success("Recommendation feedback saved");
        await utils.viralPosts.search.invalidate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save feedback");
        loadFeed();
      }
    },
    [feedbackMutation, utils, removeFromFeed, loadFeed]
  );

  const handleHideCreator = useCallback(
    async (post: ViralPost) => {
      const key = (post.creatorId || post.creatorHandle || "")
        .toLowerCase()
        .replace(/^@/, "");
      const prevHidden = hiddenCreatorKeys;
      if (key) {
        setHiddenCreatorKeys((prev) => new Set(prev).add(key));
      }
      try {
        const res = await hideMutation.mutateAsync({ postId: post.id });
        setHiddenCreatorKeys((prev) => new Set(prev).add(res.creatorKey));
        toast.success("Creator hidden from recommendations");
        await utils.viralPosts.search.invalidate();
        await utils.viralPosts.getSaved.invalidate();
        await utils.viralPosts.getFeedHistory.invalidate();
      } catch (err) {
        setHiddenCreatorKeys(prevHidden);
        toast.error(err instanceof Error ? err.message : "Could not hide creator");
      }
    },
    [hideMutation, hiddenCreatorKeys, utils]
  );

  const openRemake = useCallback(
    async (post: ViralPost) => {
      const url = (post.sourceUrl || "").trim();
      if (!url) {
        toast.error("This post has no source URL to remake.");
        return;
      }
      if (remakeBusy) return;
      setRemakeBusy(true);
      const toastId = toast.loading("Adding to Collected Reels, then starting remake…");
      try {
        await ingestUrlAndStartLibraryRemake(url, {
          addByUrl: (pasteUrl) => addByUrlMutation.mutateAsync({ url: pasteUrl }),
          fetchCollectedList: () => utils.collected.list.fetch(),
          startRemake,
        });
        toast.success("Remake started", { id: toastId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Remake failed. Try again.", {
          id: toastId,
        });
      } finally {
        setRemakeBusy(false);
      }
    },
    [addByUrlMutation, remakeBusy, startRemake, utils.collected.list]
  );

  const openWhy = useCallback((post: ViralPost) => {
    setWhyPost(post);
    setWhyOpen(true);
  }, []);

  const cardHandlers = {
    onRemake: (post: ViralPost) => void openRemake(post),
    onToggleSave: (post: ViralPost) => void handleToggleSave(post),
    onWhyItWorks: openWhy,
    onMoreLikeThis: (post: ViralPost) => void handleMoreLikeThis(post),
    onNotRelevant: (post: ViralPost) => void handleNotRelevant(post),
    onHideCreator: (post: ViralPost) => void handleHideCreator(post),
  };

  const runExploreSearch = (q?: string) => {
    const next = (q ?? exploreQuery).trim();
    setExploreQuery(next);
    setExploreSubmitted(next);
  };

  useEffect(() => {
    if (tab === "explore" && !exploreSubmitted) {
      // no-op until user searches
    }
  }, [tab, exploreSubmitted]);

  const feedUpdatedToday =
    feed?.generatedAt != null &&
    localDateString(new Date(feed.generatedAt)) === localDate;

  const displayFeedError = feedError;

  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-6" data-testid="viral-posts-page">
      <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Flame className="h-5 w-5 text-[#9b6cff]" aria-hidden />
            <h1 className="text-2xl font-extrabold tracking-tight text-[#f6f4fb]">
              Viral Posts
            </h1>
          </div>
          <p className="max-w-xl text-sm text-[#a9a4b8]">
            Fresh Instagram Reels selected for your niche.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-[#2b2739] bg-[#171522] text-[#f6f4fb] hover:bg-[#1d1a2a]"
          onClick={() => setAdjustOpen(true)}
        >
          <Zap className="mr-1.5 h-4 w-4 text-[#9b6cff]" />
          Adjust recommendations
        </Button>
      </header>

      <div
        role="tablist"
        className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-[#2b2739] bg-[#111019] p-1"
      >
        {(
          [
            ["for-you", "For You"],
            ["explore", "Explore"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold text-[#a9a4b8] hover:text-white",
              tab === id && "bg-white/[0.08] text-white"
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "for-you" ? (
        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[22px] font-extrabold text-[#f6f4fb]">
                {feedLoading
                  ? "Finding fresh posts for you"
                  : `${dailyPosts.length} fresh posts for you today`}
              </h2>
              <p className="text-sm text-[#a9a4b8]">
                Based on your audience, content pillars, and previous activity.
              </p>
            </div>
            {feedUpdatedToday ? (
              <span className="inline-flex items-center gap-1.5 py-1.5 text-xs font-bold text-[#bff8e4]">
                ✓ Updated today
              </span>
            ) : null}
          </div>

          {bannerVisible && dailyPosts.length > 0 && feed && !feed.fromCache ? (
            <div className="mb-[18px] flex items-center justify-between gap-3 rounded-[11px] border border-[#2b2739] bg-[#171522] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 text-sm text-[#a9a4b8]">
                <span className="h-2 w-2 rounded-full bg-[#38d39f]" aria-hidden />
                {dailyPosts.length} new matches added today.
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="text-lg leading-none text-[#7e788d] hover:text-white"
                onClick={() => setBannerVisible(false)}
              >
                ×
              </button>
            </div>
          ) : null}

          {feed?.status === "refreshing" && !feedLoading ? (
            <div className="mb-[18px] flex flex-col gap-3 rounded-[11px] border border-[#3a3550] bg-[#171522] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[#a9a4b8]">
                {dailyPosts.length > 0
                  ? "Showing the best matches we have while we refresh your niche pool."
                  : feed.errorMessage ||
                    "Refreshing your niche pool for stronger matches. You can keep using the page."}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[#2b2739] bg-transparent text-[#f6f4fb]"
                onClick={() => loadFeed()}
              >
                Check again
              </Button>
            </div>
          ) : null}

          {displayFeedError && !feedLoading ? (
            <div className="mb-4 rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-10 text-center">
              <h3 className="text-lg font-bold text-[#f6f4fb]">
                We couldn't load your feed
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
                {displayFeedError}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  onClick={() => loadFeed()}
                >
                  Try again
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#2b2739] bg-transparent text-[#f6f4fb]"
                  onClick={() => setAdjustOpen(true)}
                >
                  Adjust recommendations
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#2b2739] bg-transparent text-[#f6f4fb]"
                  onClick={() => setTab("explore")}
                >
                  Explore Instagram posts
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="mb-3 text-base font-bold text-[#f6f4fb]">
                Generated on {formatFeedLocalDate(localDate)}
              </h3>
              <ViralPostGrid
                posts={dailyPosts}
                loading={feedLoading}
                emptyTitle="We couldn't find enough strong matches yet."
                emptyDescription="Try adjusting recommendations or explore Instagram posts."
                {...cardHandlers}
              />
            </div>
          )}

          {historyFeeds.map((day) => {
            const posts = filterVisiblePosts(day.items, hiddenCreatorKeys);
            if (posts.length === 0 && day.status !== "error") return null;
            return (
              <div key={day.feedId} className="mt-10">
                <h3 className="mb-3 text-base font-bold text-[#f6f4fb]">
                  Generated on {formatFeedLocalDate(day.localDate)}
                </h3>
                <ViralPostGrid
                  posts={posts}
                  loading={false}
                  emptyTitle="No posts from this day."
                  emptyDescription="Earlier recommendations for this date are empty."
                  {...cardHandlers}
                />
              </div>
            );
          })}

          {historyQuery.isFetchingNextPage ||
          (historyQuery.isLoading && historyFeeds.length === 0) ? (
            <div className="mt-6 flex justify-center py-4 text-sm text-[#a9a4b8]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading earlier feeds
            </div>
          ) : null}

          {historyQuery.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="border-[#2b2739] bg-[#171522] text-[#f6f4fb] hover:bg-[#1d1a2a]"
                disabled={historyQuery.isFetchingNextPage}
                onClick={() => void historyQuery.fetchNextPage()}
              >
                {historyQuery.isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading
                  </>
                ) : (
                  "Load earlier feeds"
                )}
              </Button>
            </div>
          ) : null}

          {!feedLoading && dailyPosts.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-10 text-center">
              <h3 className="text-lg font-bold text-[#f6f4fb]">
                You've seen today's best matches
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
                Explore more Instagram Reels when you want more options.
              </p>
              <Button
                type="button"
                className="mt-4 bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                onClick={() => setTab("explore")}
              >
                Explore more posts
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "explore" ? (
        <section>
          <div className="mb-5">
            <h2 className="text-[22px] font-extrabold text-[#f6f4fb]">
              Explore viral posts
            </h2>
            <p className="mt-1 text-sm text-[#a9a4b8]">
              Search Instagram Reels by topic. TikTok and YouTube appear in For
              You from niche seed creators.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                value={exploreQuery}
                onChange={(e) => setExploreQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runExploreSearch();
                }}
                placeholder="Search a topic, creator, or competitor"
                disabled={exploreSearching}
                className="h-11 border-[#2b2739] bg-[#171522] text-[#f6f4fb]"
              />
              <Button
                type="button"
                className="h-11 shrink-0 bg-[#7c3aed] px-5 text-white hover:bg-[#6d28d9]"
                onClick={() => runExploreSearch()}
                disabled={exploreSearching || exploreQuery.trim().length < 3}
              >
                {exploreSearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching
                  </>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXPLORE_SUGGESTED_SEARCHES.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="rounded-full border border-[#2b2739] bg-[#111019] px-3 py-1.5 text-xs font-bold text-[#a9a4b8] hover:border-[rgba(155,108,255,.4)] hover:text-white"
                  onClick={() => runExploreSearch(chip.query)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-bold text-[#f6f4fb]">
              {exploreSubmitted.trim()
                ? `Instagram results for "${exploreSubmitted.trim()}"`
                : "Search Instagram to explore"}
            </h3>
            <ViralPostFilters
              quickFilter={exploreQuick}
              onQuickFilterChange={setExploreQuick}
              filters={exploreFilters}
              onFiltersChange={setExploreFilters}
              onApply={() => {
                toast.success("Filters applied");
              }}
              onReset={() => {
                setExploreFilters(DEFAULT_EXPLORE_FILTERS);
                setExploreQuick("all");
                toast.message("Filters cleared");
              }}
            />
          </div>

          {!exploreSubmitted ? (
            <div className="rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-14 text-center">
              <h3 className="text-lg font-bold text-[#f6f4fb]">
                Search Instagram Reels
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
                Enter a topic or use a suggested search. Results use live
                Instagram discovery.
              </p>
            </div>
          ) : searchQuery.error ? (
            <div className="rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-14 text-center">
              <h3 className="text-lg font-bold text-[#f6f4fb]">Search failed</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
                {searchQuery.error.message}
              </p>
              <Button
                type="button"
                className="mt-4 bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                onClick={() => void searchQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : exploreSearching ? (
            <ExploreSearchLoading query={exploreSubmitted} />
          ) : (
            <ViralPostGrid
              posts={explorePosts}
              loading={false}
              emptyTitle={exploreEmpty.title}
              emptyDescription={exploreEmpty.description}
              {...cardHandlers}
            />
          )}
        </section>
      ) : null}

      {tab === "saved" ? (
        <section>
          <div className="mb-3">
            <h2 className="text-[22px] font-extrabold text-[#f6f4fb]">
              Saved posts
            </h2>
            <p className="text-sm text-[#a9a4b8]">
              Keep promising ideas until you are ready to remake them.
            </p>
          </div>
          <SavedPostFilters value={savedFilter} onChange={setSavedFilter} />
          <ViralPostGrid
            posts={savedPosts}
            loading={savedQuery.isLoading}
            emptyTitle={
              savedFilter === "remade"
                ? "No remade posts yet"
                : savedFilter === "unused"
                  ? "No posts matching filters"
                  : "No saved posts yet"
            }
            emptyDescription={
              savedFilter === "all"
                ? "Save a post from For You or Explore and it will appear here."
                : "Try another saved filter."
            }
            {...cardHandlers}
          />
        </section>
      ) : null}

      <WhyItWorksModal
        open={whyOpen}
        onOpenChange={setWhyOpen}
        post={whyPost}
        onRemake={(post) => void openRemake(post)}
      />
      <RemakeHowSpyReelsWritesDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
      />
      {RemakeDialogs}
    </div>
  );
}
