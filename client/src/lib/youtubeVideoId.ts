const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{6,}$/;
const YOUTUBE_SHORTS_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_WATCH_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_LIVE_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/live\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_BE_RE = /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_EMBED_RE =
  /(?:https?:\/\/)?(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/i;

/** Resolve a YouTube video id from Collected shortcode and/or page URL. */
export function resolveYouTubeVideoId(opts: {
  shortcode?: string | null;
  reelUrl?: string | null;
}): string | null {
  const code = (opts.shortcode ?? "").trim();
  if (YOUTUBE_ID_RE.test(code)) return code;

  const url = (opts.reelUrl ?? "").trim();
  if (!url) return null;
  return (
    url.match(YOUTUBE_SHORTS_RE)?.[1] ||
    url.match(YOUTUBE_WATCH_RE)?.[1] ||
    url.match(YOUTUBE_LIVE_RE)?.[1] ||
    url.match(YOUTUBE_BE_RE)?.[1] ||
    url.match(YOUTUBE_EMBED_RE)?.[1] ||
    null
  );
}

export function youtubeEmbedSrc(videoId: string, autoplay = true): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}
