import type { ViralPost } from "@shared/viralPosts";
import type { trpc } from "@/lib/trpc";

type ViralPostsUtils = ReturnType<typeof trpc.useUtils>["viralPosts"];

/** Keep For You / Explore / Saved save flags consistent after a toggle. */
export async function invalidateViralPostsSaveQueries(
  utils: ViralPostsUtils
): Promise<void> {
  await Promise.all([
    utils.browse.invalidate(),
    utils.search.invalidate(),
    utils.getSaved.invalidate(),
    utils.getFeedHistory.invalidate(),
  ]);
}

export function patchSavedFlagInPosts(
  posts: ViralPost[],
  postId: string,
  saved: boolean
): ViralPost[] {
  return posts.map((item) =>
    item.id === postId ? { ...item, saved } : item
  );
}
