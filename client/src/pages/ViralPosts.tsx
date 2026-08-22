import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { Flame, Zap } from "lucide-react";
import { RemakeHowSpyReelsWritesDialog } from "@/components/RemakeHowSpyReelsWritesDialog";
import { RemakeWorkspaceDialog } from "@/components/RemakeWorkspaceDialog";
import { RemakeViralPostModal } from "@/components/viral-posts/RemakeViralPostModal";
import { SavedPostFilters } from "@/components/viral-posts/SavedPostFilters";
import { ViralPostFilters } from "@/components/viral-posts/ViralPostFilters";
import { ViralPostGrid } from "@/components/viral-posts/ViralPostGrid";
import { WhyItWorksModal } from "@/components/viral-posts/WhyItWorksModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EXPLORE_SUGGESTED_SEARCHES } from "@/lib/viralPosts/mockData";
import {
  getBannerDismissed,
  getDailyViralPosts,
  getSavedViralPosts,
  markViralPostRemade,
  removeSavedViralPost,
  saveViralPost,
  searchViralPosts,
  setBannerDismissed,
  submitRecommendationFeedback,
} from "@/lib/viralPosts/viralPostsService";
import type {
  ExploreAdvancedFilters,
  ExploreQuickFilter,
  SavedPostsFilter,
  ViralPost,
  ViralPostsTab,
  ViralRemakePreview,
} from "@/lib/viralPosts/types";
import { DEFAULT_EXPLORE_FILTERS } from "@/lib/viralPosts/types";

function parseTab(raw: string | null): ViralPostsTab {
  if (raw === "explore" || raw === "saved" || raw === "for-you") return raw;
  return "for-you";
}

export default function ViralPosts() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const tab = useMemo(
    () => parseTab(new URLSearchParams(searchString).get("tab")),
    [searchString]
  );

  const [dailyPosts, setDailyPosts] = useState<ViralPost[]>([]);
  const [explorePosts, setExplorePosts] = useState<ViralPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<ViralPost[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);

  const [bannerVisible, setBannerVisible] = useState(
    () => !getBannerDismissed()
  );
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreQuick, setExploreQuick] = useState<ExploreQuickFilter>("all");
  const [exploreFilters, setExploreFilters] = useState<ExploreAdvancedFilters>(
    DEFAULT_EXPLORE_FILTERS
  );
  const [savedFilter, setSavedFilter] = useState<SavedPostsFilter>("all");

  const [whyPost, setWhyPost] = useState<ViralPost | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [remakePost, setRemakePost] = useState<ViralPost | null>(null);
  const [remakeOpen, setRemakeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceSeed, setWorkspaceSeed] = useState<{
    script: string;
    caption: string;
  } | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState("viral-post:none");

  const setTab = useCallback(
    (next: ViralPostsTab) => {
      setLocation(`/viral-posts?tab=${next}`, { replace: true });
    },
    [setLocation]
  );

  const refreshDaily = useCallback(async () => {
    setDailyLoading(true);
    try {
      setDailyPosts(await getDailyViralPosts());
    } finally {
      setDailyLoading(false);
    }
  }, []);

  const refreshExplore = useCallback(async () => {
    setExploreLoading(true);
    try {
      setExplorePosts(
        await searchViralPosts({
          query: exploreQuery,
          quickFilter: exploreQuick,
          filters: exploreFilters,
        })
      );
    } finally {
      setExploreLoading(false);
    }
  }, [exploreFilters, exploreQuery, exploreQuick]);

  const refreshSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      setSavedPosts(await getSavedViralPosts(savedFilter));
    } finally {
      setSavedLoading(false);
    }
  }, [savedFilter]);

  useEffect(() => {
    void refreshDaily();
  }, [refreshDaily]);

  useEffect(() => {
    if (tab === "explore") void refreshExplore();
  }, [tab, refreshExplore]);

  useEffect(() => {
    if (tab === "saved") void refreshSaved();
  }, [tab, refreshSaved]);

  const patchPostEverywhere = useCallback((updated: ViralPost) => {
    const patch = (list: ViralPost[]) =>
      list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
    setDailyPosts(patch);
    setExplorePosts(patch);
    setSavedPosts((list) => {
      if (!updated.saved) return list.filter((p) => p.id !== updated.id);
      const exists = list.some((p) => p.id === updated.id);
      if (!exists) return [...list, updated];
      return patch(list);
    });
  }, []);

  const handleToggleSave = useCallback(
    async (post: ViralPost) => {
      if (post.saved) {
        const updated = await removeSavedViralPost(post.id);
        if (updated) {
          patchPostEverywhere(updated);
          toast.message("Removed from saved");
        }
        if (tab === "saved") void refreshSaved();
        return;
      }
      const updated = await saveViralPost(post.id);
      if (updated) {
        patchPostEverywhere(updated);
        toast.success("Saved to your idea library");
      }
    },
    [patchPostEverywhere, refreshSaved, tab]
  );

  const handleMoreLikeThis = useCallback(async (post: ViralPost) => {
    await submitRecommendationFeedback({
      postId: post.id,
      action: "more-like-this",
    });
    toast.success("We'll show more posts like this");
  }, []);

  const handleNotRelevant = useCallback(async (post: ViralPost) => {
    await submitRecommendationFeedback({
      postId: post.id,
      action: "not-relevant",
    });
    toast.success("Recommendation feedback saved");
  }, []);

  const handleHideCreator = useCallback(
    async (post: ViralPost) => {
      await submitRecommendationFeedback({
        postId: post.id,
        action: "hide-creator",
      });
      toast.success("Creator hidden from recommendations");
      await Promise.all([refreshDaily(), refreshExplore(), refreshSaved()]);
    },
    [refreshDaily, refreshExplore, refreshSaved]
  );

  const openRemake = useCallback((post: ViralPost) => {
    setRemakePost(post);
    setRemakeOpen(true);
  }, []);

  const openWhy = useCallback((post: ViralPost) => {
    setWhyPost(post);
    setWhyOpen(true);
  }, []);

  const openWorkspace = useCallback(
    async (args: { post: ViralPost; preview: ViralRemakePreview }) => {
      await markViralPostRemade(args.post.id);
      patchPostEverywhere({ ...args.post, saved: true, remade: true });
      setRemakeOpen(false);
      setWorkspaceKey(`viral-post:${args.post.id}`);
      setWorkspaceSeed({
        script: args.preview.script,
        caption: args.preview.caption,
      });
      setWorkspaceOpen(true);
      toast.success("Opened in Remake workspace");
      if (tab === "saved") void refreshSaved();
    },
    [patchPostEverywhere, refreshSaved, tab]
  );

  const cardHandlers = {
    onRemake: openRemake,
    onToggleSave: (post: ViralPost) => void handleToggleSave(post),
    onWhyItWorks: openWhy,
    onMoreLikeThis: (post: ViralPost) => void handleMoreLikeThis(post),
    onNotRelevant: (post: ViralPost) => void handleNotRelevant(post),
    onHideCreator: (post: ViralPost) => void handleHideCreator(post),
  };

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
            Fresh Instagram Reels and TikToks selected for your niche.
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
                {dailyLoading
                  ? "Fresh posts for you today"
                  : `${dailyPosts.length} fresh posts for you today`}
              </h2>
              <p className="text-sm text-[#a9a4b8]">
                Based on your audience, content pillars, and previous activity.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 py-1.5 text-xs font-bold text-[#bff8e4]">
              ✓ Updated today
            </span>
          </div>

          {bannerVisible ? (
            <div className="mb-[18px] flex items-center justify-between gap-3 rounded-[11px] border border-[#2b2739] bg-[#171522] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 text-sm text-[#a9a4b8]">
                <span className="h-2 w-2 rounded-full bg-[#38d39f]" aria-hidden />
                {dailyPosts.length || 6} new matches added today.
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="text-lg leading-none text-[#7e788d] hover:text-white"
                onClick={() => {
                  setBannerVisible(false);
                  setBannerDismissed(true);
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          <ViralPostGrid
            posts={dailyPosts}
            loading={dailyLoading}
            emptyTitle="No recommendations yet"
            emptyDescription="Adjust your recommendations or explore viral posts to find ideas."
            {...cardHandlers}
          />

          {!dailyLoading && dailyPosts.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-10 text-center">
              <h3 className="text-lg font-bold text-[#f6f4fb]">
                You've seen today's best matches
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
                Explore more viral posts when you want more options.
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
              Search a topic, creator, or competitor across Instagram Reels and
              TikTok.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                value={exploreQuery}
                onChange={(e) => setExploreQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void refreshExplore();
                }}
                placeholder="Search a topic, creator, or competitor"
                className="h-11 border-[#2b2739] bg-[#171522] text-[#f6f4fb]"
              />
              <Button
                type="button"
                className="h-11 shrink-0 bg-[#7c3aed] px-5 text-white hover:bg-[#6d28d9]"
                onClick={() => void refreshExplore()}
              >
                Search
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXPLORE_SUGGESTED_SEARCHES.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="rounded-full border border-[#2b2739] bg-[#111019] px-3 py-1.5 text-xs font-bold text-[#a9a4b8] hover:border-[rgba(155,108,255,.4)] hover:text-white"
                  onClick={() => {
                    setExploreQuery(chip.query);
                    void searchViralPosts({
                      query: chip.query,
                      quickFilter: exploreQuick,
                      filters: exploreFilters,
                    }).then(setExplorePosts);
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-bold text-[#f6f4fb]">
              {exploreQuery.trim()
                ? `Results for "${exploreQuery.trim()}"`
                : "Trending across your niche"}
            </h3>
            <ViralPostFilters
              quickFilter={exploreQuick}
              onQuickFilterChange={(value) => {
                setExploreQuick(value);
              }}
              filters={exploreFilters}
              onFiltersChange={setExploreFilters}
              onApply={(nextFilters) => {
                setExploreLoading(true);
                void searchViralPosts({
                  query: exploreQuery,
                  quickFilter: exploreQuick,
                  filters: nextFilters,
                })
                  .then(setExplorePosts)
                  .finally(() => setExploreLoading(false));
                toast.success("Filters applied");
              }}
              onReset={() => {
                setExploreFilters(DEFAULT_EXPLORE_FILTERS);
                setExploreQuick("all");
                toast.message("Filters cleared");
                setExploreLoading(true);
                void searchViralPosts({
                  query: exploreQuery,
                  quickFilter: "all",
                  filters: DEFAULT_EXPLORE_FILTERS,
                })
                  .then(setExplorePosts)
                  .finally(() => setExploreLoading(false));
              }}
            />
          </div>

          <ViralPostGrid
            posts={explorePosts}
            loading={exploreLoading}
            emptyTitle="No exact matches yet"
            emptyDescription="Try a broader topic or remove a filter."
            {...cardHandlers}
          />
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
            loading={savedLoading}
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
        onRemake={openRemake}
      />
      <RemakeViralPostModal
        open={remakeOpen}
        onOpenChange={setRemakeOpen}
        post={remakePost}
        onOpenWorkspace={(args) => void openWorkspace(args)}
      />
      <RemakeHowSpyReelsWritesDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
      />
      <RemakeWorkspaceDialog
        open={workspaceOpen}
        onOpenChange={setWorkspaceOpen}
        target={{
          scriptId: null,
          reelId: null,
          remakeKey: workspaceKey,
        }}
        remakeState={{ stage: "ready", progressPercent: 100 }}
        previewSeed={workspaceSeed ?? undefined}
      />
    </div>
  );
}
