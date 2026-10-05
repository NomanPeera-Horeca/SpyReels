import type { ReactNode } from "react";
import styles from "./FinderProfilePreview.module.css";

export type FinderProfilePreviewData = {
  username: string;
  displayName?: string;
  biography?: string;
  profilePicUrl?: string;
  isVerified?: boolean;
  isPrivate?: boolean;
  /** Platform-specific meta line (followers / videos / etc.) */
  meta: ReactNode;
};

type FinderProfilePreviewProps = {
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  errorId?: string;
  profile?: FinderProfilePreviewData | null;
  testId?: string;
  actionLabel?: string;
  privateActionLabel?: string;
  continueAriaLabel?: (username: string) => string;
  onContinue?: (username: string) => void;
};

export function formatFinderCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return Math.round(value).toLocaleString();
}

export function FinderProfilePreview({
  loading = false,
  loadingLabel = "Looking up profile…",
  error = null,
  errorId,
  profile = null,
  testId,
  actionLabel = "Continue →",
  privateActionLabel = "Private account",
  continueAriaLabel,
  onContinue,
}: FinderProfilePreviewProps) {
  return (
    <>
      {loading ? <div className={styles.loading}>{loadingLabel}</div> : null}
      {error && !loading ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {profile ? (
        <button
          type="button"
          className={styles.card}
          data-testid={testId}
          disabled={Boolean(profile.isPrivate)}
          onClick={() => {
            if (profile.isPrivate) return;
            onContinue?.(profile.username);
          }}
          aria-label={
            continueAriaLabel?.(profile.username) ??
            `Continue with @${profile.username}`
          }
        >
          <span className={styles.avatarWrap}>
            {profile.profilePicUrl ? (
              <img
                className={styles.avatar}
                src={profile.profilePicUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className={styles.avatarFallback}>@</span>
            )}
          </span>
          <span className={styles.text}>
            <span className={styles.nameRow}>
              <strong>@{profile.username}</strong>
              {profile.isVerified ? <span className={styles.verified}>✓</span> : null}
              {profile.isPrivate ? (
                <span className={styles.privateBadge}>Private</span>
              ) : null}
            </span>
            {profile.displayName ? <span>{profile.displayName}</span> : null}
            {profile.biography ? (
              <span className={styles.bio}>{profile.biography}</span>
            ) : null}
            <span className={styles.stats}>{profile.meta}</span>
          </span>
          <span className={styles.action}>
            {profile.isPrivate ? privateActionLabel : actionLabel}
          </span>
        </button>
      ) : null}
    </>
  );
}
