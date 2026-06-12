import { ensureProfilePicOnR2 } from "../profilePicR2";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";

/** Upload reel thumbnails to R2 with bounded concurrency (mirrors scrape job). */
export async function mirrorReelThumbnailsBounded(
  items: Array<{ shortcode: string; thumbnailUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i]!;
        const stable = await ensureReelThumbnailOnR2(
          item.shortcode,
          item.thumbnailUrl ?? ""
        );
        out.set(item.shortcode, stable);
      }
    })
  );
  return out;
}

/** Mirror profile avatars to R2 with bounded concurrency (mirrors scrape job). */
export async function mirrorProfilePicsBounded(
  items: Array<{ username: string; profilePicUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i]!;
        const stable = await ensureProfilePicOnR2(
          item.username,
          item.profilePicUrl ?? ""
        );
        out.set(item.username.toLowerCase(), stable);
      }
    })
  );
  return out;
}
