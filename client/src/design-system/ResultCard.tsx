/**
 * Result Card (Figma 288:666, canonical shared Result/Remake card), app
 * version. The portrait media format is the original Figma Result Card
 * (280x599, media 280x373). The existing 180px-wide Home media extension
 * remains available to avoid silently changing older approved consumers.
 *
 * Rules from the Figma component notes:
 * - Show Home media XOR standard media (only Home media is built here).
 * - Performance multiplier (1577:167) and the older viral score never show
 *   together. The multiplier is shown only when the caller passes a value
 *   from a validated creator baseline; the card never computes one.
 * - Mobile hides Expand: callers omit onExpand there.
 *
 * Presentational. Every value comes from real data passed in.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SocialPlatform } from "@shared/personalization/model";
import { IconArrowUpRight, IconExpand, IconMore, IconPlay, IconStar } from "./icons";
import { PlatformFullColorMark } from "./platformMarks";
import styles from "./ResultCard.module.css";

/** Top-right media overlay. Exactly one kind, never both. */
export type ResultCardSignal =
  /** Older follower-multiple tier ("Strong · 34x followers"); caller renders it. */
  | { kind: "viral_score"; node: ReactNode }
  /**
   * New "↗ N×" pill. Only for a server-validated baseline (creator usual
   * views, comparison window, enough data). Never pass a guessed number.
   */
  | { kind: "performance"; label: string; description: string };

export type ResultCardMenuItem = { label: string; href?: string; onSelect?: () => void };

export type ResultCardProps = {
  platform: SocialPlatform;
  platformLabel: string;
  thumbnailUrl: string | null;
  /** Portrait is the canonical Result Card; wide preserves the former Home extension. */
  mediaFormat?: "portrait" | "wide";
  title: string;
  creator: string | null;
  metrics: string[];
  signal?: ResultCardSignal | null;
  labels: {
    play: string;
    expand: string;
    remake: string;
    save: string;
    saved: string;
    more: string;
  };
  onPlay: () => void;
  /** Omit to hide Expand (mobile). */
  onExpand?: () => void;
  onRemake: () => void;
  remakeBusy?: boolean;
  saved: boolean;
  onToggleSave: () => void;
  menu: ResultCardMenuItem[];
  testId?: string;
};

export function ResultCard({
  platform,
  platformLabel,
  thumbnailUrl,
  mediaFormat = "wide",
  title,
  creator,
  metrics,
  signal = null,
  labels,
  onPlay,
  onExpand,
  onRemake,
  remakeBusy = false,
  saved,
  onToggleSave,
  menu,
  testId,
}: ResultCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!actionsRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <article className={["sr-mode-product", styles.card, mediaFormat === "portrait" && styles.portrait].filter(Boolean).join(" ")} data-testid={testId}>
      <div className={styles.media}>
        {thumbnailUrl && !thumbFailed ? (
          <img
            className={styles.thumb}
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
          />
        ) : null}
        <span className={styles.platformBadge}>
          <PlatformFullColorMark platform={platform} size={16} />
          {platformLabel}
        </span>
        {signal?.kind === "viral_score" ? <span className={styles.topEnd}>{signal.node}</span> : null}
        {signal?.kind === "performance" ? (
          <button
            type="button"
            className={styles.signalTarget}
            aria-label={signal.description}
            title={signal.description}
          >
            <span className={styles.signal}>
              <IconArrowUpRight size={14} />
              {signal.label}
            </span>
          </button>
        ) : null}
        <button type="button" className={[styles.iconButton, styles.play].join(" ")} onClick={onPlay} aria-label={labels.play}>
          <IconPlay />
        </button>
        {onExpand ? (
          <button
            type="button"
            className={[styles.iconButton, styles.expand].join(" ")}
            onClick={onExpand}
            aria-label={labels.expand}
          >
            <IconExpand />
          </button>
        ) : null}
      </div>
      <div className={styles.content}>
        <p className={styles.title}>{title}</p>
        {creator ? <p className={[styles.meta, styles.ellipsis].join(" ")}>{creator}</p> : null}
        {metrics.length ? <p className={styles.meta}>{metrics.join(" · ")}</p> : null}
        <div className={styles.actions} ref={actionsRef}>
          <button
            type="button"
            className={styles.remake}
            onClick={onRemake}
            disabled={remakeBusy}
            aria-busy={remakeBusy}
          >
            {labels.remake}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleSave}
            aria-pressed={saved}
            aria-label={saved ? labels.saved : labels.save}
          >
            <IconStar filled={saved} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setMenuOpen(m => !m)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={labels.more}
          >
            <IconMore />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              {menu.map(item =>
                item.href ? (
                  <a
                    key={item.label}
                    role="menuitem"
                    className={styles.menuItem}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Loading state for the same card (keeps score, Expand and signal hidden). */
export function ResultCardSkeleton({
  mediaFormat = "wide",
}: {
  mediaFormat?: "portrait" | "wide";
} = {}) {
  return (
    <div className={["sr-mode-product", styles.card, mediaFormat === "portrait" && styles.portrait].filter(Boolean).join(" ")} aria-busy>
      <div className={styles.media} />
      <div className={styles.content}>
        <span className={styles.skeleton} style={{ width: "80%", height: 16 }} />
        <span className={styles.skeleton} style={{ width: "40%", height: 12 }} />
        <span className={styles.skeleton} style={{ width: "100%", height: 44 }} />
      </div>
    </div>
  );
}
