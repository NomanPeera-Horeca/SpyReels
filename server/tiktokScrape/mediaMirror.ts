import { ensureTiktokThumbnailOnR2 } from "../tiktokThumbnailR2";

/** Upload TikTok video thumbnails to R2 with bounded concurrency. */
export async function mirrorTiktokThumbnailsBounded(
  items: Array<{ awemeId: string; thumbnailUrl: string }>,
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
        const stable = await ensureTiktokThumbnailOnR2(
          item.awemeId,
          item.thumbnailUrl ?? ""
        );
        out.set(item.awemeId, stable);
      }
    })
  );
  return out;
}
