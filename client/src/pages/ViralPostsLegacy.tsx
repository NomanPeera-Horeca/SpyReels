import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { Loader2 } from "lucide-react";
import { RemakeHowSpyReelsWritesDialog } from "@/components/RemakeHowSpyReelsWritesDialog";
import { ViralPostGrid } from "@/components/viral-posts/ViralPostGrid";
import { ViralPostDetailsDrawer } from "@/components/viral-posts/ViralPostDetailsDrawer";
import { PrimaryButton, SecondaryButton } from "@/design-system/core";
import { useTheme } from "@/contexts/ThemeContext";
import vp from "@/components/viral-posts/viralPosts.module.css";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { buildRemakeIntentMedia } from "@/lib/remakeIntent";
import { navigateAfterScrapeStart } from "@/lib/scrapeNavigation";
import {
  findOpenableCreatorJob,
  normalizeCreatorHandle,
  pathForCreatorResearchJob,
} from "@/lib/openCreatorInApp";
import { browserTimezone, formatFeedLocalDate, localDateString } from "@/lib/viralPosts/format";
import type { ViralPost, ViralPostsTab } from "@/lib/viralPosts/types";
import type { ViralDailyFeedResponse } from "@shared/viralPosts";
import { isViralPostsV1Platform } from "@shared/viralPosts";
import {
  invalidateViralPostsSaveQueries,
  patchSavedFlagInPosts,
} from "@/lib/viralPosts/savedState";

function filterVisiblePosts(
  items: ViralPost[],
  hiddenCreatorKeys: Set<string>
): ViralPost[] {
  return items.filter((p) => {
    if (!isViralPostsV1Platform(p.platform)) return false;
    const key = (p.creatorId || p.creatorHandle || "")
      .toLowerCase()
      .replace(/^@/, "");
    return !key || !hiddenCreatorKeys.has(key);
  });
}

export default function ViralPosts() {
  const [, setLocation] = useLocation();
  const { resolvedTheme } = useTheme();
  // Explore and Saved were dropped (Nov 2026): Viral Posts is For You only.
  // Saved posts live in Saved Reels; Search comes back once it is rebuilt.
  const tab: ViralPostsTab = "for-you";

  const timezone = useMemo(() => browserTimezone(), []);
  const localDate = useMemo(() => localDateString(), []);

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
  const libraryRoute = trpc.recreate.libraryRoute.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [creatorOpenBusy, setCreatorOpenBusy] = useState(false);

  const startInstagramScrape = trpc.scrape.start.useMutation({
    onSuccess: (data) => {
      navigateAfterScrapeStart(data, setLocation, "viral-posts");
    },
  });
  const startTikTokScrape = trpc.tiktokScrape.start.useMutation({
    onSuccess: (data) => {
      setLocation(
        `/tiktok-scraping?jobId=${data.jobId}&from=viral-posts`
      );
    },
  });
  const startYouTubeScrape = trpc.youtubeScrape.start.useMutation({
    onSuccess: (data) => {
      setLocation(
        `/youtube-scraping?jobId=${data.jobId}&from=viral-posts`
      );
    },
  });

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

  const saveMutation = trpc.viralPosts.save.useMutation({
    onError: (err) => toast.error(err.message || "Could not save"),
  });
  const unsaveMutation = trpc.viralPosts.unsave.useMutation({
    onError: (err) => toast.error(err.message || "Could not unsave"),
  });
  const feedbackMutation = trpc.viralPosts.feedback.useMutation();
  const hideMutation = trpc.viralPosts.hideCreator.useMutation();

  const dailyPosts = useMemo(
    () => filterVisiblePosts(feed?.items ?? [], hiddenCreatorKeys),
    [feed?.items, hiddenCreatorKeys]
  );

  const fallbackFeed = useMemo(
    () =>
      historyFeeds.find(
        (day) => filterVisiblePosts(day.items, hiddenCreatorKeys).length > 0
      ) ?? null,
    [historyFeeds, hiddenCreatorKeys]
  );
  const fallbackPosts = useMemo(
    () =>
      fallbackFeed
        ? filterVisiblePosts(fallbackFeed.items, hiddenCreatorKeys)
        : [],
    [fallbackFeed, hiddenCreatorKeys]
  );
  const usingFallbackFeed =
    !feedLoading &&
    dailyPosts.length === 0 &&
    fallbackPosts.length > 0 &&
    (feed?.status === "refreshing" || feed?.status === "error" || feedError != null);
  const displayedDailyPosts = usingFallbackFeed ? fallbackPosts : dailyPosts;

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
      utils.viralPosts.getSaved.setData(undefined, (old) => {
        if (!old) return old;
        if (!next) {
          return {
            ...old,
            items: old.items.filter((item) => item.id !== post.id),
          };
        }
        const exists = old.items.some((item) => item.id === post.id);
        if (exists) {
          return {
            ...old,
            items: patchSavedFlagInPosts(old.items, post.id, true),
          };
        }
        return { ...old, items: [{ ...post, saved: true }, ...old.items] };
      });
      utils.viralPosts.browse.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: patchSavedFlagInPosts(old.items, post.id, next),
        };
      });
      try {
        if (prev) {
          await unsaveMutation.mutateAsync({ postId: post.id });
          toast.message("Removed from saved");
        } else {
          await saveMutation.mutateAsync({ postId: post.id });
          toast.success("Saved");
        }
        await invalidateViralPostsSaveQueries(utils.viralPosts);
      } catch {
        patchFeedSaved(post.id, prev);
        await invalidateViralPostsSaveQueries(utils.viralPosts);
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
        await Promise.all([
          utils.viralPosts.search.invalidate(),
          utils.viralPosts.browse.invalidate(),
        ]);
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
        await Promise.all([
          utils.viralPosts.search.invalidate(),
          utils.viralPosts.browse.invalidate(),
          utils.viralPosts.getSaved.invalidate(),
        ]);
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
      // Library route: the remake popup opens at once, so no "adding" toast.
      const libraryId =
        libraryRoute.data?.enabled && /^\d+$/.test(post.id) ? Number(post.id) : null;
      const toastId =
        libraryId == null ? toast.loading("Adding to Collected Reels, then starting remake…") : undefined;
      try {
        await ingestUrlAndStartLibraryRemake(url, {
          resolveLibraryCandidateId: async () => libraryId,
          addByUrl: (pasteUrl) => addByUrlMutation.mutateAsync({ url: pasteUrl }),
          fetchCollectedList: () => utils.collected.list.fetch(),
          startRemake,
          media: buildRemakeIntentMedia({
            thumbnailUrl: post.thumbnailUrl,
            videoUrl: post.videoUrl,
            reelId: post.reelId,
            platform: post.platform,
            sourceUrl: post.sourceUrl,
          }),
        });
        if (toastId != null) toast.dismiss(toastId);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Remake failed. Try again.",
          toastId != null ? { id: toastId } : undefined
        );
      } finally {
        setRemakeBusy(false);
      }
    },
    [addByUrlMutation, libraryRoute.data?.enabled, remakeBusy, startRemake, utils.collected.list]
  );

  const openWhy = useCallback((post: ViralPost) => {
    setWhyPost(post);
    setWhyOpen(true);
  }, []);

  const openCreator = useCallback(
    async (post: ViralPost) => {
      const handle = normalizeCreatorHandle(post.creatorHandle || post.creatorName);
      if (!handle) {
        toast.error("This post has no creator handle to open.");
        return;
      }
      if (creatorOpenBusy) return;
      setCreatorOpenBusy(true);
      const toastId = toast.loading(`Opening @${handle} in SpyReels…`);
      try {
        if (post.platform === "instagram") {
          const jobs = await utils.scrape.list.fetch();
          const existing = findOpenableCreatorJob(jobs, handle);
          if (existing) {
            setLocation(
              pathForCreatorResearchJob(
                { id: existing.id, platform: "instagram" },
                "viral-posts"
              )
            );
            toast.success(`Opened @${handle}`, { id: toastId });
            return;
          }
          try {
            const data = await startInstagramScrape.mutateAsync({
              handle,
              timeframeDays: 30,
            });
            navigateAfterScrapeStart(data, setLocation, "viral-posts");
            toast.success(`Researching @${handle}`, { id: toastId });
          } catch (err) {
            if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
              const refreshed = await utils.scrape.list.fetch();
              const again = findOpenableCreatorJob(refreshed, handle);
              if (again) {
                setLocation(
                  pathForCreatorResearchJob(
                    { id: again.id, platform: "instagram" },
                    "viral-posts"
                  )
                );
                toast.success(`Opened @${handle}`, { id: toastId });
                return;
              }
              setLocation("/history");
              toast.message(err.message, { id: toastId });
              return;
            }
            throw err;
          }
          return;
        }

        if (post.platform === "tiktok") {
          const jobs = await utils.tiktokScrape.list.fetch();
          const existing = findOpenableCreatorJob(
            jobs.map((j) => ({ ...j, platform: "tiktok" as const })),
            handle
          );
          if (existing) {
            setLocation(
              pathForCreatorResearchJob(
                { id: existing.id, platform: "tiktok" },
                "viral-posts"
              )
            );
            toast.success(`Opened @${handle}`, { id: toastId });
            return;
          }
          const data = await startTikTokScrape.mutateAsync({
            handle,
            timeframe: "30",
          });
          setLocation(`/tiktok-scraping?jobId=${data.jobId}&from=viral-posts`);
          toast.success(`Researching @${handle}`, { id: toastId });
          return;
        }

        const ytJobs = await utils.youtubeScrape.list.fetch();
        const existingYt = findOpenableCreatorJob(
          ytJobs.map((j) => ({ ...j, platform: "youtube" as const })),
          handle
        );
        if (existingYt) {
          setLocation(
            pathForCreatorResearchJob(
              { id: existingYt.id, platform: "youtube" },
              "viral-posts"
            )
          );
          toast.success(`Opened @${handle}`, { id: toastId });
          return;
        }
        const data = await startYouTubeScrape.mutateAsync({
          handle,
          timeframe: "30",
        });
        setLocation(`/youtube-scraping?jobId=${data.jobId}&from=viral-posts`);
        toast.success(`Researching @${handle}`, { id: toastId });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not open creator.",
          { id: toastId }
        );
      } finally {
        setCreatorOpenBusy(false);
      }
    },
    [
      creatorOpenBusy,
      setLocation,
      startInstagramScrape,
      startTikTokScrape,
      startYouTubeScrape,
      utils.scrape.list,
      utils.tiktokScrape.list,
      utils.youtubeScrape.list,
    ]
  );

  const cardHandlers = {
    onRemake: (post: ViralPost) => void openRemake(post),
    onToggleSave: (post: ViralPost) => void handleToggleSave(post),
    onWhyItWorks: openWhy,
    onOpenCreator: (post: ViralPost) => void openCreator(post),
    onMoreLikeThis: (post: ViralPost) => void handleMoreLikeThis(post),
    onNotRelevant: (post: ViralPost) => void handleNotRelevant(post),
    onHideCreator: (post: ViralPost) => void handleHideCreator(post),
  };


  const feedUpdatedToday =
    feed?.status === "ready" &&
    dailyPosts.length > 0 &&
    feed.generatedAt != null &&
    localDateString(new Date(feed.generatedAt)) === localDate;

  const displayFeedError = usingFallbackFeed ? null : feedError;

  const themeScope = resolvedTheme === "dark" ? "sr-scope-dark" : "sr-scope-light";

  return (
    <div className={cn(themeScope, "sr-mode-product", vp.page)} data-testid="viral-posts-page">
      <header className={vp.header}>
        <div>
          <h1 className={vp.title}>Viral Posts</h1>
          <p className={vp.subtitle}>Posts matching your niche</p>
        </div>
        <SecondaryButton type="button" onClick={() => setAdjustOpen(true)}>
          Adjust recommendations
        </SecondaryButton>
      </header>

      {tab === "for-you" ? (
        <section>
          <div className={vp.sectionHead}>
            <div>
              <h2 className={vp.h2}>
                {feedLoading
                  ? "Finding fresh posts for you"
                  : usingFallbackFeed
                    ? `${displayedDailyPosts.length} strong posts for you`
                    : `${dailyPosts.length} fresh posts for you today`}
              </h2>
              <p className={vp.muted}>
                Based on your audience, content pillars, and previous activity.
              </p>
            </div>
            {feedUpdatedToday ? (
              <span className={cn(vp.status, vp.statusGood)}>✓ Updated today</span>
            ) : usingFallbackFeed ? (
              <span className={vp.status}>Fresh picks updating</span>
            ) : null}
          </div>

          {bannerVisible && dailyPosts.length > 0 && feed && !feed.fromCache ? (
            <div className={vp.banner}>
              <div className={vp.bannerText}>
                <span className={vp.dot} aria-hidden />
                {dailyPosts.length} new matches added today.
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className={vp.dismiss}
                onClick={() => setBannerVisible(false)}
              >
                ×
              </button>
            </div>
          ) : null}

          {(feed?.status === "refreshing" || usingFallbackFeed) && !feedLoading ? (
            <div className={vp.notice}>
              <div>
                {usingFallbackFeed
                  ? "Fresh picks are updating. Showing your latest strong matches for now."
                  : dailyPosts.length > 0
                    ? "Showing the best matches we have while we refresh your niche pool."
                    : feed?.errorMessage ||
                      "Refreshing your niche pool for stronger matches. You can keep using the page."}
              </div>
              <SecondaryButton type="button" onClick={() => loadFeed()}>
                Check again
              </SecondaryButton>
            </div>
          ) : null}

          {displayFeedError && !feedLoading ? (
            <div className={vp.state}>
              <h3 className={vp.stateTitle}>We couldn't load your feed</h3>
              <p className={vp.stateText}>{displayFeedError}</p>
              <div className={vp.actionsRow}>
                <PrimaryButton type="button" trailingIcon={false} onClick={() => loadFeed()}>
                  Try again
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => setAdjustOpen(true)}>
                  Adjust recommendations
                </SecondaryButton>
              </div>
            </div>
          ) : (
            <div>
              <h3 className={vp.h3}>
                Generated on {formatFeedLocalDate(usingFallbackFeed && fallbackFeed ? fallbackFeed.localDate : localDate)}
              </h3>
              <ViralPostGrid
                posts={displayedDailyPosts}
                loading={feedLoading}
                emptyTitle="We couldn't find enough strong matches yet."
                emptyDescription="Try adjusting recommendations."
                {...cardHandlers}
              />
            </div>
          )}

          {historyFeeds.map((day) => {
            if (usingFallbackFeed && fallbackFeed?.feedId === day.feedId) return null;
            const posts = filterVisiblePosts(day.items, hiddenCreatorKeys);
            if (posts.length === 0 && day.status !== "error") return null;
            return (
              <div key={day.feedId} className={vp.dayBlock}>
                <h3 className={vp.h3}>Generated on {formatFeedLocalDate(day.localDate)}</h3>
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
            <div className={vp.center}>
              <Loader2 className={cn("h-4 w-4", vp.spin)} />
              Loading earlier feeds
            </div>
          ) : null}

          {historyQuery.hasNextPage ? (
            <div className={vp.center}>
              <SecondaryButton
                type="button"
                disabled={historyQuery.isFetchingNextPage}
                onClick={() => void historyQuery.fetchNextPage()}
              >
                {historyQuery.isFetchingNextPage ? "Loading" : "Load earlier feeds"}
              </SecondaryButton>
            </div>
          ) : null}

          {!feedLoading && displayedDailyPosts.length > 0 ? (
            <div className={cn(vp.state, vp.dayBlock)}>
              <h3 className={vp.stateTitle}>You've seen today's best matches</h3>
              <p className={vp.stateText}>
                New matches arrive every day. Your saved posts are in Saved Reels.
              </p>
              <div className={vp.actionsRow}>
                <SecondaryButton type="button" onClick={() => setLocation("/saved")}>
                  Open Saved Reels
                </SecondaryButton>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <ViralPostDetailsDrawer
        open={whyOpen}
        onOpenChange={setWhyOpen}
        post={whyPost}
        onRemake={(post) => void openRemake(post)}
        onOpenCreator={(post) => void openCreator(post)}
      />
      <RemakeHowSpyReelsWritesDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
      />
      {RemakeDialogs}
    </div>
  );
}
