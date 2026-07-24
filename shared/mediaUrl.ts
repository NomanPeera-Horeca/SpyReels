/** True when URL is hosted on SpyReels durable R2 public storage. */
export function isStableSpyreelsMediaUrl(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  return /\.r2\.dev\//i.test(u);
}

/** Instagram CDN links expire; playback should refresh or mirror first. */
export function isEphemeralInstagramMediaUrl(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  return /cdninstagram\.com|fbcdn\.net/i.test(u);
}

/** TikTok CDN / play-addr links expire; refresh before playback when not on R2. */
export function isEphemeralTiktokMediaUrl(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  return /tiktokcdn|byteoversea|musical\.ly|tiktokv\.com/i.test(u);
}

export function needsVideoUrlRefresh(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return true;
  if (isStableSpyreelsMediaUrl(u)) return false;
  return isEphemeralInstagramMediaUrl(u) || isEphemeralTiktokMediaUrl(u);
}
