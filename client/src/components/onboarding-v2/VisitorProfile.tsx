/**
 * Step 2 "Is this you?" visitor views (Figma "Visitor profile / instagram",
 * "/ tiktok", "/ youtube"; frames 1191:4584, 1191:4722, 1191:4765).
 *
 * They imitate each platform's own public profile screen so the creator
 * recognizes it, which is why the platform skin colors in the CSS module
 * are the platforms' colors and not SpyReels tokens.
 *
 * Data rules: only what the provider returned is shown. Missing counts are
 * hidden, missing post thumbnails render as plain tiles with no numbers,
 * and nothing (highlights, pinned badges, Threads pill) is invented.
 */
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import {
  bioLines,
  displayUrl,
  formatProfileCount,
  formatUnit,
  formatViewCount,
} from "@shared/personalization/publicProfilePreview";
import styles from "./VisitorProfile.module.css";

const GRID_TILES = 6;

function Avatar({ url, className }: { url: string | null; className: string }) {
  return url ? (
    <img className={className} src={url} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className={className} />
  );
}

function gridTiles(profile: PublicProfilePreview) {
  const posts = profile.recentPosts.slice(0, GRID_TILES);
  const tiles: Array<PublicProfilePreview["recentPosts"][number] | null> = [...posts];
  while (tiles.length < GRID_TILES) tiles.push(null);
  return tiles;
}

/* ---------- Instagram ---------- */

export function InstagramVisitorProfile({
  profile,
  hideBack = false,
}: {
  profile: PublicProfilePreview;
  hideBack?: boolean;
}) {
  const lines = bioLines(profile.bio);
  const link = displayUrl(profile.externalUrl);
  const stats: Array<[number | null, string]> = [
    [profile.postCount, "posts"],
    [profile.followerCount, "followers"],
    [profile.followingCount, "following"],
  ];
  return (
    <div className={[styles.screen, styles.ig].join(" ")} data-platform="instagram">
      <div className={styles.igTop}>
        {hideBack ? <span className={styles.icon22} /> : <IgBackIcon />}
        <span className={styles.igUsername}>{profile.handle}</span>
        {profile.isVerified ? <VerifiedIcon /> : null}
        <span className={styles.flexSpacer} />
        <MoreIcon color="black" />
      </div>

      <div className={styles.igHeader}>
        <span className={styles.igRing}>
          <Avatar url={profile.avatarUrl} className={styles.igAvatar} />
        </span>
        <div className={styles.igHeaderRight}>
          {profile.displayName ? (
            <span className={styles.igName}>{profile.displayName}</span>
          ) : null}
          <div className={styles.igStats}>
            {stats.map(([value, label]) =>
              value === null ? null : (
                <span key={label} className={styles.igStat}>
                  <span className={styles.igStatValue}>{formatProfileCount(value)}</span>
                  <span className={styles.igStatLabel}>{label}</span>
                </span>
              )
            )}
          </div>
        </div>
      </div>

      <div className={styles.igBio}>
        {profile.category ? (
          <span className={styles.igCategory}>{profile.category}</span>
        ) : null}
        {lines.map((line, i) => (
          <span key={i} className={styles.igBioLine}>
            {line}
          </span>
        ))}
        {link ? (
          <span className={styles.igLink}>
            <LinkIcon />
            <span>{link}</span>
          </span>
        ) : null}
      </div>

      <div className={styles.igButtons} aria-hidden>
        <span className={[styles.igButton, styles.igFollow].join(" ")}>Follow</span>
        <span className={[styles.igButton, styles.igSecondary].join(" ")}>Message</span>
        <span className={[styles.igButton, styles.igSecondary, styles.igSmall].join(" ")}>
          ▾
        </span>
      </div>

      <div className={styles.igTabs} aria-hidden>
        <span className={styles.igTab}>
          <IgGridIcon />
        </span>
        <span className={styles.igTab}>
          <IgReelsIcon />
        </span>
        <span className={styles.igTab}>
          <IgRepostIcon />
        </span>
        <span className={styles.igTab}>
          <IgTaggedIcon />
        </span>
        <span className={styles.igTabUnderline} />
      </div>

      <PostGrid profile={profile} tileClass={styles.igTile} viewsIcon={<EyeIcon />} />
    </div>
  );
}

/* ---------- TikTok ---------- */

export function TikTokVisitorProfile({
  profile,
  hideBack = false,
}: {
  profile: PublicProfilePreview;
  hideBack?: boolean;
}) {
  const lines = bioLines(profile.bio, 3);
  const stats: Array<[number | null, string]> = [
    [profile.followingCount, "Following"],
    [profile.followerCount, "Followers"],
    [profile.likeCount, "Likes"],
  ].filter(([v]) => v !== null) as Array<[number, string]>;
  return (
    <div className={[styles.screen, styles.tt].join(" ")} data-platform="tiktok">
      <div className={styles.ttTop}>
        {hideBack ? <span className={styles.icon22} /> : <TtBackIcon />}
        <span className={styles.flexSpacer} />
        <TtBellIcon />
        <TtShareIcon />
      </div>
      <Avatar url={profile.avatarUrl} className={styles.ttAvatar} />
      {profile.displayName ? (
        <span className={styles.ttName}>{profile.displayName}</span>
      ) : null}
      <span className={styles.ttHandle}>@{profile.handle}</span>
      {stats.length ? (
        <div className={styles.ttStats}>
          {stats.map(([value, label]) => (
            <span key={label} className={styles.ttStat}>
              <span className={styles.ttStatValue}>{formatProfileCount(value as number)}</span>
              <span className={styles.ttStatLabel}>{label}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.ttButtons} aria-hidden>
        <span className={[styles.ttButton, styles.ttFollow].join(" ")}>Follow</span>
        <span className={[styles.ttButton, styles.ttSecondary].join(" ")}>Message</span>
        <span className={[styles.ttButton, styles.ttSecondary, styles.ttSmall].join(" ")}>
          ▾
        </span>
      </div>
      {lines.length ? (
        <div className={styles.ttBio}>
          {lines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      ) : null}
      <div className={styles.ttTabs} aria-hidden>
        <span className={styles.ttTab}>
          <TtGridIcon />
        </span>
        <span className={styles.ttTab}>
          <TtRepostIcon />
        </span>
        <span className={styles.ttTabUnderline} />
      </div>
      <PostGrid
        profile={profile}
        tileClass={styles.ttTile}
        viewsIcon={<TtPlayIcon />}
        showPinned
      />
    </div>
  );
}

/* ---------- YouTube ---------- */

export function YouTubeVisitorProfile({
  profile,
  hideBack = false,
}: {
  profile: PublicProfilePreview;
  hideBack?: boolean;
}) {
  const meta = [
    profile.followerCount !== null
      ? formatUnit(profile.followerCount, "subscriber", "subscribers")
      : null,
    profile.videoCount !== null ? formatUnit(profile.videoCount, "video", "videos") : null,
  ].filter(Boolean);
  const description = profile.bio?.replace(/\s+/g, " ").trim() || null;
  return (
    <div className={[styles.screen, styles.yt].join(" ")} data-platform="youtube">
      <div className={styles.ytTop}>
        {hideBack ? <span className={styles.icon22} /> : <YtBackIcon />}
        <span className={styles.flexSpacer} />
        <YtSearchIcon />
        <MoreIcon color="white" />
      </div>
      {profile.bannerUrl ? (
        <img className={styles.ytBanner} src={profile.bannerUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className={styles.ytBanner} />
      )}
      <div className={styles.ytHeader}>
        <Avatar url={profile.avatarUrl} className={styles.ytAvatar} />
        <div className={styles.ytHeaderText}>
          {profile.displayName ? (
            <span className={styles.ytName}>{profile.displayName}</span>
          ) : null}
          <span className={styles.ytHandle}>@{profile.handle}</span>
          {meta.length ? <span className={styles.ytMeta}>{meta.join(" • ")}</span> : null}
        </div>
      </div>
      {description ? <p className={styles.ytDescription}>{description}</p> : null}
      <span className={styles.ytSubscribe} aria-hidden>
        Subscribe
      </span>
      <div className={styles.ytTabs} aria-hidden>
        <span>Home</span>
        <span className={styles.ytTabActive}>Shorts</span>
        <span>Playlists</span>
        <span>Posts</span>
      </div>
      <div className={styles.ytChips} aria-hidden>
        <span className={[styles.ytChip, styles.ytChipActive].join(" ")}>Latest</span>
        <span className={styles.ytChip}>Popular</span>
        <span className={styles.ytChip}>Oldest</span>
      </div>
      <PostGrid profile={profile} tileClass={styles.ytTile} viewsSuffix=" views" />
      <nav className={styles.ytNav} aria-hidden>
        <span className={styles.ytNavItem}>
          <YtHomeIcon />
          <span>Home</span>
        </span>
        <span className={styles.ytNavItem}>
          <YtShortsIcon />
          <span>Shorts</span>
        </span>
        <span className={styles.ytNavItem}>
          <span className={styles.ytCreate}>
            <YtPlusIcon />
          </span>
        </span>
        <span className={styles.ytNavItem}>
          <YtSubsIcon />
          <span>Subscriptions</span>
        </span>
        <span className={styles.ytNavItem}>
          <span className={styles.ytYou} />
          <span>You</span>
        </span>
      </nav>
    </div>
  );
}

/* ---------- Shared grid ---------- */

function PostGrid({
  profile,
  tileClass,
  viewsIcon,
  viewsSuffix = "",
  showPinned = false,
}: {
  profile: PublicProfilePreview;
  tileClass: string;
  viewsIcon?: React.ReactNode;
  viewsSuffix?: string;
  showPinned?: boolean;
}) {
  return (
    <div className={styles.grid}>
      {gridTiles(profile).map((post, i) => (
        <span key={post?.id ?? `empty-${i}`} className={[styles.tile, tileClass].join(" ")}>
          {post?.thumbnailUrl ? (
            <img
              className={styles.tileImage}
              src={post.thumbnailUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {showPinned && post?.isPinned ? <span className={styles.ttPinned}>Pinned</span> : null}
          {post && post.viewCount !== null ? (
            <span className={styles.tileViews}>
              {viewsIcon}
              <span>
                {formatViewCount(post.viewCount)}
                {viewsSuffix}
              </span>
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/* ---------- Icons (exported from the Figma frames, unchanged) ---------- */

function IgBackIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M18.3334 11.0002H4.58335M10.0834 4.5835L3.66669 11.0002L10.0834 17.4168" stroke="black" strokeWidth="1.83333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const TtBackIcon = IgBackIcon;

export function VerifiedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Verified" role="img">
      <path d="M7.99999 1L9.73333 2.33333L11.9333 2.13333L12.6 4.2L14.4667 5.4L13.8 7.46667L14.4667 9.53333L12.6 10.7333L11.9333 12.8L9.73333 12.6L7.99999 13.9333L6.26666 12.6L4.06666 12.8L3.39999 10.7333L1.53333 9.53333L2.19999 7.46667L1.53333 5.4L3.39999 4.2L4.06666 2.13333L6.26666 2.33333L7.99999 1Z" fill="#0095F6" />
      <path d="M5.33337 8.2L7.06671 9.93333L10.8667 6" stroke="white" strokeWidth="1.46667" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon({ color }: { color: "black" | "white" }) {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 6.41667C12.0125 6.41667 12.8333 5.59586 12.8333 4.58333C12.8333 3.57081 12.0125 2.75 11 2.75C9.98744 2.75 9.16663 3.57081 9.16663 4.58333C9.16663 5.59586 9.98744 6.41667 11 6.41667Z" fill={color} />
      <path d="M11 12.8332C12.0125 12.8332 12.8333 12.0124 12.8333 10.9998C12.8333 9.98732 12.0125 9.1665 11 9.1665C9.98744 9.1665 9.16663 9.98732 9.16663 10.9998C9.16663 12.0124 9.98744 12.8332 11 12.8332Z" fill={color} />
      <path d="M11 19.2502C12.0125 19.2502 12.8333 18.4294 12.8333 17.4168C12.8333 16.4043 12.0125 15.5835 11 15.5835C9.98744 15.5835 9.16663 16.4043 9.16663 17.4168C9.16663 18.4294 9.98744 19.2502 11 19.2502Z" fill={color} />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M5.83331 8.16646C6.05043 8.38693 6.30922 8.56201 6.59464 8.68151C6.88005 8.80102 7.18639 8.86256 7.49581 8.86256C7.80524 8.86256 8.11157 8.80102 8.39699 8.68151C8.6824 8.56201 8.9412 8.38693 9.15831 8.16646L10.9083 6.41646C11.3492 5.97554 11.5969 5.37752 11.5969 4.75396C11.5969 4.1304 11.3492 3.53238 10.9083 3.09146C10.4674 2.65054 9.86937 2.40283 9.24581 2.40283C8.62225 2.40283 8.02423 2.65054 7.58331 3.09146L6.99998 3.6748M8.16664 5.83313C7.94953 5.61266 7.69073 5.43758 7.40532 5.31808C7.1199 5.19857 6.81357 5.13703 6.50414 5.13703C6.19472 5.13703 5.88839 5.19857 5.60297 5.31808C5.31756 5.43758 5.05876 5.61266 4.84165 5.83313L3.09165 7.58313C2.65072 8.02405 2.40302 8.62207 2.40302 9.24563C2.40302 9.86919 2.65072 10.4672 3.09165 10.9081C3.53257 11.3491 4.13059 11.5968 4.75414 11.5968C5.3777 11.5968 5.97572 11.3491 6.41664 10.9081L6.99998 10.3248" stroke="#3D52D5" strokeWidth="1.16667" strokeLinecap="round" />
    </svg>
  );
}

function IgGridIcon() {
  const cells = [
    [2.75, 2.75], [8.70831, 2.75], [14.6667, 2.75],
    [2.75, 8.7085], [8.70831, 8.7085], [14.6667, 8.7085],
    [2.75, 14.6665], [8.70831, 14.6665], [14.6667, 14.6665],
  ];
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="4.58333" height="4.58333" rx="0.916667" fill="black" />
      ))}
    </svg>
  );
}

function IgReelsIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M14.6667 2.75H7.33333C4.80203 2.75 2.75 4.80203 2.75 7.33333V14.6667C2.75 17.198 4.80203 19.25 7.33333 19.25H14.6667C17.198 19.25 19.25 17.198 19.25 14.6667V7.33333C19.25 4.80203 17.198 2.75 14.6667 2.75Z" stroke="#8E8E8E" strokeWidth="1.65" />
      <path d="M9.16663 7.7915V14.2082L14.6666 10.9998L9.16663 7.7915Z" stroke="#8E8E8E" strokeWidth="1.46667" strokeLinejoin="round" />
    </svg>
  );
}

function IgRepostIcon({ color = "#8E8E8E" }: { color?: string }) {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M15.5833 8.25L18.3333 5.5L15.5833 2.75M18.3333 5.5H8.24996C7.2775 5.5 6.34487 5.88631 5.65723 6.57394C4.9696 7.26158 4.58329 8.19421 4.58329 9.16667V10.0833M6.41663 13.75L3.66663 16.5L6.41663 19.25M3.66663 16.5H13.75C14.7224 16.5 15.6551 16.1137 16.3427 15.4261C17.0303 14.7384 17.4166 13.8058 17.4166 12.8333V11.9167" stroke={color} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IgTaggedIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M15.5833 2.75H6.41667C4.39162 2.75 2.75 4.39162 2.75 6.41667V15.5833C2.75 17.6084 4.39162 19.25 6.41667 19.25H15.5833C17.6084 19.25 19.25 17.6084 19.25 15.5833V6.41667C19.25 4.39162 17.6084 2.75 15.5833 2.75Z" stroke="#8E8E8E" strokeWidth="1.65" />
      <path d="M11 11.9165C12.5188 11.9165 13.75 10.6853 13.75 9.1665C13.75 7.64772 12.5188 6.4165 11 6.4165C9.48122 6.4165 8.25 7.64772 8.25 9.1665C8.25 10.6853 9.48122 11.9165 11 11.9165Z" stroke="#8E8E8E" strokeWidth="1.65" />
      <path d="M5.95837 17.4168C6.87504 15.1252 8.70837 14.2085 11 14.2085C13.2917 14.2085 15.125 15.1252 16.0417 17.4168" stroke="#8E8E8E" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1.16669 7.00016C1.16669 7.00016 3.20835 3.2085 7.00002 3.2085C10.7917 3.2085 12.8334 7.00016 12.8334 7.00016C12.8334 7.00016 10.7917 10.7918 7.00002 10.7918C3.20835 10.7918 1.16669 7.00016 1.16669 7.00016Z" stroke="white" strokeWidth="1.28333" />
      <path d="M7 8.75C7.9665 8.75 8.75 7.9665 8.75 7C8.75 6.0335 7.9665 5.25 7 5.25C6.0335 5.25 5.25 6.0335 5.25 7C5.25 7.9665 6.0335 8.75 7 8.75Z" fill="white" />
    </svg>
  );
}

function TtBellIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M5.50008 9.1665C5.50008 7.70781 6.07954 6.30887 7.11099 5.27742C8.14244 4.24597 9.54139 3.6665 11.0001 3.6665C12.4588 3.6665 13.8577 4.24597 14.8892 5.27742C15.9206 6.30887 16.5001 7.70781 16.5001 9.1665C16.5001 12.8332 17.8751 14.2082 18.3334 14.6665H3.66675C4.12508 14.2082 5.50008 12.8332 5.50008 9.1665Z" stroke="black" strokeWidth="1.65" strokeLinejoin="round" />
      <path d="M9.16675 17.4165C9.16675 17.9027 9.3599 18.369 9.70372 18.7129C10.0475 19.0567 10.5139 19.2498 11.0001 19.2498C11.4863 19.2498 11.9526 19.0567 12.2964 18.7129C12.6403 18.369 12.8334 17.9027 12.8334 17.4165" stroke="black" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

function TtShareIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11.9167 4.5835L19.25 11.0002L11.9167 17.4168V13.7502C7.33333 13.7502 4.58333 15.1252 2.75 18.3335C3.20833 13.2918 5.95833 9.62516 11.9167 9.16683V4.5835Z" stroke="black" strokeWidth="1.65" strokeLinejoin="round" />
    </svg>
  );
}

function TtGridIcon() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden>
      <path d="M5.83325 3.6665V9.1665M11.3333 3.6665V9.1665M16.8333 3.6665V9.1665M5.83325 12.8332V18.3332M11.3333 12.8332V18.3332M16.8333 12.8332V18.3332" stroke="black" strokeWidth="2.01667" strokeLinecap="round" />
      <path d="M21.4167 9.1665L24.1667 11.9165L26.9167 9.1665" fill="black" />
    </svg>
  );
}

function TtRepostIcon() {
  return <IgRepostIcon color="#8A8B91" />;
}

function TtPlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M3.25 2.1665L10.8333 6.49984L3.25 10.8332V2.1665Z" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function YtBackIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M18.3334 11.0002H4.58341M10.0834 4.5835L3.66675 11.0002L10.0834 17.4168" stroke="white" strokeWidth="1.83333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function YtSearchIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M9.62484 15.5832C12.9155 15.5832 15.5832 12.9155 15.5832 9.62484C15.5832 6.33414 12.9155 3.6665 9.62484 3.6665C6.33414 3.6665 3.6665 6.33414 3.6665 9.62484C3.6665 12.9155 6.33414 15.5832 9.62484 15.5832Z" stroke="white" strokeWidth="1.83333" />
      <path d="M14.2085 14.2085L19.2502 19.2502" stroke="white" strokeWidth="1.83333" strokeLinecap="round" />
    </svg>
  );
}

function YtHomeIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M3.66675 9.1665L11.0001 3.6665L18.3334 9.1665V18.3332H13.7501V12.8332H8.25008V18.3332H3.66675V9.1665Z" stroke="white" strokeWidth="1.65" strokeLinejoin="round" />
    </svg>
  );
}

function YtShortsIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M14.6667 2.75H7.33333C4.80203 2.75 2.75 4.80203 2.75 7.33333V14.6667C2.75 17.198 4.80203 19.25 7.33333 19.25H14.6667C17.198 19.25 19.25 17.198 19.25 14.6667V7.33333C19.25 4.80203 17.198 2.75 14.6667 2.75Z" stroke="white" strokeWidth="1.65" />
      <path d="M9.1665 7.7915V14.2082L14.6665 10.9998L9.1665 7.7915Z" stroke="white" strokeWidth="1.46667" strokeLinejoin="round" />
    </svg>
  );
}

function YtPlusIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 5.5V16.5M5.5 11H16.5" stroke="white" strokeWidth="1.83333" strokeLinecap="round" />
    </svg>
  );
}

function YtSubsIcon() {
  return (
    <svg className={styles.icon22} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M17.4167 6.4165H4.58333C3.57081 6.4165 2.75 7.23732 2.75 8.24984V16.4998C2.75 17.5124 3.57081 18.3332 4.58333 18.3332H17.4167C18.4292 18.3332 19.25 17.5124 19.25 16.4998V8.24984C19.25 7.23732 18.4292 6.4165 17.4167 6.4165Z" stroke="white" strokeWidth="1.65" />
      <path d="M5.5 3.6665H16.5M9.625 10.0832V14.6665L13.2917 12.3748L9.625 10.0832Z" stroke="white" strokeWidth="1.46667" strokeLinejoin="round" />
    </svg>
  );
}
