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
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import { InstagramMark } from "@shared/ui/PlatformMarks";
import { formatCompactCount } from "@/lib/viralPosts/format";
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

export type HomeIdea = { id: number; title: string; hook: string | null };

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

/* ---------- Videos for you: shared Result Card (288:666) ---------- */

/**
 * Maps a Home video to the shared Result Card (Home media extension,
 * 1603:3680 / 1605:4184). Not a separate card: layout and styles live in
 * the design-system ResultCard. Viral score is off on Home (Figma instance
 * setting) and the "↗ N×" pill stays hidden: Home has no validated
 * creator-usual-views baseline yet, so no multiplier is computed or shown.
 */
export function HomeVideoCard({
  post,
  busy,
  compact,
  onRemake,
  onToggleSave,
}: {
  post: ViralPost;
  busy: boolean;
  /** Mobile: Expand hidden (Figma note on 288:666). */
  compact: boolean;
  onRemake: () => void;
  onToggleSave: () => void;
}) {
  const title = post.hook?.trim() || post.caption?.trim() || C.videos.untitled;
  const views = formatCompactCount(post.views);
  const handle = (post.creatorHandle || "").replace(/^@/, "");
  const open = () => window.open(post.sourceUrl, "_blank", "noopener,noreferrer");
  return (
    <ResultCard
      testId="home-result-card"
      platform={post.platform as SocialPlatform}
      platformLabel={PLATFORM_BADGE[post.platform] ?? post.platform}
      thumbnailUrl={post.thumbnailUrl ?? null}
      title={title}
      creator={handle ? `@${handle}` : null}
      metrics={views ? [`${views} views`] : []}
      signal={null}
      labels={{
        play: C.videos.play,
        expand: C.videos.expand,
        remake: C.videos.remake,
        save: C.videos.save,
        saved: C.videos.saved,
        more: C.videos.more,
      }}
      onPlay={open}
      onExpand={compact ? undefined : open}
      onRemake={onRemake}
      remakeBusy={busy}
      saved={post.saved}
      onToggleSave={onToggleSave}
      menu={[{ label: C.videos.openOriginal, href: post.sourceUrl }]}
    />
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

export function CreatorRow({
  creator,
  onSee,
  compact = false,
}: {
  creator: HomeCreatorView;
  onSee: () => void;
  compact?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const name = creator.displayName?.trim() || `@${creator.handle}`;
  return (
    <div className={styles.creatorRow}>
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
      <button type="button" className={compact ? cx(styles.ghost, styles.ghostBrand) : styles.ghost} onClick={onSee}>
        {compact ? C.mobile.seeVideos : C.creators.seeVideos}
      </button>
    </div>
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

export function ProfilesInvite({
  onManage,
  compact = false,
}: {
  onManage: () => void;
  /** Mobile (1498:2268): subtle panel, approved mobile copy, text link. */
  compact?: boolean;
}) {
  return (
    <div className={cx(styles.card, styles.invite, compact && styles.inviteCompact)}>
      <span
        className={cx("sr-text-product-label", styles.h2)}
        style={{ fontWeight: compact ? 600 : 500 }}
      >
        {compact ? C.mobile.inviteTitle : C.profiles.inviteTitle}
      </span>
      <span className={cx("sr-text-product-body-small", styles.muted)}>
        {compact ? C.mobile.inviteBody : C.profiles.inviteBody}
      </span>
      <button
        type="button"
        className={compact ? cx(styles.ghost, styles.ghostBrand, styles.inviteAction) : cx(styles.outline, styles.inviteAction)}
        onClick={onManage}
      >
        {compact ? C.mobile.manage : C.profiles.manage}
      </button>
    </div>
  );
}

export type ProfileView = {
  id: string;
  platform: SocialPlatform | null;
  handle: string | null;
  active: boolean;
};

const PLATFORMS: Array<{ id: SocialPlatform; label: string }> = [
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
