/** Production wiring for lookupPublicProfile: the existing integrations only. */
import { mirrorReelThumbnailsBounded } from "../../discovery/mediaMirror";
import {
  PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS,
  PROFILE_LOOKUP_DEADLINE_MS,
  PROFILE_LOOKUP_MAX_ATTEMPTS,
} from "@shared/personalization/profileLookup";
import {
  InstagramHandleNotFoundError,
  InstagramPrivateAccountError,
  InstagramProviderError,
  resolveInstagramIdentity,
} from "../../instagram";
import { ensureProfilePicOnR2 } from "../../profilePicR2";
import { fetchTikTokProfile } from "../../tiktok";
import { fetchYouTubeChannel } from "../../youtube";
import type { ProfileLookupDeps } from "./profileLookup";

export function classifyLookupError(
  err: unknown
): "not_found" | "private" | "error" | "rate_limited" | "timeout" {
  if (err instanceof InstagramHandleNotFoundError) return "not_found";
  if (err instanceof InstagramPrivateAccountError) return "private";
  if (err instanceof InstagramProviderError) {
    const detail = `${err.detail} ${err.message}`;
    if (err.httpStatus === 429 || /rate.?limit|too many requests/i.test(detail)) return "rate_limited";
    if (
      err.httpStatus === 408 ||
      err.httpStatus === 504 ||
      /timeout|timed out|deadline/i.test(detail)
    ) {
      return "timeout";
    }
    return "error";
  }
  if (err instanceof Error && err.name === "ProfileLookupDeadlineError") return "timeout";
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) return "rate_limited";
  if (/timeout|timed out|deadline|\b408\b/i.test(message)) return "timeout";
  if (/\bprivate\b/i.test(message)) return "private";
  if (/not found|does not exist|no such channel|not accessible/i.test(message)) return "not_found";
  return "error";
}

function boundedCall(call?: {
  timeoutMs?: number;
  maxAttempts?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
}) {
  return {
    timeoutMs: call?.timeoutMs ?? PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS,
    maxAttempts: call?.maxAttempts ?? PROFILE_LOOKUP_MAX_ATTEMPTS,
    deadlineMs: call?.deadlineMs ?? PROFILE_LOOKUP_DEADLINE_MS,
    signal: call?.signal,
  };
}

export function productionLookupDeps(): ProfileLookupDeps {
  return {
    instagram: (handle, call) => resolveInstagramIdentity(handle, boundedCall(call)),
    tiktok: (handle, call) => fetchTikTokProfile(handle, boundedCall(call)),
    youtube: (handle, call) => fetchYouTubeChannel(handle, boundedCall(call)),
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
