/**
 * Home v2 patterns (Figma "Home components (provisional, review only)"):
 * Home / Agent Composer, Home / Idea Card, Home / Result Card (compact),
 * Home / Creator Row, Home / Setup Banner, additional-profile invitation,
 * "Your profiles" modal, and the States sheet cards.
 *
 * Presentational only. Every number shown comes from real data passed in;
 * badges use the locked follower-multiple rule (shared/viralTier) and are
 * hidden when data is missing.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { SocialPlatform } from "@shared/personalization/model";
import type { FollowerViralBadge } from "@shared/viralTier";
import type { ViralPost } from "@shared/viralPosts";
import { PrimaryButton } from "@/design-system/core";
import {
  IconAiSparkle,
  IconClose,
  IconLink,
  IconToolHook,
  IconToolScript,
} from "@/design-system/icons";
import { ResultCard } from "@/design-system/ResultCard";
import { libraryPerformanceSignal } from "./libraryPerformance";
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import { InstagramMark } from "@shared/ui/PlatformMarks";
import {
  formatCompactCount,
  formatEngagementPct,
  formatShortPostDate,
} from "@/lib/viralPosts/format";
import { resolveViralPostPlayback, safeHttpUrl } from "@/lib/viralPostPlayback";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import { HOME_COPY as C } from "./copy";
import styles from "./home.module.css";

const cx = (...p: Array<string | false | null | undefined>) =>
  p.filter(Boolean).join(" ");

export const COMPOSER_MIN_CHARS = 10;

/* ---------- shared bits ---------- */

const TIER_CLASS: Record<FollowerViralBadge["tier"], string> = {
  Healthy: styles.badgeHealthy,
  Strong: styles.badgeStrong,
  Viral: styles.badgeViral,
  Explosive: styles.badgeExplosive,
};

/**
 * Creator multiplier badges ("Strong · 34x followers") are hidden in production.
 * They divide views by followers, which is not a comparison against the
 * creator's normal performance. Re-enable only with a validated baseline.
 */
export const SHOW_CREATOR_MULTIPLIER_BADGES = false;

export function ViralBadge({ badge }: { badge: FollowerViralBadge | null }) {
  if (!SHOW_CREATOR_MULTIPLIER_BADGES || !badge) return null;
  return (
    <span className={cx(styles.badge, TIER_CLASS[badge.tier])}>
      {badge.label}
    </span>
  );
}

const PLATFORM_BADGE: Record<string, string> = {
  instagram: "Reels",
  tiktok: "TikTok",
  youtube: "Shorts",
};

function initials(name: string): string {
  const parts = name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function StateCard({
  title,
  body,
  action,
  dashed,
  stack,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  dashed?: boolean;
  stack?: boolean;
}) {
  return (
    <div
      className={cx(
        styles.card,
        styles.stateCard,
        stack && styles.stateCardStack,
        dashed && styles.stateCardDashed
      )}
    >
      <div className={styles.stateText}>
        <p className={cx("sr-text-product-card-title", styles.h2)}>{title}</p>
        <p className={cx("sr-text-product-body-small", styles.muted)}>{body}</p>
      </div>
      {action ? (
        <div className={stack ? styles.stateAction : undefined}>{action}</div>
      ) : null}
    </div>
  );
}

export function Skeleton({
  w,
  h,
  round,
}: {
  w: number | string;
  h: number;
  round?: boolean;
}) {
  return (
    <span
      className={styles.skeleton}
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: round ? 999 : undefined,
      }}
      aria-hidden
    />
  );
}

/* ---------- Agent ---------- */

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  busy,
  error,
  helper,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  /** Mobile only: helper line next to the button (Figma 1498:2209). */
  helper?: string;
}) {
  const id = useId();
  return (
    <div>
      <form
        className={cx(styles.composer, error && styles.composerError)}
        onSubmit={e => {
          e.preventDefault();
          if (!busy) onSubmit();
        }}
      >
        <label htmlFor={id} className="sr-only">
          {C.composer.label}
        </label>
        <textarea
          id={id}
          className={styles.composerInput}
          value={value}
          rows={2}
          maxLength={2000}
          placeholder={C.composer.placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy)
              onSubmit();
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div className={styles.composerActions}>
          {helper ? (
            <span className={cx("sr-text-product-caption", styles.composerHelper)}>{helper}</span>
          ) : null}
          {/* Enabled like Figma; a too-short idea gets the Agent's own message on submit. */}
          <PrimaryButton
            type="submit"
            disabled={busy}
            aria-busy={busy}
            trailingIcon={!busy}
            className={styles.composerSubmit}
          >
            {busy
              ? C.composer.creating
              : error
                ? C.tryAgain
                : C.composer.create}
          </PrimaryButton>
        </div>
      </form>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className={cx("sr-text-product-body-small", styles.errorText)}
          style={{ marginTop: 8 }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function QuickActions({
  onWrite,
  onImprove,
  onHooks,
  compact = false,
}: {
  onWrite: () => void;
  onImprove: () => void;
  onHooks: () => void;
  /** Mobile (1498:2199): 44px chips that wrap; only "Write a script" keeps its icon. */
  compact?: boolean;
}) {
  return (
    <div className={styles.chips}>
      <button type="button" className={styles.chip} onClick={onWrite}>
        <IconToolScript />
        {C.quick.write}
      </button>
      <button type="button" className={styles.chip} onClick={onImprove}>
        {compact ? null : <IconAiSparkle />}
        {C.quick.improve}
      </button>
      <button type="button" className={styles.chip} onClick={onHooks}>
        {compact ? null : <IconToolHook />}
        {C.quick.hooks}
      </button>
    </div>
  );
}

export function VideoLinkEntry({ onPaste }: { onPaste: () => void }) {
  return (
    <div className={cx("sr-text-product-body-small", styles.linkEntry)}>
      <span>{C.videoLink.lead}</span>
      <button type="button" className={styles.linkAction} onClick={onPaste}>
        <IconLink size={16} />
        {C.videoLink.action}
      </button>
    </div>
  );
}

/* ---------- banner ---------- */

export function SetupBanner({
  onFinish,
  onDismiss,
  compact = false,
}: {
  onFinish: () => void;
  onDismiss: () => void;
  /** Mobile (1498:2273): stacked, filled "Finish setup" button, close top right. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={cx(styles.banner, styles.bannerCompact)} role="region" aria-label={C.banner.title}>
        <div className={styles.bannerText}>
          <span className={cx("sr-text-product-card-title", styles.h2)}>{C.banner.title}</span>
          <span className={cx("sr-text-product-body-small", styles.muted)}>{C.banner.body}</span>
        </div>
        <PrimaryButton onClick={onFinish} trailingIcon className={styles.bannerCompactAction}>
          {C.banner.action}
        </PrimaryButton>
        <button
          type="button"
          className={cx(styles.iconButton, styles.iconButtonBare, styles.bannerClose)}
          onClick={onDismiss}
          aria-label={C.banner.dismiss}
        >
          <IconClose />
        </button>
      </div>
    );
  }
  return (
    <div className={styles.banner} role="region" aria-label={C.banner.title}>
      <div className={styles.bannerText}>
        <span className={cx("sr-text-product-label", styles.h2)}>
          {C.banner.title}
        </span>
        <span className={cx("sr-text-product-body-small", styles.muted)}>
          {C.banner.body}
        </span>
      </div>
      <button type="button" className={styles.outline} onClick={onFinish}>
        {C.banner.action}
      </button>
      <button
        type="button"
        className={cx(styles.iconButton, styles.iconButtonBare)}
        onClick={onDismiss}
        aria-label={C.banner.dismiss}
      >
        <IconClose />
      </button>
    </div>
  );
}

/* ---------- ideas ---------- */

export type HomeIdea = {
  /** Plan card id, or "search:<phrase>" for an idea from real searches. */
  id: number | string;
  title: string;
  hook: string | null;
  /** Small label under the title, for example "Searched a lot on Google and YouTube". */
  badge?: string | null;
};

export function IdeaCard({
  idea,
  onWrite,
  compact = false,
}: {
  idea: HomeIdea;
  onWrite: () => void;
  /** Mobile (1498:2244): text link "Write script →" instead of the outline button. */
  compact?: boolean;
}) {
  return (
    <article className={cx(styles.card, styles.idea)}>
      <p
        className={cx("sr-text-product-body-large", styles.h2)}
        style={{ fontWeight: 500 }}
      >
        {idea.title}
      </p>
      {idea.badge ? (
        <p className={cx("sr-text-product-body-small", styles.muted)}>{idea.badge}</p>
      ) : null}
      {idea.hook ? (
        <p
          className={cx("sr-text-product-body-small", styles.muted)}
        >{`“${idea.hook.replace(/^["“]|["”]$/g, "")}”`}</p>
      ) : null}
      <span className={styles.ideaSpacer} />
      <button
        type="button"
        className={compact ? cx(styles.ghost, styles.ghostBrand, styles.ideaButton) : cx(styles.outline, styles.ideaButton)}
        onClick={onWrite}
      >
        {compact ? C.mobile.writeIdea : C.ideas.write}
      </button>
    </article>
  );
}

export function IdeasSkeleton() {
  return (
    <div
      className={cx(styles.card, styles.stateCard, styles.stateCardStack)}
      aria-busy
    >
      <Skeleton w="60%" h={16} />
      <Skeleton w="90%" h={12} />
      <Skeleton w={110} h={36} />
    </div>
  );
}

/* ---------- Viral Videos for you: canonical Result Card (Figma 288:666) ---------- */

/**
 * Maps Home videos to the canonical shared Result Card (Figma 288:666,
 * Context=Product, State=Default, portrait media). No separate card markup.
 * Viral score and performance multiplier stay hidden: Home cannot prove the
 * creator-usual-views baseline required by the approved Figma signal policy.
 */
/** Calls onSeen once, after the card has been at least half on screen for 1.2s. */
function useSeenOnce(onSeen?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sent = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onSeen || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timer && !sent.current) {
            timer = setTimeout(() => {
              sent.current = true;
              onSeen();
              observer.disconnect();
            }, 1200);
          }
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0.5] }
    );
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
    // onSeen identity may change per render; the first one is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function HomeVideoCard({
  post,
  busy,
  compact,
  onRemake,
  onToggleSave,
  onPlay,
  onSeen,
  onNotRelevant,
}: {
  post: ViralPost;
  busy: boolean;
  /** Mobile: Expand hidden (Figma note on 288:666). */
  compact: boolean;
  onRemake: () => void;
  onToggleSave: () => void;
  /** Only for videos that cannot play inside the card (shows the honest fallback). */
  onPlay: () => void;
  /** Recorded once when the card has really been on screen (measurement only). */
  onSeen?: () => void;
  /** "Not relevant to my niche" in the card menu (same for every ranking). */
  onNotRelevant?: () => void;
}) {
  const seenRef = useSeenOnce(onSeen);
  const [playingInline, setPlayingInline] = useState(false);
  const playback = resolveViralPostPlayback(post);
  const stopInline = () => setPlayingInline(false);
  // Play plays inside the card, like Viral Posts (its player has its own expand and close).
  const inlineMedia = !playingInline ? null : playback.kind === "file" ? (
    <DashboardReelGridMedia
      className="h-full w-full"
      thumbnailUrl={playback.thumbnailUrl}
      videoUrl={playback.videoUrl}
      shortcode={playback.shortcode}
      reelId={playback.reelId}
      platform={playback.platform}
      videoPageUrl={playback.videoPageUrl}
      externalWatch={playback.external}
      size="compact"
      autoStart
      onPlayingChange={playing => {
        if (!playing) stopInline();
      }}
    />
  ) : playback.kind === "youtube" ? (
    <YouTubeInlineEmbed className="h-full w-full" videoId={playback.videoId} onStop={stopInline} />
  ) : null;
  const playInCard = () => {
    if (playback.kind === "unavailable") onPlay();
    else setPlayingInline(true);
  };
  const title = post.hook?.trim() || post.caption?.trim() || C.videos.untitled;
  const views = formatCompactCount(post.views);
  const engagement = formatEngagementPct(post.engagementRate);
  const published = formatShortPostDate(post.publishedAt);
  const metrics = [
    ...(views ? [`${views} views`] : []),
    ...(engagement ? [engagement] : []),
    ...(published ? [published] : []),
  ];
  const handle = (post.creatorHandle || "").replace(/^@/, "");
  const originalUrl = safeHttpUrl(post.sourceUrl);
  return (
    <div ref={seenRef} className={styles.videoCell}>
    <ResultCard
      testId="home-result-card"
      mediaFormat="portrait"
      platform={post.platform as SocialPlatform}
      platformLabel={PLATFORM_BADGE[post.platform] ?? post.platform}
      thumbnailUrl={post.thumbnailUrl ?? null}
      title={title}
      creator={handle ? `@${handle}` : null}
      metrics={metrics}
      signal={libraryPerformanceSignal(post)}
      labels={{
        play: C.videos.play,
        expand: C.videos.expand,
        remake: C.videos.remake,
        save: C.videos.save,
        saved: C.videos.saved,
        more: C.videos.more,
      }}
      onPlay={playInCard}
      inlineMedia={inlineMedia}
      onRemake={onRemake}
      remakeBusy={busy}
      saved={post.saved}
      onToggleSave={onToggleSave}
      menu={[
        originalUrl
          ? { label: C.videos.openOriginal, href: originalUrl }
          : {
              label: C.videos.openOriginal,
              onSelect: () => toast.error("Original link unavailable"),
            },
        ...(onNotRelevant ? [{ label: C.videos.notRelevant, onSelect: onNotRelevant }] : []),
      ]}
    />
    </div>
  );
}

export { ResultCardSkeleton as ResultSkeleton } from "@/design-system/ResultCard";

/* ---------- creators ---------- */

export type HomeCreatorView = {
  id: number;
  handle: string;
  displayName: string | null;
  profilePicUrl: string | null;
  platform: SocialPlatform;
  badge: FollowerViralBadge | null;
};

/**
 * One creator in "Creators going viral". The whole row is one button: it opens
 * Research for this creator, which adds them to Creator Radar.
 */
export function CreatorRow({
  creator,
  onOpen,
  compact = false,
}: {
  creator: HomeCreatorView;
  onOpen: () => void;
  compact?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const name = creator.displayName?.trim() || `@${creator.handle}`;
  return (
    <button
      type="button"
      className={cx(styles.creatorRow, styles.creatorRowButton)}
      onClick={onOpen}
      aria-label={C.creators.openLabel(name)}
    >
      <span className={styles.avatar} aria-hidden>
        {creator.profilePicUrl && !imgFailed ? (
          <img
            src={creator.profilePicUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          initials(name)
        )}
      </span>
      <div className={styles.creatorText}>
        <span
          className={cx("sr-text-product-label", styles.h2, styles.ellipsis)}
          style={{ fontWeight: 500 }}
        >
          {name}
        </span>
        <span className={cx("sr-text-product-body-small", styles.handleLine)}>
          {/* Figma Home / Creator Row: Instagram uses Brand / Platform / Instagram / Mono. */}
          {creator.platform === "instagram" ? (
            <InstagramMark className={styles.monoMark} />
          ) : (
            <PlatformFullColorMark platform={creator.platform} size={20} />
          )}
          <span className={styles.ellipsis}>@{creator.handle}</span>
        </span>
        <ViralBadge badge={creator.badge} />
      </div>
      <span
        className={compact ? cx(styles.ghost, styles.ghostBrand, styles.creatorAction) : cx(styles.ghost, styles.creatorAction)}
        aria-hidden
      >
        {compact ? C.mobile.addToRadar : C.creators.addToRadar}
      </span>
    </button>
  );
}

export function CreatorsSkeleton() {
  return (
    <div className={cx(styles.card, styles.creatorsCard)} aria-busy>
      {[0, 1, 2].map(i => (
        <div key={i} className={styles.creatorRow}>
          <Skeleton w={40} h={40} round />
          <div className={styles.creatorText}>
            <Skeleton w={140} h={12} />
            <Skeleton w={100} h={10} />
            <Skeleton w={120} h={20} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- profiles ---------- */

/**
 * "+ TikTok  + YouTube" chips for the platforms the creator has not added yet
 * (connector-style, like Perplexity's "+ Figma"). Hidden once all are added.
 */
export function ProfilesInvite({
  missing,
  onAdd,
  compact = false,
}: {
  missing: Array<{ id: SocialPlatform; label: string }>;
  onAdd: (platform: SocialPlatform) => void;
  /** Mobile: subtle panel. */
  compact?: boolean;
}) {
  if (missing.length === 0) return null;
  return (
    <div className={cx(styles.card, styles.invite, compact && styles.inviteCompact)} data-testid="home-add-platforms">
      <span
        className={cx("sr-text-product-label", styles.h2)}
        style={{ fontWeight: compact ? 600 : 500 }}
      >
        {C.profiles.inviteTitle}
      </span>
      <span className={cx("sr-text-product-body-small", styles.muted)}>{C.profiles.inviteBody}</span>
      <div className={styles.platformChips}>
        {missing.map(p => (
          <button
            key={p.id}
            type="button"
            className={styles.platformChip}
            onClick={() => onAdd(p.id)}
            aria-label={C.profiles.addPlatform(p.label)}
          >
            <PlatformFullColorMark platform={p.id} size={16} />
            {p.label}
            <span className={styles.platformChipPlus} aria-hidden>
              +
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type ProfileView = {
  id: string;
  platform: SocialPlatform | null;
  handle: string | null;
  active: boolean;
};

export const PLATFORMS: Array<{ id: SocialPlatform; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
];

export function ManageProfilesModal({
  profiles,
  busy,
  onAdd,
  onUse,
  onClose,
}: {
  profiles: ProfileView[];
  busy: boolean;
  onAdd: (platform: SocialPlatform) => void;
  onUse: (profileId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className={cx("sr-scope-light", styles.overlay)}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cx(styles.theme, styles.modal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.modalHeader}>
          <div className={styles.sectionTitles}>
            <h2
              id={titleId}
              className={cx("sr-text-product-heading-4", styles.h2)}
            >
              {C.profiles.modalTitle}
            </h2>
            <p className={cx("sr-text-product-body-small", styles.muted)}>
              {C.profiles.modalBody}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={cx(styles.iconButton, styles.iconButtonBare)}
            onClick={onClose}
            aria-label={C.profiles.close}
          >
            <IconClose />
          </button>
        </div>
        <div className={styles.profileList}>
          {PLATFORMS.map(p => {
            const mine = profiles.filter(x => x.platform === p.id && x.handle);
            const shown = mine.find(x => x.active) ?? mine[0] ?? null;
            return (
              <div key={p.id} className={styles.profileRow}>
                <PlatformFullColorMark platform={p.id} size={20} />
                <div className={styles.creatorText}>
                  <span
                    className={cx("sr-text-product-body-medium", styles.h2)}
                  >
                    {p.label}
                  </span>
                  <span
                    className={cx("sr-text-product-body-small", styles.muted)}
                  >
                    {shown ? `@${shown.handle}` : C.profiles.notAdded}
                  </span>
                </div>
                {shown ? (
                  shown.active ? (
                    <span className={cx(styles.badge, styles.badgeSuccess)}>
                      {C.profiles.added}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.outline}
                      disabled={busy}
                      onClick={() => onUse(shown.id)}
                    >
                      {C.profiles.use}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className={styles.outline}
                    disabled={busy}
                    onClick={() => onAdd(p.id)}
                  >
                    {C.profiles.add}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
