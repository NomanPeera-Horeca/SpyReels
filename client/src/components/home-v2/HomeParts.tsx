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
import { followerViralBadge, type FollowerViralBadge } from "@shared/viralTier";
import type { ViralPost } from "@shared/viralPosts";
import { PrimaryButton } from "@/design-system/core";
import {
  IconAiSparkle,
  IconClose,
  IconExpand,
  IconLink,
  IconMore,
  IconPlay,
  IconStar,
  IconToolHook,
  IconToolScript,
} from "@/design-system/icons";
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

export function ViralBadge({ badge }: { badge: FollowerViralBadge | null }) {
  if (!badge) return null;
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
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
          {/* Enabled like Figma; a too-short idea gets the Agent's own message on submit. */}
          <PrimaryButton
            type="submit"
            disabled={busy}
            aria-busy={busy}
            trailingIcon={!busy}
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
}: {
  onWrite: () => void;
  onImprove: () => void;
  onHooks: () => void;
}) {
  return (
    <div className={styles.chips}>
      <button type="button" className={styles.chip} onClick={onWrite}>
        <IconToolScript />
        {C.quick.write}
      </button>
      <button type="button" className={styles.chip} onClick={onImprove}>
        <IconAiSparkle />
        {C.quick.improve}
      </button>
      <button type="button" className={styles.chip} onClick={onHooks}>
        <IconToolHook />
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
}: {
  onFinish: () => void;
  onDismiss: () => void;
}) {
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
}: {
  idea: HomeIdea;
  onWrite: () => void;
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
        className={cx(styles.outline, styles.ideaButton)}
        onClick={onWrite}
      >
        {C.ideas.write}
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

/* ---------- Home / Result Card (compact) ---------- */

export function HomeResultCard({
  post,
  busy,
  onCreate,
  onToggleSave,
}: {
  post: ViralPost;
  busy: boolean;
  onCreate: () => void;
  onToggleSave: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const title = post.hook?.trim() || post.caption?.trim() || C.videos.untitled;
  const views = formatCompactCount(post.views);
  const badge = followerViralBadge(
    post.views ?? null,
    post.creatorFollowers ?? null
  );
  const handle = (post.creatorHandle || "").replace(/^@/, "");
  const open = () =>
    window.open(post.sourceUrl, "_blank", "noopener,noreferrer");
  const platform = post.platform as SocialPlatform;

  return (
    <article
      className={cx(styles.card, styles.result)}
      data-testid="home-result-card"
    >
      <div className={styles.media}>
        {post.thumbnailUrl && !thumbFailed ? (
          <img
            className={styles.thumb}
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
          />
        ) : null}
        <span className={styles.badgeRowStart}>
          <span className={cx(styles.badge, styles.badgeNeutral)}>
            <PlatformFullColorMark platform={platform} size={16} />
            {PLATFORM_BADGE[post.platform] ?? post.platform}
          </span>
        </span>
        <span className={styles.badgeRowEnd}>
          <ViralBadge badge={badge} />
        </span>
        <button
          type="button"
          className={cx(styles.iconButton, styles.mediaPlay)}
          onClick={open}
          aria-label={C.videos.play}
        >
          <IconPlay />
        </button>
        <button
          type="button"
          className={cx(styles.iconButton, styles.mediaExpand)}
          onClick={open}
          aria-label={C.videos.expand}
        >
          <IconExpand />
        </button>
      </div>
      <div className={styles.resultContent}>
        <p className={styles.resultTitle}>{title}</p>
        {handle ? (
          <p
            className={cx(
              "sr-text-product-body-small",
              styles.muted,
              styles.ellipsis
            )}
          >
            @{handle}
          </p>
        ) : null}
        {views ? (
          <p className={cx("sr-text-product-body-small", styles.muted)}>
            {views} views
          </p>
        ) : null}
        <div className={styles.resultActions} ref={menuRef}>
          <button
            type="button"
            className={styles.outline}
            onClick={onCreate}
            disabled={busy}
            aria-busy={busy}
          >
            {C.videos.create}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleSave}
            aria-pressed={post.saved}
            aria-label={post.saved ? C.videos.saved : C.videos.save}
          >
            <IconStar filled={post.saved} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setMenu(m => !m)}
            aria-expanded={menu}
            aria-haspopup="menu"
            aria-label={C.videos.more}
          >
            <IconMore />
          </button>
          {menu ? (
            <div className={styles.menu} role="menu">
              <a
                role="menuitem"
                className={styles.menuItem}
                href={post.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenu(false)}
              >
                {C.videos.openOriginal}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ResultSkeleton() {
  return (
    <div className={cx(styles.card, styles.result)} aria-busy>
      <div className={styles.media} />
      <div className={styles.resultContent}>
        <Skeleton w="70%" h={16} />
        <Skeleton w="40%" h={12} />
        <Skeleton w="85%" h={36} />
      </div>
    </div>
  );
}

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
}: {
  creator: HomeCreatorView;
  onSee: () => void;
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
      <button type="button" className={styles.ghost} onClick={onSee}>
        {C.creators.seeVideos}
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

export function ProfilesInvite({ onManage }: { onManage: () => void }) {
  return (
    <div className={cx(styles.card, styles.invite)}>
      <span
        className={cx("sr-text-product-label", styles.h2)}
        style={{ fontWeight: 500 }}
      >
        {C.profiles.inviteTitle}
      </span>
      <span className={cx("sr-text-product-body-small", styles.muted)}>
        {C.profiles.inviteBody}
      </span>
      <button
        type="button"
        className={cx(styles.outline, styles.inviteAction)}
        onClick={onManage}
      >
        {C.profiles.manage}
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
