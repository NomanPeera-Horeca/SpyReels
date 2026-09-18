import {
  parseViralPostsInstagramEnabled,
  parseViralPostsLive,
  parseViralPostsPoolRefreshMs,
  parseViralPostsPoolRefresher,
  parseViralPostsTiktokEnabled,
  parseViralPostsYoutubeEnabled,
} from "@shared/viralPosts";

export const isViralPostsLive = parseViralPostsLive(
  process.env.VIRAL_POSTS_LIVE,
  process.env.NODE_ENV
);

export const isViralPostsInstagramEnabled = parseViralPostsInstagramEnabled(
  process.env.VIRAL_POSTS_INSTAGRAM_ENABLED,
  isViralPostsLive
);

export const isViralPostsTiktokEnabled = parseViralPostsTiktokEnabled(
  process.env.VIRAL_POSTS_TIKTOK_ENABLED,
  isViralPostsLive
);

export const isViralPostsYoutubeEnabled = parseViralPostsYoutubeEnabled(
  process.env.VIRAL_POSTS_YOUTUBE_ENABLED,
  isViralPostsLive
);

export const isAnyViralPostsPlatformEnabled =
  isViralPostsInstagramEnabled ||
  isViralPostsTiktokEnabled ||
  isViralPostsYoutubeEnabled;

/** Process-local refresher opt-in. Production web must be false. */
export const isViralPostsPoolRefresherEnabled = parseViralPostsPoolRefresher(
  process.env.VIRAL_POSTS_POOL_REFRESHER
);

export const viralPostsPoolRefreshMs = parseViralPostsPoolRefreshMs(
  process.env.VIRAL_POSTS_POOL_REFRESH_MS
);

if (
  process.env.NODE_ENV === "production" &&
  (process.env.VIRAL_POSTS_LIVE === undefined ||
    process.env.VIRAL_POSTS_LIVE.trim() === "")
) {
  console.warn(
    "[viralPosts] VIRAL_POSTS_LIVE is blank in production; treating as false. Set true or false explicitly."
  );
}
