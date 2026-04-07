/**
 * Instagram Reels scraper using the i.instagram.com mobile API.
 * Uses got-scraping which has built-in browser TLS fingerprint impersonation
 * to bypass Instagram's TLS-based rate limiting of Node.js requests.
 *
 * Strategy:
 * 1. web_profile_info → get userId + check if account is public
 * 2. clips/user/ POST → paginate through ALL Reels (clips) with max_id cursor
 */

import { gotScraping } from "got-scraping";

const MOBILE_USER_AGENT =
  "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)";
const MOBILE_X_IG_APP_ID = "567067343352427";

export interface ReelData {
  shortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  reelUrl: string;
  duration: number;
  postedAt: Date;
  ownerUsername: string;
}

/* ------------------------------------------------------------------ */
/*  Low-level helpers                                                  */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Execute a GET request via got-scraping and return parsed JSON + HTTP status. */
async function igGet(url: string): Promise<{ status: number; data: any }> {
  try {
    const res = await gotScraping({
      url,
      method: "GET",
      headers: {
        "User-Agent": MOBILE_USER_AGENT,
        "X-IG-App-ID": MOBILE_X_IG_APP_ID,
      },
      timeout: { request: 30000 },
      retry: { limit: 0 },
    });

    let data = null;
    if (res.body?.trim()) {
      try {
        data = JSON.parse(res.body);
      } catch {
        data = res.body;
      }
    }

    return { status: res.statusCode, data };
  } catch (error: any) {
    if (error.response) {
      return { status: error.response.statusCode, data: null };
    }
    throw new Error(`Instagram GET failed: ${error.message}`);
  }
}

/** Execute a POST request with form-encoded body via got-scraping. */
async function igPost(
  url: string,
  formBody: string
): Promise<{ status: number; data: any }> {
  try {
    const res = await gotScraping({
      url,
      method: "POST",
      headers: {
        "User-Agent": MOBILE_USER_AGENT,
        "X-IG-App-ID": MOBILE_X_IG_APP_ID,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
      timeout: { request: 30000 },
      retry: { limit: 0 },
    });

    let data = null;
    if (res.body?.trim()) {
      try {
        data = JSON.parse(res.body);
      } catch {
        data = res.body;
      }
    }

    return { status: res.statusCode, data };
  } catch (error: any) {
    if (error.response) {
      return { status: error.response.statusCode, data: null };
    }
    throw new Error(`Instagram POST failed: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Profile lookup                                                     */
/* ------------------------------------------------------------------ */

export interface ProfileInfo {
  userId: string;
  username: string;
  isPrivate: boolean;
  followerCount: number;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  postCount: number;
  followingCount: number;
  isVerified: boolean;
  category: string;
  externalUrl: string;
}

export async function fetchProfile(handle: string): Promise<ProfileInfo> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanHandle)}`;

  const { status, data } = await igGet(url);

  if (status === 404) {
    throw new Error(
      `User "@${cleanHandle}" not found. Please check the username and try again.`
    );
  }
  if (status === 429) {
    throw new Error(
      `Instagram rate limit reached. Please wait a few minutes and try again.`
    );
  }
  if (status !== 200 || !data) {
    throw new Error(
      `Failed to fetch profile for "@${cleanHandle}": HTTP ${status}`
    );
  }

  const user = data?.data?.user;
  if (!user) {
    throw new Error(
      `User "@${cleanHandle}" not found or the profile is not accessible.`
    );
  }

  return {
    userId: user.id,
    username: user.username,
    isPrivate: user.is_private,
    followerCount: user.edge_followed_by?.count || user.follower_count || 0,
    fullName: user.full_name || "",
    biography: user.biography || user.bio || "",
    profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || "",
    postCount: user.edge_owner_to_timeline_media?.count || user.media_count || 0,
    followingCount: user.edge_follow?.count || user.following_count || 0,
    isVerified: user.is_verified || false,
    category: user.category_name || user.category || "",
    externalUrl: user.external_url || "",
  };
}

/* ------------------------------------------------------------------ */
/*  Clips pagination via POST /api/v1/clips/user/                     */
/* ------------------------------------------------------------------ */

interface ClipsPage {
  items: any[];
  moreAvailable: boolean;
  maxId: string | null;
}

async function fetchClipsPage(
  userId: string,
  maxId: string | null
): Promise<ClipsPage> {
  const url = "https://i.instagram.com/api/v1/clips/user/";
  const parts = [
    `target_user_id=${userId}`,
    `page_size=12`,
    `include_feed_video=true`,
  ];
  if (maxId) {
    parts.push(`max_id=${encodeURIComponent(maxId)}`);
  }
  const formBody = parts.join("&");

  const { status, data } = await igPost(url, formBody);

  if (status === 429) {
    // Rate-limited — wait 5s and retry once
    console.warn("[Instagram] Rate limited on clips/user, retrying in 5s…");
    await sleep(5000);
    const retry = await igPost(url, formBody);
    if (retry.status !== 200 || !retry.data) {
      console.warn("[Instagram] Retry also failed, stopping pagination.");
      return { items: [], moreAvailable: false, maxId: null };
    }
    return {
      items: retry.data?.items || [],
      moreAvailable: retry.data?.paging_info?.more_available || false,
      maxId: retry.data?.paging_info?.max_id || null,
    };
  }

  if (status !== 200 || !data) {
    console.warn(
      `[Instagram] clips/user returned HTTP ${status}, stopping pagination.`
    );
    return { items: [], moreAvailable: false, maxId: null };
  }

  return {
    items: data?.items || [],
    moreAvailable: data?.paging_info?.more_available || false,
    maxId: data?.paging_info?.max_id || null,
  };
}

/* ------------------------------------------------------------------ */
/*  Parse a clips item into ReelData                                   */
/* ------------------------------------------------------------------ */

function parseClipItem(item: any, ownerUsername: string): ReelData | null {
  const media = item?.media;
  if (!media) return null;

  const shortcode = media.code || "";
  if (!shortcode) return null;

  const caption = media.caption?.text || "";
  const viewCount = media.play_count || media.view_count || 0;
  const likeCount = media.like_count || 0;
  const commentCount = media.comment_count || 0;
  const thumbnailUrl =
    media.image_versions2?.candidates?.[0]?.url ||
    media.thumbnail_src ||
    media.display_url ||
    "";
  const videoUrl = media.video_versions?.[0]?.url || media.video_url || "";
  const duration = Math.round(media.video_duration || 0);
  const takenAt = media.taken_at;
  const postedAt = takenAt
    ? new Date(
        typeof takenAt === "number" && takenAt < 1e12
          ? takenAt * 1000
          : takenAt
      )
    : new Date();

  return {
    shortcode,
    caption,
    viewCount,
    likeCount,
    commentCount,
    thumbnailUrl,
    videoUrl,
    reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
    duration,
    postedAt,
    ownerUsername,
  };
}

/* ------------------------------------------------------------------ */
/*  Main scraper                                                       */
/* ------------------------------------------------------------------ */

export interface ScrapeResult {
  reels: ReelData[];
  followerCount: number;
  profilePicUrl: string;
}

export async function scrapeReels(
  handle: string,
  timeframeDays: number,
  onProgress?: (count: number) => void,
  options?: { maxReels?: number; timeoutMs?: number }
): Promise<ScrapeResult> {
  const maxReels = options?.maxReels || 500; // Hard cap on reels to collect
  const timeoutMs = options?.timeoutMs || 5 * 60 * 1000; // 5 minute timeout
  const startTime = Date.now();

  // Step 1: Resolve profile
  const profile = await fetchProfile(handle);

  if (profile.isPrivate) {
    throw new Error(
      `The account @${profile.username} is private. Only public accounts can be scraped.`
    );
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

  const allReels: ReelData[] = [];
  const seenShortcodes = new Set<string>();

  // Step 2: Paginate through clips/user endpoint
  // IMPORTANT: The clips endpoint does NOT return reels in chronological order.
  // It returns them by engagement/relevance, so we must fetch ALL pages and
  // filter by date afterwards. We track consecutive out-of-range pages to know
  // when to stop (if 3 full pages have zero in-range reels, we've likely exhausted them).
  let maxId: string | null = null;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 100; // safety limit
  let consecutiveEmptyPages = 0; // pages where no reel falls within the timeframe
  let stoppedReason = "";

  while (hasMore && pageCount < maxPages) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      stoppedReason = `timeout after ${Math.round((Date.now() - startTime) / 1000)}s`;
      console.warn(`[Instagram] Scrape timeout for @${handle} after ${pageCount} pages, ${allReels.length} reels collected`);
      break;
    }

    // Check reel cap
    if (allReels.length >= maxReels) {
      stoppedReason = `reached ${maxReels} reel cap`;
      console.log(`[Instagram] Reached reel cap (${maxReels}) for @${handle} after ${pageCount} pages`);
      break;
    }

    pageCount++;

    // Delay between pages (1-2s) to avoid rate limiting, skip on first page
    if (pageCount > 1) {
      const delay = 1000 + Math.random() * 1000;
      await sleep(delay);
    }

    const page = await fetchClipsPage(profile.userId, maxId);

    if (page.items.length === 0) {
      hasMore = false;
      break;
    }

    let foundInRangeThisPage = false;

    for (const item of page.items) {
      const reel = parseClipItem(item, profile.username);
      if (!reel) continue;

      // Deduplicate
      if (seenShortcodes.has(reel.shortcode)) continue;
      seenShortcodes.add(reel.shortcode);

      // Only include reels within the timeframe, but DON'T stop pagination
      if (reel.postedAt >= cutoffDate) {
        allReels.push(reel);
        foundInRangeThisPage = true;

        // Check reel cap mid-page
        if (allReels.length >= maxReels) break;
      }
    }

    // Track consecutive pages with no in-range reels
    if (!foundInRangeThisPage) {
      consecutiveEmptyPages++;
    } else {
      consecutiveEmptyPages = 0;
    }

    if (onProgress) {
      onProgress(allReels.length);
    }

    // Stop if: no more pages, or 3 consecutive pages had zero in-range reels
    // (meaning we've likely gone past all relevant content)
    if (!page.moreAvailable || !page.maxId || consecutiveEmptyPages >= 3) {
      hasMore = false;
    } else {
      maxId = page.maxId;
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `[Instagram] Scraped ${allReels.length} reels for @${profile.username} in ${elapsed}s (${pageCount} pages, ${seenShortcodes.size} total seen, ${profile.followerCount} followers${stoppedReason ? `, stopped: ${stoppedReason}` : ""})`
  );

  return { reels: allReels, followerCount: profile.followerCount, profilePicUrl: profile.profilePicUrl };
}

/* ------------------------------------------------------------------ */
/*  Fetch individual reel by shortcode (for transcription)             */
/* ------------------------------------------------------------------ */

export interface ReelFullData {
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  postedAt: Date;
  ownerUsername: string;
  ownerFullName: string;
  ownerProfilePicUrl: string;
  ownerFollowerCount: number;
}

export async function fetchReelByShortcode(shortcode: string): Promise<ReelFullData | null> {
  // Strategy 1: Scrape the reel page HTML for embedded JSON data
  // This is the most reliable method - Instagram embeds full media data in the page
  try {
    const pageResult = await fetchReelFromPageHtml(shortcode);
    if (pageResult && (pageResult.videoUrl || pageResult.likeCount > 0)) {
      return pageResult;
    }
  } catch (err) {
    console.error(`[Instagram] Page HTML scrape failed for ${shortcode}:`, err);
  }

  // Strategy 2: Try the media info API endpoint
  try {
    const url = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
    const { status, data } = await igGet(url);

    if (status === 200 && data) {
      const items = data?.items || data?.graphql?.shortcode_media;
      const item = Array.isArray(items) ? items[0] : items;

      if (item) {
        const owner = item.user || item.owner || {};
        const takenAt = item.taken_at || item.taken_at_timestamp;
        const postedAt = takenAt
          ? new Date(typeof takenAt === "number" && takenAt < 1e12 ? takenAt * 1000 : takenAt)
          : new Date();

        return {
          videoUrl:
            item.video_url ||
            item.video_versions?.[0]?.url ||
            "",
          thumbnailUrl:
            item.thumbnail_src ||
            item.display_url ||
            item.image_versions2?.candidates?.[0]?.url ||
            "",
          caption:
            item.caption?.text ||
            item.edge_media_to_caption?.edges?.[0]?.node?.text ||
            "",
          viewCount: item.play_count || item.view_count || item.video_play_count || 0,
          likeCount: item.like_count || item.edge_media_preview_like?.count || 0,
          commentCount: item.comment_count || item.edge_media_to_comment?.count || 0,
          duration: Math.round(item.video_duration || 0),
          postedAt,
          ownerUsername: owner.username || "",
          ownerFullName: owner.full_name || "",
          ownerProfilePicUrl: owner.profile_pic_url || "",
          ownerFollowerCount: owner.follower_count || 0,
        };
      }
    }
  } catch {}

  // Strategy 3: Try the mobile media info endpoint
  try {
    const url = `https://i.instagram.com/api/v1/media/${shortcode}/info/`;
    const { status, data } = await igGet(url);

    if (status === 200 && data) {
      const item = data.items?.[0];
      if (item) {
        const owner = item.user || {};
        const takenAt = item.taken_at;
        const postedAt = takenAt
          ? new Date(typeof takenAt === "number" && takenAt < 1e12 ? takenAt * 1000 : takenAt)
          : new Date();

        return {
          videoUrl: item.video_versions?.[0]?.url || "",
          thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || "",
          caption: item.caption?.text || "",
          viewCount: item.play_count || item.view_count || 0,
          likeCount: item.like_count || 0,
          commentCount: item.comment_count || 0,
          duration: Math.round(item.video_duration || 0),
          postedAt,
          ownerUsername: owner.username || "",
          ownerFullName: owner.full_name || "",
          ownerProfilePicUrl: owner.profile_pic_url || "",
          ownerFollowerCount: owner.follower_count || 0,
        };
      }
    }
  } catch {}

  // Strategy 4: oembed (limited data but reliable - no video URL or play counts)
  try {
    const url = `https://www.instagram.com/api/v1/oembed/?url=https://www.instagram.com/reel/${shortcode}/`;
    const { status, data } = await igGet(url);

    if (status === 200 && data) {
      return {
        videoUrl: "",
        thumbnailUrl: data.thumbnail_url || "",
        caption: data.title || "",
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        duration: 0,
        postedAt: new Date(),
        ownerUsername: data.author_name || "",
        ownerFullName: data.author_name || "",
        ownerProfilePicUrl: "",
        ownerFollowerCount: 0,
      };
    }
  } catch {}

  return null;
}

/**
 * Scrape the Instagram reel page HTML to extract embedded JSON data.
 * Instagram embeds full media data (including video URLs, metrics, and owner info)
 * in a <script> tag containing xdt_api__v1__media__shortcode__web_info.
 */
async function fetchReelFromPageHtml(shortcode: string): Promise<ReelFullData | null> {
  const res = await gotScraping({
    url: `https://www.instagram.com/reel/${shortcode}/`,
    method: "GET",
    headerGeneratorOptions: {
      browsers: [{ name: "chrome", minVersion: 120 }],
      operatingSystems: ["windows"],
    },
    timeout: { request: 20000 },
    retry: { limit: 1 },
  });

  if (res.statusCode !== 200) return null;

  const body = res.body;

  // Find the script tag containing xdt_api media data
  const scriptTags = body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g);
  for (const tag of scriptTags) {
    const content = tag[1];
    if (!content.includes("xdt_api__v1__media__shortcode__web_info")) continue;

    try {
      const data = JSON.parse(content);
      const item = findNestedItem(data);
      if (!item) continue;

      const owner = item.user || item.owner || {};
      const takenAt = item.taken_at || item.taken_at_timestamp;
      const postedAt = takenAt
        ? new Date(typeof takenAt === "number" && takenAt < 1e12 ? takenAt * 1000 : takenAt)
        : new Date();

      return {
        videoUrl:
          item.video_url ||
          item.video_versions?.[0]?.url ||
          "",
        thumbnailUrl:
          item.thumbnail_src ||
          item.display_url ||
          item.image_versions2?.candidates?.[0]?.url ||
          "",
        caption:
          item.caption?.text ||
          "",
        viewCount: item.play_count || item.view_count || item.video_play_count || 0,
        likeCount: item.like_count || 0,
        commentCount: item.comment_count || 0,
        duration: Math.round(item.video_duration || 0),
        postedAt,
        ownerUsername: owner.username || "",
        ownerFullName: owner.full_name || "",
        ownerProfilePicUrl: owner.profile_pic_url || "",
        ownerFollowerCount: owner.follower_count || 0,
      };
    } catch {}
  }

  return null;
}

/** Recursively find the media item inside the nested Instagram page JSON */
function findNestedItem(obj: any, depth = 0): any {
  if (depth > 15 || typeof obj !== "object" || obj === null) return null;
  if ("xdt_api__v1__media__shortcode__web_info" in obj) {
    const items = obj.xdt_api__v1__media__shortcode__web_info?.items;
    if (Array.isArray(items) && items.length > 0) return items[0];
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findNestedItem(v, depth + 1);
      if (r) return r;
    }
  } else {
    for (const v of Object.values(obj)) {
      const r = findNestedItem(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}


/* ------------------------------------------------------------------ */
/*  Search reels by keyword (via tag/hashtag sections endpoint)        */
/* ------------------------------------------------------------------ */

export interface SearchReelData {
  shortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  reelUrl: string;
  duration: number;
  postedAt: Date;
  ownerUsername: string;
  ownerFullName: string;
  ownerProfilePicUrl: string;
  ownerFollowerCount: number;
  engagementRate: number;
}

/**
 * Parse a media item from tag sections into SearchReelData.
 * Tag sections return items in a slightly different format than clips/user.
 */
function parseTagMediaItem(item: any): SearchReelData | null {
  const media = item?.media || item;
  if (!media) return null;

  // Only include video/reel content (media_type 2 = video, product_type clips = reel)
  const mediaType = media.media_type;
  const productType = media.product_type;
  // Accept reels (clips) and videos
  if (mediaType !== 2 && productType !== "clips") return null;

  const shortcode = media.code || "";
  if (!shortcode) return null;

  const caption = media.caption?.text || "";
  const viewCount = media.play_count || media.view_count || 0;
  const likeCount = media.like_count || 0;
  const commentCount = media.comment_count || 0;
  const thumbnailUrl =
    media.image_versions2?.candidates?.[0]?.url ||
    media.thumbnail_src ||
    media.display_url ||
    "";
  const videoUrl = media.video_versions?.[0]?.url || media.video_url || "";
  const duration = Math.round(media.video_duration || 0);
  const takenAt = media.taken_at;
  const postedAt = takenAt
    ? new Date(
        typeof takenAt === "number" && takenAt < 1e12
          ? takenAt * 1000
          : takenAt
      )
    : new Date();

  const owner = media.user || media.owner || {};
  const ownerUsername = owner.username || "";
  const ownerFullName = owner.full_name || "";
  const ownerProfilePicUrl = owner.profile_pic_url || "";
  const ownerFollowerCount = owner.follower_count || 0;

  // Calculate engagement rate if we have follower count
  const engagementRate = ownerFollowerCount > 0
    ? ((likeCount + commentCount) / ownerFollowerCount) * 100
    : 0;

  return {
    shortcode,
    caption,
    viewCount,
    likeCount,
    commentCount,
    thumbnailUrl,
    videoUrl,
    reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
    duration,
    postedAt,
    ownerUsername,
    ownerFullName,
    ownerProfilePicUrl,
    ownerFollowerCount,
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

/**
 * Search for reels by keyword using Instagram's tag sections endpoint.
 * This searches by hashtag which is the closest to keyword search available.
 */
export async function searchReelsByKeyword(
  keyword: string,
  maxResults: number = 50,
  onProgress?: (count: number) => void
): Promise<SearchReelData[]> {
  // Clean keyword: remove # and spaces, use first word as tag
  const cleanKeyword = keyword.replace(/[#@]/g, "").trim().toLowerCase().replace(/\s+/g, "");
  
  if (!cleanKeyword) {
    throw new Error("Please enter a valid search keyword.");
  }

  const allReels: SearchReelData[] = [];
  const seenShortcodes = new Set<string>();

  // Try the tag sections endpoint (returns recent + top media for a hashtag)
  try {
    // First, try to get the tag info
    const tagInfoUrl = `https://i.instagram.com/api/v1/tags/${encodeURIComponent(cleanKeyword)}/info/`;
    const tagInfo = await igGet(tagInfoUrl);
    
    if (tagInfo.status === 404) {
      throw new Error(`No results found for "${keyword}". Try a different keyword or hashtag.`);
    }
    if (tagInfo.status === 429) {
      throw new Error("Instagram rate limit reached. Please wait a few minutes and try again.");
    }

    // Now fetch sections (recent + ranked media)
    const sectionsUrl = `https://i.instagram.com/api/v1/tags/${encodeURIComponent(cleanKeyword)}/sections/`;
    
    // Fetch ranked (top) media first
    let maxId: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 5; // Limit pages to avoid rate limiting

    while (hasMore && pageCount < maxPages && allReels.length < maxResults) {
      pageCount++;

      if (pageCount > 1) {
        await sleep(1500 + Math.random() * 1000);
      }

      const formParts = [
        `tab=recent`,
        `page=${pageCount - 1}`,
      ];
      if (maxId) {
        formParts.push(`max_id=${encodeURIComponent(maxId)}`);
      }

      const { status, data } = await igPost(sectionsUrl, formParts.join("&"));

      if (status === 429) {
        console.warn("[Instagram] Rate limited on tag sections, stopping.");
        break;
      }
      if (status !== 200 || !data) {
        break;
      }

      // Parse sections - each section has layout_content with medias array
      const sections = data.sections || [];
      for (const section of sections) {
        const medias = section.layout_content?.medias || [];
        for (const mediaWrapper of medias) {
          const reel = parseTagMediaItem(mediaWrapper);
          if (reel && !seenShortcodes.has(reel.shortcode)) {
            seenShortcodes.add(reel.shortcode);
            allReels.push(reel);
          }
        }
      }

      if (onProgress) {
        onProgress(allReels.length);
      }

      hasMore = data.more_available || false;
      maxId = data.next_max_id || null;

      if (!hasMore || !maxId) break;
    }
  } catch (error: any) {
    if (error.message?.includes("No results found") || error.message?.includes("rate limit")) {
      throw error;
    }
    console.warn(`[Instagram] Tag sections search failed: ${error.message}`);
  }

  // If tag search returned few results, also try the top search endpoint
  if (allReels.length < 10) {
    try {
      const topSearchUrl = `https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?context=blended&query=${encodeURIComponent(keyword)}&search_surface=top_search_page`;
      const { status, data } = await igGet(topSearchUrl);

      if (status === 200 && data) {
        // topsearch returns a list with users, hashtags, and places
        // We can use the hashtags to find more relevant tags
        const hashtags = data.hashtags || data.list?.filter((item: any) => item.hashtag) || [];
        
        // Try the first few related hashtags
        for (const hashtagItem of hashtags.slice(0, 3)) {
          const tag = hashtagItem.hashtag?.name || hashtagItem.name;
          if (!tag || tag === cleanKeyword) continue;

          await sleep(1000);
          
          const relatedUrl = `https://i.instagram.com/api/v1/tags/${encodeURIComponent(tag)}/sections/`;
          const relatedResult = await igPost(relatedUrl, "tab=recent&page=0");
          
          if (relatedResult.status === 200 && relatedResult.data) {
            const sections = relatedResult.data.sections || [];
            for (const section of sections) {
              const medias = section.layout_content?.medias || [];
              for (const mediaWrapper of medias) {
                const reel = parseTagMediaItem(mediaWrapper);
                if (reel && !seenShortcodes.has(reel.shortcode)) {
                  seenShortcodes.add(reel.shortcode);
                  allReels.push(reel);
                }
              }
            }
          }

          if (allReels.length >= maxResults) break;
        }
      }
    } catch {
      // Fallback search failed, continue with what we have
    }
  }

  console.log(`[Instagram] Search for "${keyword}" found ${allReels.length} reels`);
  return allReels.slice(0, maxResults);
}

/**
 * Search for reels by handle - fetches a creator's reels (lightweight version).
 * Returns SearchReelData format with engagement info.
 */
export async function searchReelsByHandle(
  handle: string,
  maxResults: number = 50,
  onProgress?: (count: number) => void
): Promise<{ reels: SearchReelData[]; profile: ProfileInfo }> {
  const profile = await fetchProfile(handle);

  if (profile.isPrivate) {
    throw new Error(`The account @${profile.username} is private. Only public accounts can be searched.`);
  }

  const allReels: SearchReelData[] = [];
  const seenShortcodes = new Set<string>();

  let maxId: string | null = null;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = Math.ceil(maxResults / 12) + 1;

  while (hasMore && pageCount < maxPages && allReels.length < maxResults) {
    pageCount++;

    if (pageCount > 1) {
      await sleep(1000 + Math.random() * 1000);
    }

    const url = "https://i.instagram.com/api/v1/clips/user/";
    const parts = [
      `target_user_id=${profile.userId}`,
      `page_size=12`,
      `include_feed_video=true`,
    ];
    if (maxId) {
      parts.push(`max_id=${encodeURIComponent(maxId)}`);
    }

    const { status, data } = await igPost(url, parts.join("&"));

    if (status === 429) {
      console.warn("[Instagram] Rate limited on clips/user search, stopping.");
      break;
    }
    if (status !== 200 || !data) break;

    const items = data.items || [];
    for (const item of items) {
      const media = item?.media;
      if (!media) continue;

      const shortcode = media.code || "";
      if (!shortcode || seenShortcodes.has(shortcode)) continue;
      seenShortcodes.add(shortcode);

      const caption = media.caption?.text || "";
      const viewCount = media.play_count || media.view_count || 0;
      const likeCount = media.like_count || 0;
      const commentCount = media.comment_count || 0;
      const thumbnailUrl =
        media.image_versions2?.candidates?.[0]?.url ||
        media.thumbnail_src || "";
      const videoUrl = media.video_versions?.[0]?.url || media.video_url || "";
      const duration = Math.round(media.video_duration || 0);
      const takenAt = media.taken_at;
      const postedAt = takenAt
        ? new Date(typeof takenAt === "number" && takenAt < 1e12 ? takenAt * 1000 : takenAt)
        : new Date();

      const engagementRate = profile.followerCount > 0
        ? ((likeCount + commentCount) / profile.followerCount) * 100
        : 0;

      allReels.push({
        shortcode,
        caption,
        viewCount,
        likeCount,
        commentCount,
        thumbnailUrl,
        videoUrl,
        reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
        duration,
        postedAt,
        ownerUsername: profile.username,
        ownerFullName: profile.fullName,
        ownerProfilePicUrl: profile.profilePicUrl,
        ownerFollowerCount: profile.followerCount,
        engagementRate: Math.round(engagementRate * 100) / 100,
      });
    }

    if (onProgress) {
      onProgress(allReels.length);
    }

    hasMore = data.paging_info?.more_available || false;
    maxId = data.paging_info?.max_id || null;
    if (!hasMore || !maxId) break;
  }

  console.log(`[Instagram] Handle search for @${profile.username} found ${allReels.length} reels`);
  return { reels: allReels.slice(0, maxResults), profile };
}
