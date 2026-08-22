/**
 * Harden discovery media mirroring so R2/fetch cannot hang indefinitely.
 * Viral Posts skips this path entirely (skipMediaMirroring); this protects /discovery.
 */
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";
import { ensureReelVideoOnR2 } from "../reelVideoR2";

const MIRROR_ITEM_TIMEOUT_MS = 12_000;
const MIRROR_OVERALL_BUDGET_MS = 45_000;

async function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[discovery.media] TIMEOUT ${ms}ms: ${label}`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } catch (err) {
    console.error(`[discovery.media] FAIL ${label}`, err);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Upload reel thumbnails to R2 with bounded concurrency (mirrors scrape job). */
export async function mirrorReelThumbnailsBounded(
  items: Array<{ shortcode: string; thumbnailUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;
  const started = Date.now();

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        if (Date.now() - started > MIRROR_OVERALL_BUDGET_MS) {
          const i = next++;
          const item = items[i];
          if (item) out.set(item.shortcode, item.thumbnailUrl ?? "");
          continue;
        }
        const i = next++;
        const item = items[i]!;
        const stable = await withTimeout(
          `thumb:${item.shortcode}`,
          MIRROR_ITEM_TIMEOUT_MS,
          () =>
            ensureReelThumbnailOnR2(item.shortcode, item.thumbnailUrl ?? ""),
          item.thumbnailUrl ?? ""
        );
        out.set(item.shortcode, stable);
      }
    })
  );
  return out;
}

/** Upload reel videos to R2 with bounded concurrency (mirrors scrape job). */
export async function mirrorReelVideosBounded(
  items: Array<{ shortcode: string; videoUrl: string }>,
  concurrency = 2
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;
  const started = Date.now();

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        if (Date.now() - started > MIRROR_OVERALL_BUDGET_MS) {
          next++;
          continue;
        }
        const i = next++;
        const item = items[i]!;
        const stable = await withTimeout(
          `video:${item.shortcode}`,
          MIRROR_ITEM_TIMEOUT_MS,
          () => ensureReelVideoOnR2(item.shortcode, item.videoUrl ?? ""),
          ""
        );
        if (stable.trim()) {
          out.set(item.shortcode, stable);
        }
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
  const started = Date.now();

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        if (Date.now() - started > MIRROR_OVERALL_BUDGET_MS) {
          const i = next++;
          const item = items[i];
          if (item) {
            out.set(item.username.toLowerCase(), item.profilePicUrl ?? "");
          }
          continue;
        }
        const i = next++;
        const item = items[i]!;
        const stable = await withTimeout(
          `avatar:${item.username}`,
          MIRROR_ITEM_TIMEOUT_MS,
          () =>
            ensureProfilePicOnR2(item.username, item.profilePicUrl ?? ""),
          item.profilePicUrl ?? ""
        );
        out.set(item.username.toLowerCase(), stable);
      }
    })
  );
  return out;
}
