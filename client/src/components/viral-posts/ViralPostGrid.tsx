import { ViralPostCard } from "@/components/viral-posts/ViralPostCard";
import { ResultCardSkeleton } from "@/design-system/ResultCard";
import styles from "./viralPosts.module.css";
import type { ViralPost } from "@/lib/viralPosts/types";

type ViralPostGridProps = {
  posts: ViralPost[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRemake: (post: ViralPost) => void;
  onToggleSave: (post: ViralPost) => void;
  onWhyItWorks: (post: ViralPost) => void;
  onOpenCreator: (post: ViralPost) => void;
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

export function ViralPostGrid({
  posts,
  loading = false,
  emptyTitle = "No posts yet",
  emptyDescription = "Try a different filter or search.",
  onRemake,
  onToggleSave,
  onWhyItWorks,
  onOpenCreator,
  onMoreLikeThis,
  onNotRelevant,
  onHideCreator,
}: ViralPostGridProps) {
  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <ResultCardSkeleton key={i} mediaFormat="portrait" />
        ))}
      </div>
    );
  }

  const visiblePosts = visibleAutomaticFeedPosts(posts);
  if (!visiblePosts.length) {
    return (
      <div className={styles.state}>
        <h3 className={styles.stateTitle}>{emptyTitle}</h3>
        <p className={styles.stateText}>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {visiblePosts.map((post) => (
        <ViralPostCard
          key={post.id}
          post={post}
          onRemake={onRemake}
          onToggleSave={onToggleSave}
          onWhyItWorks={onWhyItWorks}
          onOpenCreator={onOpenCreator}
          onMoreLikeThis={onMoreLikeThis}
          onNotRelevant={onNotRelevant}
          onHideCreator={onHideCreator}
        />
      ))}
    </div>
  );
}
