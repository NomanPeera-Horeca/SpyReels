/**
 * Mobile step 2 ("Is this you?"): the compact platform profile card from the
 * approved mobile Figma frames (Instagram 1458:6925, TikTok 1474:4463,
 * YouTube 1474:4832). Shows only the counts the provider returned; a missing
 * count is hidden, never shown as 0. No Follow or Message buttons, no post grid.
 */
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import {
  bioLines,
  displayUrl,
  formatProfileCount,
  formatUnit,
} from "@shared/personalization/publicProfilePreview";
import { VerifiedIcon } from "./VisitorProfile";
import styles from "./MobileProfileCard.module.css";

type Stat = { value: number; label: string };

function presentStats(stats: Array<{ value: number | null; label: string }>): Stat[] {
  return stats.filter((s): s is Stat => typeof s.value === "number" && Number.isFinite(s.value));
}

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return src ? (
    <img
      className={styles.avatar}
      src={src}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
    />
  ) : (
    <span
      className={styles.avatarFallback}
      style={{ width: size, height: size }}
      aria-label={name}
      role="img"
    />
  );
}

function InstagramCard({ profile }: { profile: PublicProfilePreview }) {
  const stats = presentStats([
    { value: profile.postCount, label: "posts" },
    { value: profile.followerCount, label: "followers" },
    { value: profile.followingCount, label: "following" },
  ]);
  const lines = bioLines(profile.bio, 3);
  const link = displayUrl(profile.externalUrl);
  return (
    <article className={styles.card} aria-label={`@${profile.handle} profile`}>
      <div className={styles.igName}>
        <span className={styles.igHandle}>{profile.handle}</span>
        {profile.isVerified ? <VerifiedIcon /> : null}
      </div>
      <div className={styles.igTop}>
        <span className={styles.igRing}>
          <Avatar src={profile.avatarUrl} name={profile.handle} size={88} />
        </span>
        {stats.length ? (
          <dl className={styles.igStats}>
            {stats.map(s => (
              <div key={s.label} className={styles.igStat}>
                <dt className={styles.igStatValue}>{formatProfileCount(s.value)}</dt>
                <dd className={styles.igStatLabel}>{s.label}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {profile.category ? <p className={styles.category}>{profile.category}</p> : null}
      {lines.map(line => (
        <p key={line} className={styles.bioLine}>
          {line}
        </p>
      ))}
      {link ? <p className={styles.link}>{link}</p> : null}
    </article>
  );
}

function TikTokCard({ profile }: { profile: PublicProfilePreview }) {
  const stats = presentStats([
    { value: profile.followingCount, label: "Following" },
    { value: profile.followerCount, label: "Followers" },
    { value: profile.likeCount, label: "Likes" },
  ]);
  const lines = bioLines(profile.bio, 3);
  return (
    <article className={styles.cardCentered} aria-label={`@${profile.handle} profile`}>
      <Avatar src={profile.avatarUrl} name={profile.handle} size={90} />
      {profile.displayName ? <p className={styles.name}>{profile.displayName}</p> : null}
      <p className={styles.handle}>@{profile.handle}</p>
      {stats.length ? (
        <dl className={styles.ttStats}>
          {stats.map(s => (
            <div key={s.label} className={styles.ttStat}>
              <dt className={styles.ttStatValue}>{formatProfileCount(s.value)}</dt>
              <dd className={styles.ttStatLabel}>{s.label}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {lines.map(line => (
        <p key={line} className={styles.bioCentered}>
          {line}
        </p>
      ))}
    </article>
  );
}

function YouTubeCard({ profile }: { profile: PublicProfilePreview }) {
  const counts: string[] = [];
  if (typeof profile.followerCount === "number") {
    counts.push(formatUnit(profile.followerCount, "subscriber", "subscribers"));
  }
  if (typeof profile.videoCount === "number") {
    counts.push(formatUnit(profile.videoCount, "video", "videos"));
  }
  const description = bioLines(profile.bio, 2).join(" ");
  return (
    <article className={styles.cardYouTube} aria-label={`@${profile.handle} channel`}>
      <div className={styles.ytDark}>
        <div className={styles.ytHead}>
          <Avatar src={profile.avatarUrl} name={profile.handle} size={72} />
          <div className={styles.ytIdentity}>
            {profile.displayName ? <p className={styles.ytName}>{profile.displayName}</p> : null}
            <p className={styles.ytHandle}>@{profile.handle}</p>
            {counts.length ? <p className={styles.ytCounts}>{counts.join(" • ")}</p> : null}
          </div>
        </div>
        {description ? <p className={styles.ytDescription}>{description}</p> : null}
      </div>
    </article>
  );
}

export function MobileProfileCard({ profile }: { profile: PublicProfilePreview }) {
  if (profile.platform === "instagram") return <InstagramCard profile={profile} />;
  if (profile.platform === "tiktok") return <TikTokCard profile={profile} />;
  return <YouTubeCard profile={profile} />;
}
