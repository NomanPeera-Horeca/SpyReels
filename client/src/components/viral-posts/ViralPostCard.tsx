import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Star } from "lucide-react";
import { ViralPostPreview } from "@/components/viral-posts/ViralPostPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  formatCompactCount,
  formatCreatorHandle,
  formatEngagementPct,
  formatNicheSignal,
  formatShortPostDate,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";

type ViralPostCardProps = {
  post: ViralPost;
  onRemake: (post: ViralPost) => void;
  onToggleSave: (post: ViralPost) => void;
  onWhyItWorks: (post: ViralPost) => void;
  onOpenCreator: (post: ViralPost) => void;
  onMoreLikeThis: (post: ViralPost) => void;
  onNotRelevant: (post: ViralPost) => void;
  onHideCreator: (post: ViralPost) => void;
};

type NegativeReason =
  | "not_my_niche"
  | "too_few_views"
  | "wrong_content_type"
  | "already_seen";

const NEGATIVE_REASONS: Array<{ type: NegativeReason; label: string }> = [
  { type: "not_my_niche", label: "Not relevant to my niche" },
  { type: "too_few_views", label: "Too few views" },
  { type: "wrong_content_type", label: "Wrong type of content" },
  { type: "already_seen", label: "I've seen ideas like this" },
];

function cardCaption(post: ViralPost): string {
  if (post.hook?.trim()) return post.hook.trim();
  if (post.caption?.trim()) return post.caption.trim();
  return "Viral post in your niche";
}

function cardMetricsLine(post: ViralPost): {
  leading: string[];
  signal: string | null;
  date: string | null;
} {
  const leading: string[] = [];
  const views = formatCompactCount(post.views);
  if (views) leading.push(`${views} views`);
  const eng = formatEngagementPct(post.engagementRate);
  if (eng) leading.push(eng);
  return {
    leading,
    signal: formatNicheSignal(post.reachMultiplier),
    date: formatShortPostDate(post.publishedAt),
  };
}

export function ViralPostCard({
  post,
  onRemake,
  onToggleSave,
  onWhyItWorks,
  onOpenCreator,
  onMoreLikeThis,
  onNotRelevant,
  onHideCreator,
}: ViralPostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const negativeRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const impressionSentRef = useRef(false);
  const signalMutation = trpc.viralPosts.feedback.useMutation();

  const handle = formatCreatorHandle(
    post.creatorHandle || post.creatorName
  );
  const { leading: metricParts, signal, date } = cardMetricsLine(post);
  const caption = cardCaption(post);

  const recordSignal = (
    feedbackType:
      | "post_impression"
      | "remake_started"
      | "open_original"
      | "why_it_works_opened"
      | NegativeReason
  ) => {
    signalMutation.mutate({ postId: post.id, feedbackType });
  };

  useEffect(() => {
    if (!menuOpen && !negativeOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        negativeRef.current?.contains(target) ||
        kebabRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
      setNegativeOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, negativeOpen]);

  useEffect(() => {
    const node = articleRef.current;
    if (!node || impressionSentRef.current) return;

    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!visibleTimer) {
            visibleTimer = setTimeout(() => {
              if (impressionSentRef.current) return;
              impressionSentRef.current = true;
              signalMutation.mutate({
                postId: post.id,
                feedbackType: "post_impression",
              });
            }, 1200);
          }
        } else if (visibleTimer) {
          clearTimeout(visibleTimer);
          visibleTimer = null;
        }
      },
      { threshold: [0.5] }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (visibleTimer) clearTimeout(visibleTimer);
    };
    // One impression per mounted card. The mutation intentionally stays out of
    // deps so React Query object identity cannot restart the visibility timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const openDetails = () => {
    recordSignal("why_it_works_opened");
    onWhyItWorks(post);
  };

  return (
    <article
      ref={articleRef}
      className="workspace-reel-card relative flex h-full flex-col overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#1a1821] shadow-[0_8px_32px_rgba(0,0,0,.28)]"
    >
      <button
        type="button"
        className="block w-full cursor-pointer text-left"
        onClick={openDetails}
        aria-label="View post details"
      >
        <ViralPostPreview post={post} quiet />
      </button>

      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-3">
        <p className="line-clamp-2 min-h-[2.7em] text-[13px] font-semibold leading-snug text-[#f5f3f8]">
          {caption}
        </p>

        <div className="grid gap-1">
          <button
            type="button"
            className="w-fit text-left text-[12px] font-medium text-[#a8a3b3] hover:text-[#f5f3f8] hover:underline"
            title="Open creator in SpyReels"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreator(post);
            }}
          >
            {handle}
          </button>
          {(metricParts.length > 0 || signal || date) && (
            <p className="text-[11px] leading-snug text-[#a8a3b3]">
              {metricParts.join(" · ")}
              {signal ? (
                <>
                  {metricParts.length > 0 ? " · " : null}
                  <span className="font-semibold text-[#e8e4f0]">{signal}</span>
                </>
              ) : null}
              {date ? (
                <>
                  {metricParts.length > 0 || signal ? " · " : null}
                  {date}
                </>
              ) : null}
            </p>
          )}
        </div>

        <div className="mt-auto grid grid-cols-[1fr_auto_auto] gap-1.5 pt-1">
          <Button
            type="button"
            variant="outline"
            className="h-9 border-[#2b2739] bg-transparent px-2.5 text-[11px] font-semibold text-[#e8e2f4] hover:border-[rgba(155,108,255,.45)] hover:bg-[rgba(155,108,255,.08)] hover:text-white"
            onClick={() => {
              recordSignal("remake_started");
              onRemake(post);
            }}
          >
            Remake
          </Button>
          <button
            type="button"
            aria-label={post.saved ? "Remove from saved" : "Save post"}
            title={post.saved ? "Saved" : "Save"}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-[10px] border border-[#2b2739] bg-transparent text-[#a8a3b3] hover:border-[rgba(155,108,255,.4)] hover:text-[#f5f3f8]",
              post.saved && "border-[rgba(155,108,255,.4)] text-[#f5f3f8]"
            )}
            onClick={() => onToggleSave(post)}
          >
            <Star
              className={cn("h-3.5 w-3.5", post.saved && "fill-current")}
            />
          </button>
          <button
            ref={kebabRef}
            type="button"
            aria-label="More options"
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#2b2739] bg-transparent text-[#a8a3b3] hover:border-[rgba(155,108,255,.4)] hover:text-[#f5f3f8]"
            onClick={(e) => {
              e.stopPropagation();
              setNegativeOpen(false);
              setMenuOpen((open) => !open);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {negativeOpen ? (
        <div
          ref={negativeRef}
          className="absolute bottom-14 right-3 z-30 grid min-w-[210px] gap-0.5 rounded-[12px] border border-[#2b2739] bg-[#1d1b24] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.45)]"
        >
          <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#7e788d]">
            What's wrong with this?
          </p>
          {NEGATIVE_REASONS.map((reason) => (
            <button
              key={reason.type}
              type="button"
              className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
              onClick={() => {
                setNegativeOpen(false);
                recordSignal(reason.type);
                onNotRelevant(post);
              }}
            >
              {reason.label}
            </button>
          ))}
        </div>
      ) : null}

      {menuOpen ? (
        <div
          ref={menuRef}
          className="absolute bottom-14 right-3 z-20 grid min-w-[170px] gap-0.5 rounded-[12px] border border-[#2b2739] bg-[#1d1b24] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.45)]"
        >
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#f5f3f8] hover:bg-white/[0.06]"
            onClick={() => {
              setMenuOpen(false);
              openDetails();
            }}
          >
            View details
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              setMenuOpen(false);
              onOpenCreator(post);
            }}
          >
            Open creator
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              setMenuOpen(false);
              onMoreLikeThis(post);
            }}
          >
            More like this
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              setMenuOpen(false);
              setNegativeOpen(true);
            }}
          >
            Not relevant
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-[rgba(255,107,122,.08)] hover:text-[#ffb4bd]"
            onClick={() => {
              setMenuOpen(false);
              onHideCreator(post);
            }}
          >
            Hide creator
          </button>
        </div>
      ) : null}
    </article>
  );
}
