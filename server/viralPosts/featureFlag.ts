import {
  parseViralPostsInstagramEnabled,
  parseViralPostsLive,
  parseViralPostsPoolRefreshMs,
  parseViralPostsPoolRefresher,
} from "@shared/viralPosts";

export const isViralPostsLive = parseViralPostsLive(
  process.env.VIRAL_POSTS_LIVE,
  process.env.NODE_ENV
);

export const isViralPostsInstagramEnabled = parseViralPostsInstagramEnabled(
  process.env.VIRAL_POSTS_INSTAGRAM_ENABLED,
  isViralPostsLive
);

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
