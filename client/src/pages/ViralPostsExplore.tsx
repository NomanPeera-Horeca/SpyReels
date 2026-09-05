import { useCallback, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Flame, Loader2 } from "lucide-react";
import { ExploreSearchLoading } from "@/components/viral-posts/ExploreSearchLoading";
import { ViralPostFilters } from "@/components/viral-posts/ViralPostFilters";
import { ViralPostGrid } from "@/components/viral-posts/ViralPostGrid";
import { WhyItWorksModal } from "@/components/viral-posts/WhyItWorksModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { EXPLORE_SUGGESTED_SEARCHES } from "@/lib/viralPosts/viralPostsService";
import type {
  ExploreAdvancedFilters,
  ExploreQuickFilter,
  ViralPost,
  ViralPostsTab,
} from "@/lib/viralPosts/types";
import { DEFAULT_EXPLORE_FILTERS } from "@/lib/viralPosts/types";

function creatorKey(post: ViralPost): string {
  return (post.creatorId || post.creatorHandle || "")
    .toLowerCase()
    .replace(/^@/, "");
}

export default function ViralPostsExplore() {
  const [, setLocation] = useLocation();
  const [exploreQuery, setExploreQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<ExploreQuickFilter>("all");
  const [filters, setFilters] = useState<ExploreAdvancedFilters>(
    DEFAULT_EXPLORE_FILTERS
  );
  const [whyPost, setWhyPost] = useState<ViralPost | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [remakeBusy, setRemakeBusy] = useState(false);
  const [hiddenCreatorKeys, setHiddenCreatorKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>(
    {}
  );

  const utils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const { startRemake, RemakeDialogs } = useLibraryRemakeChain();

  const browseQuery = trpc.viralPosts.browse.useQuery(undefined, {
    staleTime: 60_000,
  });

  const searchQuery = trpc.viralPosts.search.useQuery(
    {
      query: submittedQuery,
      rising: quickFilter === "rising",
      proven: quickFilter === "proven",
    },
    {
      enabled: submittedQuery.trim().length >= 3,
      staleTime: 60_000,
    }
  );

  const saveMutation = trpc.viralPosts.save.useMutation();
  const unsaveMutation = trpc.viralPosts.unsave.useMutation();
  const feedbackMutation = trpc.viralPosts.feedback.useMutation();
  const hideMutation = trpc.viralPosts.hideCreator.useMutation();

  const searching =
    submittedQuery.trim().length >= 3 && searchQuery.isFetching;
  const usingSearch = submittedQuery.trim().length >= 3;

  const posts = useMemo(() => {
    const source = usingSearch
      ? searchQuery.data?.items ?? []
      : browseQuery.data?.items ?? [];

    const anyPlatform =
      filters.platforms.instagram ||
      filters.platforms.tiktok ||
      filters.platforms.youtube;

    return source
      .map((post) =>
        savedOverrides[post.id] == null
          ? post
          : { ...post, saved: savedOverrides[post.id] }
      )
      .filter((post) => {
        const key = creatorKey(post);
        if (key && hiddenCreatorKeys.has(key)) return false;

        if (anyPlatform) {
          if (post.platform === "tiktok" && !filters.platforms.tiktok) return false;
          if (post.platform === "youtube" && !filters.platforms.youtube) return false;
          if (
            post.platform !== "tiktok" &&
            post.platform !== "youtube" &&
            !filters.platforms.instagram
          ) {
            return false;
          }
        }

        if (!usingSearch && quickFilter === "rising") {
          return (
            post.trendStatus === "rising-fast" ||
            post.trendStatus === "breaking-out"
          );
        }
        if (!usingSearch && quickFilter === "proven") {
          return post.trendStatus === "proven-format";
        }
        return true;
      });
  }, [
    browseQuery.data?.items,
    searchQuery.data?.items,
    usingSearch,
    filters.platforms.instagram,
    filters.platforms.tiktok,
    filters.platforms.youtube,
    quickFilter,
    hiddenCreatorKeys,
    savedOverrides,
  ]);

  const setTab = useCallback(
    (next: ViralPostsTab) => {
      setLocation(`/viral-posts?tab=${next}`, { replace: true });
    },
    [setLocation]
  );

  const runSearch = useCallback(
    (query?: string) => {
      const next = (query ?? exploreQuery).trim();
      setExploreQuery(next);
      if (next.length >= 3) setSubmittedQuery(next);
    },
    [exploreQuery]
  );

  const clearSearch = useCallback(() => {
    setExploreQuery("");
    setSubmittedQuery("");
  }, []);

  const handleToggleSave = useCallback(
    async (post: ViralPost) => {
      const current = savedOverrides[post.id] ?? post.saved;
      const next = !current;
      setSavedOverrides((prev) => ({ ...prev, [post.id]: next }));
      try {
        if (current) {
          await unsaveMutation.mutateAsync({ postId: post.id });
          toast.message("Removed from saved");
        } else {
          await saveMutation.mutateAsync({ postId: post.id });
          toast.success("Saved");
        }
        await Promise.all([
          utils.viralPosts.browse.invalidate(),
          utils.viralPosts.search.invalidate(),
          utils.viralPosts.getSaved.invalidate(),
        ]);
      } catch (err) {
        setSavedOverrides((prev) => ({ ...prev, [post.id]: current }));
        toast.error(err instanceof Error ? err.message : "Could not update saved post");
      }
    },
    [savedOverrides, saveMutation, unsaveMutation, utils]
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
      try {
        await feedbackMutation.mutateAsync({
          postId: post.id,
          feedbackType: "not_relevant",
        });
        await Promise.all([
          utils.viralPosts.browse.invalidate(),
          utils.viralPosts.search.invalidate(),
        ]);
        toast.success("Recommendation feedback saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save feedback");
      }
    },
    [feedbackMutation, utils]
  );

  const handleHideCreator = useCallback(
    async (post: ViralPost) => {
      const key = creatorKey(post);
      if (key) {
        setHiddenCreatorKeys((prev) => new Set(prev).add(key));
      }
      try {
        const result = await hideMutation.mutateAsync({ postId: post.id });
        setHiddenCreatorKeys((prev) => new Set(prev).add(result.creatorKey));
        await Promise.all([
          utils.viralPosts.browse.invalidate(),
          utils.viralPosts.search.invalidate(),
          utils.viralPosts.getSaved.invalidate(),
        ]);
        toast.success("Creator hidden from recommendations");
      } catch (err) {
        if (key) {
          setHiddenCreatorKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
        toast.error(err instanceof Error ? err.message : "Could not hide creator");
      }
    },
    [hideMutation, utils]
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
      const toastId = toast.loading(
        "Adding to Collected Reels, then starting remake…"
      );
      try {
        await ingestUrlAndStartLibraryRemake(url, {
          addByUrl: (pasteUrl) => addByUrlMutation.mutateAsync({ url: pasteUrl }),
          fetchCollectedList: () => utils.collected.list.fetch(),
          startRemake,
        });
        toast.success("Remake started", { id: toastId });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Remake failed. Try again.",
          { id: toastId }
        );
      } finally {
        setRemakeBusy(false);
      }
    },
    [addByUrlMutation, remakeBusy, startRemake, utils.collected.list]
  );

  const cardHandlers = {
    onRemake: (post: ViralPost) => void openRemake(post),
    onToggleSave: (post: ViralPost) => void handleToggleSave(post),
    onWhyItWorks: (post: ViralPost) => {
      setWhyPost(post);
      setWhyOpen(true);
    },
    onMoreLikeThis: (post: ViralPost) => void handleMoreLikeThis(post),
    onNotRelevant: (post: ViralPost) => void handleNotRelevant(post),
    onHideCreator: (post: ViralPost) => void handleHideCreator(post),
  };

  const browseError = !usingSearch ? browseQuery.error : null;
  const searchError = usingSearch ? searchQuery.error : null;

  return (
    <div
      className="mx-auto max-w-[1400px] p-3 sm:p-6"
      data-testid="viral-posts-explore-page"
    >
      <header className="mb-5 sm:mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Flame className="h-5 w-5 text-[#9b6cff]" aria-hidden />
          <h1 className="text-2xl font-extrabold tracking-tight text-[#f6f4fb]">
            Viral Posts
          </h1>
        </div>
        <p className="max-w-xl text-sm text-[#a9a4b8]">
          Discover proven posts worth studying, saving, and remaking.
        </p>
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
            aria-selected={id === "explore"}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold text-[#a9a4b8] hover:text-white",
              id === "explore" && "bg-white/[0.08] text-white"
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <section>
        <div className="mb-5">
          <h2 className="text-[22px] font-extrabold text-[#f6f4fb]">
            Explore viral posts
          </h2>
          <p className="mt-1 text-sm text-[#a9a4b8]">
            Browse fresh posts from your niche, or search for a topic, creator,
            or competitor.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={exploreQuery}
              onChange={(e) => {
                const next = e.target.value;
                setExploreQuery(next);
                if (next.trim().length < 3 && usingSearch) {
                  setSubmittedQuery("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="Search a topic, creator, or competitor"
              className="h-11 border-[#2b2739] bg-[#171522] text-[#f6f4fb]"
            />
            {usingSearch ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 border-[#2b2739] bg-[#171522] px-5 text-[#f6f4fb]"
                onClick={clearSearch}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              className="h-11 shrink-0 bg-[#7c3aed] px-5 text-white hover:bg-[#6d28d9]"
              onClick={() => runSearch()}
              disabled={exploreQuery.trim().length < 3 || searching}
            >
              {searching ? (
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
                onClick={() => runSearch(chip.query)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-[#f6f4fb]">
              {usingSearch
                ? `Search results for “${submittedQuery.trim()}”`
                : browseQuery.data?.niche
                  ? `Popular in ${browseQuery.data.niche}`
                  : "Popular posts for you"}
            </h3>
            {!usingSearch && browseQuery.data?.poolRefreshStarted ? (
              <p className="mt-1 text-xs text-[#8e899b]">
                Refreshing your niche pool in the background for more options.
              </p>
            ) : null}
          </div>

          <ViralPostFilters
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            filters={filters}
            onFiltersChange={setFilters}
            onApply={() => toast.success("Filters applied")}
            onReset={() => {
              setFilters(DEFAULT_EXPLORE_FILTERS);
              setQuickFilter("all");
              toast.message("Filters cleared");
            }}
          />
        </div>

        {browseError || searchError ? (
          <div className="rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-14 text-center">
            <h3 className="text-lg font-bold text-[#f6f4fb]">
              {usingSearch ? "Search failed" : "We couldn't load Explore"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
              {(searchError || browseError)?.message || "Please try again."}
            </p>
            <Button
              type="button"
              className="mt-4 bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              onClick={() =>
                usingSearch
                  ? void searchQuery.refetch()
                  : void browseQuery.refetch()
              }
            >
              Try again
            </Button>
          </div>
        ) : usingSearch && searching && posts.length === 0 ? (
          <ExploreSearchLoading query={submittedQuery} />
        ) : (
          <ViralPostGrid
            posts={posts}
            loading={!usingSearch && browseQuery.isLoading}
            emptyTitle={
              usingSearch
                ? "No exact matches yet"
                : quickFilter === "all"
                  ? "No browse posts available yet"
                  : "No posts match this filter"
            }
            emptyDescription={
              usingSearch
                ? "Try a broader topic, or clear the search to browse your niche."
                : quickFilter === "all"
                  ? "Your niche pool is refreshing. Try again shortly or search for a topic now."
                  : "Clear Rising / Proven or adjust the platform filters."
            }
            {...cardHandlers}
          />
        )}
      </section>

      <WhyItWorksModal
        open={whyOpen}
        onOpenChange={setWhyOpen}
        post={whyPost}
        onRemake={(post) => void openRemake(post)}
      />
      {RemakeDialogs}
    </div>
  );
}
