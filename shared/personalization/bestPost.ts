/**
 * "Your best Reel" for the mobile 3c screen. Pure, from the stored analysis
 * snapshot only. Nothing is estimated:
 * - needs at least BEST_POST_MIN_POSTS analyzed posts (build plan rule);
 * - the post with the most real views wins (ties: newest);
 * - the follower multiplier appears only when the real follower count is known.
 */
import type { AnalysisSourceSnapshot } from "./model";

export const BEST_POST_MIN_POSTS = 10;

export type BestPost = {
  postId: string;
  url: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  views: number;
  /** views / followers, rounded to one decimal under 10. Null when unknown. */
  followerMultiple: number | null;
};

function firstLine(caption: string | null): string | null {
  if (!caption) return null;
  const line = caption
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l.length > 0);
  if (!line) return null;
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

export function pickBestPost(
  snapshot: AnalysisSourceSnapshot | null | undefined
): BestPost | null {
  if (!snapshot || snapshot.posts.length < BEST_POST_MIN_POSTS) return null;
  let best: AnalysisSourceSnapshot["posts"][number] | null = null;
  for (const p of snapshot.posts) {
    if (typeof p.views !== "number" || !Number.isFinite(p.views) || p.views <= 0)
      continue;
    if (
      !best ||
      p.views > (best.views ?? 0) ||
      (p.views === best.views &&
        (p.publishedAt ?? "") > (best.publishedAt ?? ""))
    )
      best = p;
  }
  if (!best || best.views === null) return null;
  const followers = snapshot.followerCount;
  let followerMultiple: number | null = null;
  if (typeof followers === "number" && followers > 0) {
    const m = best.views / followers;
    followerMultiple = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
  }
  return {
    postId: best.postId,
    url: best.url,
    thumbnailUrl: best.thumbnailUrl ?? null,
    title: firstLine(best.caption),
    views: best.views,
    followerMultiple,
  };
}
