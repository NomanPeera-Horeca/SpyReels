"use client";

import type { ReactNode } from "react";
import styles from "./ResultCard.module.css";

export type ResultCardData = {
  id: string | number;
  caption?: string | null;
  thumbnailUrl?: string | null;
  viewCount?: number | null;
  engagementRate?: number | null;
  creatorHandle?: string | null;
};

type ResultCardProps = {
  data: ResultCardData;
  platformLabel: string;
  platformMark: ReactNode;
  onRemake: (data: ResultCardData) => void;
};

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function ResultCard({
  data,
  platformLabel,
  platformMark,
  onRemake,
}: ResultCardProps) {
  const caption = data.caption?.replace(/\s+/g, " ").trim() || "Untitled post";
  const hasViews = typeof data.viewCount === "number" && Number.isFinite(data.viewCount);
  const hasEngagement =
    typeof data.engagementRate === "number" && Number.isFinite(data.engagementRate);

  return (
    <article className={styles.card} data-testid="reel-card">
      <div className={styles.media}>
        {data.thumbnailUrl ? (
          <img
            className={styles.thumbnail}
            src={data.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.thumbnailFallback} aria-hidden>
            {platformMark}
          </div>
        )}

        <div className={styles.platformBadge}>
          <span className={styles.platformMark}>{platformMark}</span>
          <span className={styles.platformLabel}>{platformLabel}</span>
        </div>

        <span className={styles.playGlyph} aria-hidden>
          ▶
        </span>
        <span className={styles.expandGlyph} aria-hidden>
          ⛶
        </span>
      </div>

      <div className={styles.content}>
        <p className={styles.caption}>{caption}</p>

        {data.creatorHandle ? (
          <span className={styles.creator}>@{data.creatorHandle.replace(/^@/, "")}</span>
        ) : null}

        {hasViews || hasEngagement ? (
          <div className={styles.metrics} aria-label="Post performance">
            {hasViews ? <span>{compactNumber(data.viewCount as number)} views</span> : null}
            {hasViews && hasEngagement ? <span aria-hidden>·</span> : null}
            {hasEngagement ? (
              <span>{(data.engagementRate as number).toFixed(1)}% eng</span>
            ) : null}
          </div>
        ) : null}

        <button className={styles.remake} type="button" onClick={() => onRemake(data)}>
          Remake →
        </button>
      </div>
    </article>
  );
}
