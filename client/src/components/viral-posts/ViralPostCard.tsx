import { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { ViralPostPreview } from "@/components/viral-posts/ViralPostPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  formatCompactCount,
  formatFollowerCount,
  whyFitBody,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";

type ViralPostCardProps = {
  post: ViralPost;
  onRemake: (post: ViralPost) => void;
  onToggleSave: (post: ViralPost) => void;
  onWhyItWorks: (post: ViralPost) => void;
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

export function ViralPostCard({
  post,
  onRemake,
  onToggleSave,
  onWhyItWorks,
  onMoreLikeThis,
  onNotRelevant,
  onHideCreator,
}: ViralPostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const negativeRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const impressionSentRef = useRef(false);
  const signalMutation = trpc.viralPosts.feedback.useMutation();
  const followers = formatFollowerCount(post.creatorFollowers);
  const views = formatCompactCount(post.views);
  const comments = formatCompactCount(post.comments);
  const shares = formatCompactCount(post.shares);

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
        kebabRef.current?.contains(target) ||
        downRef.current?.contains(target)
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

  return (
    <article
      ref={articleRef}
      className="relative overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#111019] shadow-[0_18px_50px_rgba(0,0,0,.28)]"
    >
      <ViralPostPreview post={post} />

      <div className="px-3.5 pb-3.5 pt-3">
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {post.creatorAvatarUrl ? (
              <img
                src={post.creatorAvatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#9b6cff]" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-bold text-[#f6f4fb]">
                {post.creatorHandle || post.creatorName}
              </p>
              {followers ? (
                <p className="truncate text-[11px] text-[#a9a4b8]">{followers}</p>
              ) : null}
            </div>
          </div>
          <span className="hidden max-w-[150px] truncate rounded-full border border-[rgba(155,108,255,.22)] bg-[rgba(124,58,237,.12)] px-2 py-1 text-[10px] font-extrabold text-[#ddceff] sm:inline-flex">
            {post.relevanceLabel}
          </span>
        </div>

        {(views || comments || shares) && (
          <div className="mb-2.5 flex items-center justify-between gap-2 border-y border-white/[0.08] py-2 text-[11px] text-[#a9a4b8]">
            {views ? (
              <span>
                <strong className="text-[#f6f4fb]">{views}</strong> views
              </span>
            ) : (
              <span>Views unavailable</span>
            )}
            {comments ? <span>{comments} comments</span> : <span />}
            {shares ? <span>{shares} shares</span> : <span />}
          </div>
        )}

        <p className="mb-2.5 line-clamp-2 min-h-[38px] text-[12px] leading-snug text-[#a9a4b8]">
          <span className="font-extrabold text-white">Why it fits: </span>
          {whyFitBody(post.relevanceReason)}
        </p>

        {post.sourceUrl ? (
          <a
            href={post.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-2.5 inline-block text-[11px] font-semibold text-[#9b6cff] hover:underline"
            onClick={() => recordSignal("open_original")}
          >
            {post.platform === "tiktok"
              ? "Open on TikTok"
              : post.platform === "youtube"
                ? "Open on YouTube"
                : "Open on Instagram"}
          </a>
        ) : null}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            type="button"
            className="h-[39px] bg-[#7c3aed] font-bold text-white hover:bg-[#6d28d9]"
            onClick={() => {
              recordSignal("remake_started");
              onRemake(post);
            }}
          >
            Remake
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-[39px] min-w-[72px] border-[#2b2739] bg-[#171522] px-3 text-xs font-bold text-[#f6f4fb] hover:bg-[#1d1a2a]",
              post.saved &&
                "border-[rgba(155,108,255,.45)] bg-[rgba(124,58,237,.15)] text-[#ddceff]"
            )}
            onClick={() => onToggleSave(post)}
          >
            {post.saved ? "Saved" : "Save"}
          </Button>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2.5">
          <button
            type="button"
            className="px-0 py-0.5 text-[11.5px] font-semibold text-[#a9a4b8] hover:text-white"
            onClick={() => {
              recordSignal("why_it_works_opened");
              onWhyItWorks(post);
            }}
          >
            Why it works →
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Show me more like this"
              title="More like this"
              className="grid h-[29px] w-[31px] place-items-center rounded-lg border border-transparent text-[#8e899b] hover:border-[#2b2739] hover:bg-[#171522] hover:text-white"
              onClick={() => onMoreLikeThis(post)}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              ref={downRef}
              type="button"
              aria-label="Show me less like this"
              aria-expanded={negativeOpen}
              title="Less like this"
              className="grid h-[29px] w-[31px] place-items-center rounded-lg border border-transparent text-[#8e899b] hover:border-[#2b2739] hover:bg-[#171522] hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setNegativeOpen((open) => !open);
              }}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
            <button
              ref={kebabRef}
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              className="grid h-[29px] w-[31px] place-items-center rounded-lg border border-transparent text-[#a9a4b8] hover:border-[#2b2739] hover:bg-[#171522] hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setNegativeOpen(false);
                setMenuOpen((open) => !open);
              }}
            >
              •••
            </button>
          </div>
        </div>
      </div>

      {negativeOpen ? (
        <div
          ref={negativeRef}
          className="absolute bottom-[47px] right-3 z-30 grid min-w-[210px] gap-0.5 rounded-[11px] border border-[#2b2739] bg-[#171522] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.45)]"
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
                // Keep the existing dismissal behavior as the canonical
                // recommendation-negative signal while storing the reason too.
                onNotRelevant(post);
              }}
            >
              {reason.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-[rgba(255,107,122,.08)] hover:text-[#ffb4bd]"
            onClick={() => {
              setNegativeOpen(false);
              onHideCreator(post);
            }}
          >
            Don't show this creator
          </button>
        </div>
      ) : null}

      {menuOpen ? (
        <div
          ref={menuRef}
          className="absolute bottom-[47px] right-3 z-20 grid min-w-[164px] gap-0.5 rounded-[11px] border border-[#2b2739] bg-[#171522] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.45)]"
        >
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              setMenuOpen(false);
              onMoreLikeThis(post);
            }}
          >
            Show me more like this
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              setMenuOpen(false);
              onNotRelevant(post);
            }}
          >
            Not relevant to me
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-[rgba(255,107,122,.08)] hover:text-[#ffb4bd]"
            onClick={() => {
              setMenuOpen(false);
              onHideCreator(post);
            }}
          >
            Hide this creator
          </button>
        </div>
      ) : null}
    </article>
  );
}
