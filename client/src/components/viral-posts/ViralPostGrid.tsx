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

function GridCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#111019]">
      <div className="relative aspect-[9/11.2] overflow-hidden bg-[#171522]">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#1d1a2a] via-[#221f30] to-[#171522]" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute left-2.5 top-2.5 h-5 w-16 animate-pulse rounded-full bg-white/10" />
        <div className="absolute bottom-3 left-3 right-8 space-y-2">
          <div className="h-3 w-[88%] animate-pulse rounded bg-white/20" />
          <div className="h-3 w-[58%] animate-pulse rounded bg-white/15" />
        </div>
      </div>
      <div className="space-y-3 p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-[#221f30]" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 animate-pulse rounded bg-[#221f30]" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-[#1d1a2a]" />
          </div>
        </div>
        <div className="h-8 animate-pulse rounded-md bg-[#171522]" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="h-9 animate-pulse rounded-md bg-[rgba(124,58,237,.22)]" />
          <div className="h-9 w-[72px] animate-pulse rounded-md bg-[#171522]" />
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

  if (!posts.length) {
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
      {posts.map((post) => (
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
