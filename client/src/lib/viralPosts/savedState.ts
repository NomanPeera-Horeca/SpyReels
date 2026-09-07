import type { ViralPost } from "@shared/viralPosts";
import {
  applyViralPostSavedOverrides,
  viralPostCanonicalKeyFromPost,
} from "@shared/viralPosts";
import type { trpc } from "@/lib/trpc";

type ViralPostsUtils = ReturnType<typeof trpc.useUtils>["viralPosts"];

/** Keep Explore / Saved / For You save flags consistent after a toggle. */
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

export function viralPostSaveOverrideKey(post: {
  id: string;
  platform?: string | null;
  sourceId?: string | null;
}): string {
  const key = viralPostCanonicalKeyFromPost(post);
  return key.endsWith(":") ? post.id : key;
}

export function withViralPostSavedOverrides(
  posts: ViralPost[],
  savedOverrides: Record<string, boolean>
): ViralPost[] {
  return applyViralPostSavedOverrides(posts, savedOverrides);
}

export function patchSavedFlagInPosts(
  posts: ViralPost[],
  post: Pick<ViralPost, "id" | "platform" | "sourceId">,
  saved: boolean
): ViralPost[] {
  const key = viralPostCanonicalKeyFromPost(post);
  return posts.map((item) => {
    if (item.id === post.id) return { ...item, saved };
    if (key && !key.endsWith(":") && viralPostCanonicalKeyFromPost(item) === key) {
      return { ...item, saved };
    }
    return item;
  });
}
