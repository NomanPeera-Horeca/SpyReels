import { ViralPostCard } from "@/components/viral-posts/ViralPostCard";
import type { ViralPost } from "@/lib/viralPosts/types";

type ViralPostGridProps = {
  posts: ViralPost[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRemake: (post: ViralPost) => void;
  onToggleSave: (post: ViralPost) => void;
  onWhyItWorks: (post: ViralPost) => void;
  onMoreLikeThis: (post: ViralPost) => void;
  onNotRelevant: (post: ViralPost) => void;
  onHideCreator: (post: ViralPost) => void;
};

/**
 * Old Today/For You feeds are persisted, so changing the pool rules does not
 * rewrite yesterday's rows. Apply a final presentation guard only to automatic
 * daily-feed posts (`shownAt` is set by feed assembly). Explicit Explore/Search
 * and Saved results are left untouched.
 *
 * This protects the product promise: V1 does not present historical YouTube
 * rows as recommendations, obviously tiny ordinary posts are not labelled
 * "viral", and one creator cannot own the whole grid. A genuinely accelerating
 * early post can still pass the low-view floor when velocity/reach supports it.
 */
function visibleAutomaticFeedPosts(posts: ViralPost[]): ViralPost[] {
  if (!posts.some((post) => Boolean(post.shownAt))) return posts;

  const creatorCounts = new Map<string, number>();
  return posts.filter((post) => {
    if (post.platform === "youtube") return false;

    const views = post.views ?? 0;
    if (views > 0 && views < 1_000) {
      const accelerating =
        post.trendStatus === "breaking-out" || post.trendStatus === "rising-fast";
      const hasVelocityEvidence =
        (post.viewsPerHour ?? 0) >= 100 || (post.reachMultiplier ?? 0) >= 2;
      if (!accelerating || !hasVelocityEvidence) return false;
    }

    const creatorKey = (post.creatorId || post.creatorHandle || "")
      .toLowerCase()
      .replace(/^@/, "");
    if (!creatorKey) return true;
    const count = creatorCounts.get(creatorKey) ?? 0;
    if (count >= 1) return false;
    creatorCounts.set(creatorKey, count + 1);
    return true;
  });
}

function GridCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#1a1821]">
      <div className="relative aspect-[9/14] overflow-hidden bg-[#121018]">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#1d1a2a] via-[#221f30] to-[#171522]" />
      </div>
      <div className="space-y-2.5 p-3">
        <div className="h-8 w-[92%] animate-pulse rounded bg-[#221f30]" />
        <div className="h-3 w-28 animate-pulse rounded bg-[#1d1a2a]" />
        <div className="h-3 w-40 animate-pulse rounded bg-[#1d1a2a]" />
        <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 pt-1">
          <div className="h-9 animate-pulse rounded-[10px] bg-[#171522]" />
          <div className="h-9 w-9 animate-pulse rounded-[10px] bg-[#171522]" />
          <div className="h-9 w-9 animate-pulse rounded-[10px] bg-[#171522]" />
        </div>
      </div>
    </div>
  );
}

export function ViralPostGrid({
  posts,
  loading = false,
  emptyTitle = "No posts yet",
  emptyDescription = "Try a different filter or search.",
  onRemake,
  onToggleSave,
  onWhyItWorks,
  onMoreLikeThis,
  onNotRelevant,
  onHideCreator,
}: ViralPostGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <GridCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const visiblePosts = visibleAutomaticFeedPosts(posts);
  if (!visiblePosts.length) {
    return (
      <div className="rounded-2xl border border-[#2b2739] bg-[#111019] px-6 py-14 text-center">
        <h3 className="text-lg font-bold text-[#f6f4fb]">{emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#a9a4b8]">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visiblePosts.map((post) => (
        <ViralPostCard
          key={post.id}
          post={post}
          onRemake={onRemake}
          onToggleSave={onToggleSave}
          onWhyItWorks={onWhyItWorks}
          onMoreLikeThis={onMoreLikeThis}
          onNotRelevant={onNotRelevant}
          onHideCreator={onHideCreator}
        />
      ))}
    </div>
  );
}
