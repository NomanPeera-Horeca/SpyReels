import { ViralPostCard } from "@/components/viral-posts/ViralPostCard";
import { Skeleton } from "@/components/ui/skeleton";
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
          <div
            key={i}
            className="overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#111019]"
          >
            <Skeleton className="aspect-[9/11.2] w-full rounded-none bg-[#171522]" />
            <div className="space-y-3 p-3.5">
              <Skeleton className="h-8 w-2/3 bg-[#171522]" />
              <Skeleton className="h-4 w-full bg-[#171522]" />
              <Skeleton className="h-10 w-full bg-[#171522]" />
            </div>
          </div>
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
