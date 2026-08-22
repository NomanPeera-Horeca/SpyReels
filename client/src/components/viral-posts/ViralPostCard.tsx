import { useEffect, useRef, useState } from "react";
import { ViralPostPreview } from "@/components/viral-posts/ViralPostPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const followers = formatFollowerCount(post.creatorFollowers);
  const views = formatCompactCount(post.views);
  const comments = formatCompactCount(post.comments);
  const shares = formatCompactCount(post.shares);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        kebabRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <article className="relative overflow-hidden rounded-[16px] border border-[#2b2739] bg-[#111019] shadow-[0_18px_50px_rgba(0,0,0,.28)]">
      <ViralPostPreview post={post} onClick={() => onWhyItWorks(post)} />

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
          >
            Open on Instagram
          </a>
        ) : null}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            type="button"
            className="h-[39px] bg-[#7c3aed] font-bold text-white hover:bg-[#6d28d9]"
            onClick={() => onRemake(post)}
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
            onClick={() => onWhyItWorks(post)}
          >
            Why it works →
          </button>
          <button
            ref={kebabRef}
            type="button"
            aria-label="More options"
            aria-expanded={menuOpen}
            className="grid h-[29px] w-[31px] place-items-center rounded-lg border border-transparent text-[#a9a4b8] hover:border-[#2b2739] hover:bg-[#171522] hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            •••
          </button>
        </div>
      </div>

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
