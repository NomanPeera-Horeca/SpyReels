/** Production wiring for lookupPublicProfile: the existing integrations only. */
import { mirrorReelThumbnailsBounded } from "../../discovery/mediaMirror";
import {
  InstagramHandleNotFoundError,
  InstagramPrivateAccountError,
  resolveInstagramIdentity,
} from "../../instagram";
import { ensureProfilePicOnR2 } from "../../profilePicR2";
import { fetchTikTokProfile } from "../../tiktok";
import { fetchYouTubeChannel } from "../../youtube";
import type { ProfileLookupDeps } from "./profileLookup";

export function classifyLookupError(err: unknown): "not_found" | "private" | "error" {
  if (err instanceof InstagramHandleNotFoundError) return "not_found";
  if (err instanceof InstagramPrivateAccountError) return "private";
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/\bprivate\b/i.test(message)) return "private";
  if (/not found|does not exist|no such channel|not accessible/i.test(message)) return "not_found";
  return "error";
}

export function productionLookupDeps(): ProfileLookupDeps {
  return {
    instagram: handle => resolveInstagramIdentity(handle),
    tiktok: handle => fetchTikTokProfile(handle),
    youtube: handle => fetchYouTubeChannel(handle),
    mirrorAvatar: async (handle, url, platform) => {
      try {
        return await ensureProfilePicOnR2(handle, url, platform);
      } catch {
        return url;
      }
    },
    mirrorThumbnails: items => mirrorReelThumbnailsBounded(items, 6),
    classify: classifyLookupError,
  };
}
