import { normalizeInstagramHandle } from "@shared/instagramHandle";

const API_BASE = "https://api.scrapecreators.com";
const POST_COUNT_TIMEOUT_MS = 8_000;
const POST_COUNT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const POST_COUNT_CACHE_MAX_ENTRIES = 500;

export interface InstagramVisiblePostCount {
  count: number;
  estimated: boolean;
  source: "instagram_profile_post_count";
}

type CachedPostCount = {
  expiresAt: number;
  value: InstagramVisiblePostCount;
};

const cache = new Map<string, CachedPostCount>();

function apiKey(): string | null {
  return process.env.SCRAPECREATORS_API_KEY?.trim() || null;
}

function pruneCache(now = Date.now()): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > POST_COUNT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function parseResponse(data: unknown): InstagramVisiblePostCount | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const rawCount = row.media_count;
  const count =
    typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string" && /^\d+$/.test(rawCount)
        ? Number(rawCount)
        : NaN;

  if (!Number.isSafeInteger(count) || count < 0) return null;

  return {
    count,
    estimated: row.is_estimated === true,
    source: "instagram_profile_post_count",
  };
}

async function requestPostCount(
  handle: string,
  allowEstimated: boolean
): Promise<{ status: number; value: InstagramVisiblePostCount | null }> {
  const key = apiKey();
  if (!key) {
    console.warn("[InstagramPostCount] SCRAPECREATORS_API_KEY is not configured");
    return { status: 0, value: null };
  }

  const url = new URL(`${API_BASE}/v1/instagram/profile/post-count`);
  url.searchParams.set("handle", handle);
  url.searchParams.set("allow_estimated", allowEstimated ? "true" : "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POST_COUNT_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: { "x-api-key": key },
      signal: controller.signal,
    });

    let data: unknown = null;
    const text = await response.text();
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    return {
      status: response.status,
      value: response.ok ? parseResponse(data) : null,
    };
  } catch (error) {
    console.warn(
      `[InstagramPostCount] request failed for @${handle}`,
      error instanceof Error ? error.message : String(error)
    );
    return { status: 0, value: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Return the post count shown on the creator's Instagram profile.
 *
 * This intentionally does not reuse edge_owner_to_timeline_media.count from
 * the broader profile payload because that field is not reliable as the
 * creator's lifetime visible post count for every profile shape.
 *
 * ScrapeCreators provides a dedicated endpoint specifically for the count
 * shown on the public profile. Exact values are preferred. If Instagram only
 * exposes an abbreviated value for a very large account, we fall back to the
 * provider's explicit estimated mode and mark the result as estimated.
 */
export async function getInstagramVisiblePostCount(
  rawHandle: string
): Promise<InstagramVisiblePostCount | null> {
  const handle = normalizeInstagramHandle(rawHandle);
  if (!handle) return null;

  const now = Date.now();
  pruneCache(now);

  const cached = cache.get(handle);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const exact = await requestPostCount(handle, false);
  let value = exact.value;

  // The provider documents 422 when only an abbreviated/estimated count is
  // available. Retry explicitly in estimated mode rather than inventing a
  // number or falling back to the ambiguous general-profile field.
  if (!value && exact.status === 422) {
    const estimated = await requestPostCount(handle, true);
    value = estimated.value;
  }

  if (!value) {
    console.warn(
      `[InstagramPostCount] visible post count unavailable for @${handle} (status=${exact.status})`
    );
    return null;
  }

  cache.set(handle, {
    expiresAt: now + POST_COUNT_CACHE_TTL_MS,
    value,
  });
  pruneCache(now);

  return value;
}
