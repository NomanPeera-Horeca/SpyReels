import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";

export type ProfilePicPlatform = "instagram" | "tiktok" | "youtube";

/**
 * R2 key for a creator's profile avatar. Instagram keeps the legacy
 * handle-only path; TikTok/YouTube are namespaced so same-handle collisions
 * cannot overwrite each other.
 */
export function profilePicR2Key(
  cleanHandle: string,
  platform: ProfilePicPlatform = "instagram"
): string {
  const h = cleanHandle.replace(/^@/, "").trim().toLowerCase();
  if (platform === "instagram") return `profile-pics/${h}.jpg`;
  return `profile-pics/${platform}/${h}.jpg`;
}

/**
 * Ensure the profile image exists on R2 at the stable key. If the object
 * already exists, returns its public URL without re-downloading. Otherwise
 * fetches from `sourcePicUrl` and uploads. Returns "" if there is no source
 * or the download fails.
 */
export async function ensureProfilePicOnR2(
  cleanHandle: string,
  sourcePicUrl: string | null | undefined,
  platform: ProfilePicPlatform = "instagram"
): Promise<string> {
  const key = profilePicR2Key(cleanHandle, platform);
  if (await storageHead(key)) {
    return r2ObjectPublicUrl(key);
  }
  if (!sourcePicUrl) return "";
  try {
    const { gotScraping: gs } = await import("got-scraping");
    const picRes = await gs({
      url: sourcePicUrl,
      responseType: "buffer",
      timeout: { request: 10000 },
      retry: { limit: 0 },
    });
    if (picRes.statusCode === 200 && picRes.rawBody) {
      const { url } = await storagePut(key, picRes.rawBody, "image/jpeg");
      return url;
    }
  } catch {
    // If proxy fails, leave empty — UI uses fallback avatar or caller may keep a prior URL
  }
  return "";
}
