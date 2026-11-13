/**
 * One Viral Posts card, on the shared Figma Result Card (288:666), the same
 * card Home uses. Viral Posts keeps its own behaviour around it: impressions
 * and feedback signals, View details, More like this, Hide creator and the
 * "What's wrong with this?" reasons.
 */
import { useEffect, useRef, useState } from "react";
import type { SocialPlatform } from "@shared/personalization/model";
import { ResultCard } from "@/design-system/ResultCard";
import { libraryPerformanceSignal } from "@/components/home-v2/libraryPerformance";
import { useCardInlinePlayback } from "@/components/useCardInlinePlayback";
import { trpc } from "@/lib/trpc";
import { safeHttpUrl } from "@/lib/viralPostPlayback";
import {
  formatCompactCount,
  formatCreatorHandle,
  formatEngagementPct,
  formatNicheSignal,
  formatShortPostDate,
} from "@/lib/viralPosts/format";
import type { ViralPost } from "@/lib/viralPosts/types";
import styles from "./viralPosts.module.css";

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

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Reels",
  tiktok: "TikTok",
  youtube: "Shorts",
};

function cardCaption(post: ViralPost): string {
  if (post.hook?.trim()) return post.hook.trim();
  if (post.caption?.trim()) return post.caption.trim();
  return "Viral post in your niche";
}

/** "69.2K views · 22.3% eng · 1.7x niche avg · Sep 11", only the parts we have. Pure. */
export function viralPostMetrics(post: ViralPost): string[] {
  const views = formatCompactCount(post.views);
  const eng = formatEngagementPct(post.engagementRate);
  const signal = formatNicheSignal(post.reachMultiplier);
  const date = formatShortPostDate(post.publishedAt);
  return [
    ...(views ? [`${views} views`] : []),
    ...(eng ? [eng] : []),
    ...(signal ? [signal] : []),
    ...(date ? [date] : []),
  ];
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
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const reasonsRef = useRef<HTMLDivElement>(null);
  const impressionSentRef = useRef(false);
  const signalMutation = trpc.viralPosts.feedback.useMutation();

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

  const openDetails = () => {
    recordSignal("why_it_works_opened");
    onWhyItWorks(post);
  };
  // Videos that cannot play inside the card open the details (they link to the original).
  const { inlineMedia, play } = useCardInlinePlayback(post, openDetails);

  useEffect(() => {
    if (!reasonsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!reasonsRef.current?.contains(event.target as Node)) setReasonsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setReasonsOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [reasonsOpen]);

  useEffect(() => {
    const node = cellRef.current;
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

  const handle = formatCreatorHandle(post.creatorHandle || post.creatorName);
  const originalUrl = safeHttpUrl(post.sourceUrl);

  return (
    <div ref={cellRef} className={styles.cell} data-testid="viral-post-card">
      <ResultCard
        mediaFormat="portrait"
        platform={post.platform as SocialPlatform}
        platformLabel={PLATFORM_LABEL[post.platform] ?? post.platform}
        thumbnailUrl={post.thumbnailUrl ?? null}
        title={cardCaption(post)}
        creator={handle || null}
        onOpenCreator={handle ? () => onOpenCreator(post) : undefined}
        metrics={viralPostMetrics(post)}
        signal={libraryPerformanceSignal(post)}
        labels={{
          play: "Play video",
          expand: "View details",
          remake: "Remake",
          save: "Save post",
          saved: "Remove from saved",
          more: "More options",
        }}
        onPlay={play}
        inlineMedia={inlineMedia}
        onRemake={() => {
          recordSignal("remake_started");
          onRemake(post);
        }}
        saved={post.saved}
        onToggleSave={() => onToggleSave(post)}
        share={originalUrl ? { url: originalUrl, title: cardCaption(post) } : null}
        menu={[
          { label: "View details", onSelect: openDetails },
          { label: "Open creator", onSelect: () => onOpenCreator(post) },
          { label: "More like this", onSelect: () => onMoreLikeThis(post) },
          { label: "Not relevant", onSelect: () => setReasonsOpen(true) },
          { label: "Hide creator", onSelect: () => onHideCreator(post) },
        ]}
      />

      {reasonsOpen ? (
        <div ref={reasonsRef} className={styles.reasons} role="menu" aria-label="What's wrong with this?">
          <p className={styles.reasonsTitle}>What's wrong with this?</p>
          {NEGATIVE_REASONS.map((reason) => (
            <button
              key={reason.type}
              type="button"
              role="menuitem"
              className={styles.reasonItem}
              onClick={() => {
                setReasonsOpen(false);
                recordSignal(reason.type);
                onNotRelevant(post);
              }}
            >
              {reason.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
