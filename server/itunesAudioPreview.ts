/**
 * Resolve a short audio preview via Apple's public iTunes Search API.
 * Used when Instagram Reels audio picks have title/artist but no stream URL.
 */

export type ItunesAudioPreview = {
  previewUrl: string;
  trackName: string;
  artistName: string;
};

function cleanQueryPart(value: string): string {
  return value
    .replace(/[·•|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveItunesAudioPreview(args: {
  title: string;
  artist?: string | null;
}): Promise<ItunesAudioPreview | null> {
  const title = cleanQueryPart(args.title);
  const artist = cleanQueryPart(args.artist ?? "");
  if (!title) return null;

  const term = artist ? `${title} ${artist}` : title;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{
      previewUrl?: string;
      trackName?: string;
      artistName?: string;
    }>;
  };

  const titleLower = title.toLowerCase();
  const artistLower = artist.toLowerCase();
  const ranked = (data.results ?? [])
    .filter((r) => typeof r.previewUrl === "string" && r.previewUrl.trim())
    .map((r) => {
      const track = (r.trackName ?? "").toLowerCase();
      const art = (r.artistName ?? "").toLowerCase();
      let score = 0;
      if (track === titleLower) score += 4;
      else if (track.includes(titleLower) || titleLower.includes(track)) score += 2;
      if (artistLower && art === artistLower) score += 3;
      else if (artistLower && (art.includes(artistLower) || artistLower.includes(art))) score += 1;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.r;
  if (!best?.previewUrl) return null;

  return {
    previewUrl: best.previewUrl,
    trackName: best.trackName?.trim() || title,
    artistName: best.artistName?.trim() || artist,
  };
}
