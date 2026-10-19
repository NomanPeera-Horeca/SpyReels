import { needsVideoUrlRefresh } from "@shared/mediaUrl";

export type GridPlayablePlatform = "instagram" | "tiktok";

export type ResolvedPlayableUrl = {
  url: string;
  refreshed: boolean;
};

type RefreshResult = { videoUrl: string };

/**
 * Decide whether a grid video can play from the URL it already has, or must
 * ask the existing Instagram / TikTok refresh procedures for a fresh one.
 * Returns null when the video cannot be played. Does not start playback.
 */
export async function resolveGridPlayableUrl(input: {
  platform: GridPlayablePlatform;
  videoUrl?: string | null;
  shortcode?: string | null;
  reelId?: number;
  videoPageUrl?: string | null;
  signal: AbortSignal;
  refreshInstagram: (
    body: { shortcode: string; reelId?: number },
    signal: AbortSignal
  ) => Promise<RefreshResult>;
  refreshTikTok: (
    body: { videoId?: number; videoPageUrl?: string },
    signal: AbortSignal
  ) => Promise<RefreshResult>;
}): Promise<ResolvedPlayableUrl | null> {
  if (input.signal.aborted) return null;
  const current = (input.videoUrl ?? "").trim();
  const code = (input.shortcode ?? "").trim();
  const pageUrl = (input.videoPageUrl ?? "").trim();

  if (input.platform === "tiktok") {
    if (input.reelId == null && !current && !pageUrl) return null;
  } else if (!code && !current) {
    return null;
  }

  if (current && !needsVideoUrlRefresh(current)) {
    return { url: current, refreshed: false };
  }

  try {
    if (input.platform === "tiktok") {
      const result = await input.refreshTikTok(
        input.reelId != null ? { videoId: input.reelId } : { videoPageUrl: pageUrl || current },
        input.signal
      );
      if (input.signal.aborted) return null;
      const next = result.videoUrl.trim();
      if (!next) return null;
      return { url: next, refreshed: true };
    }

    if (!code) {
      if (input.signal.aborted) return null;
      return current ? { url: current, refreshed: false } : null;
    }

    const result = await input.refreshInstagram(
      input.reelId != null ? { shortcode: code, reelId: input.reelId } : { shortcode: code },
      input.signal
    );
    if (input.signal.aborted) return null;
    const next = result.videoUrl.trim();
    if (!next) return null;
    return { url: next, refreshed: true };
  } catch {
    return null;
  }
}
