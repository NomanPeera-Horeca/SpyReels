/**
 * Map script-suggest / video-insertion results into the landing DemoWidget shape.
 */

import type { SuggestBrollResult } from "../../shared/broll";
import type { BrollLandingMatch } from "../../shared/brollLanding";
import type { VideoBrollInsertionPoint } from "../../shared/videoBroll";

export function mapSuggestBrollToLandingMatches(
  result: SuggestBrollResult
): BrollLandingMatch[] {
  const matches: BrollLandingMatch[] = [];
  let cursor = 0;

  for (const beat of result.beats) {
    const clip = beat.clips[0];
    if (!clip) continue;
    const duration = Math.max(1, Math.round(clip.durationSeconds || 3));
    const start = cursor;
    const end = cursor + Math.min(duration, 6);
    cursor = end;
    matches.push({
      beat: beat.scriptText.slice(0, 120),
      keyword: beat.searchQuery || beat.visualSummary,
      clipUrl: clip.previewUrl || clip.sourceUrl,
      posterUrl: clip.thumbnailUrl,
      source: "pexels",
      start,
      end,
    });
  }

  return matches;
}

export function mapInsertionPointsToLandingMatches(
  points: VideoBrollInsertionPoint[]
): BrollLandingMatch[] {
  return points
    .filter((p) => Boolean(p.pexelsClipUrl))
    .map((p, i) => {
      const start = Math.max(0, Math.round(p.timestampSeconds));
      const end = start + 3;
      return {
        beat: (p.reason || `Beat ${i + 1}`).slice(0, 120),
        keyword: p.searchQuery || "matched clip",
        clipUrl: p.pexelsClipUrl as string,
        posterUrl: p.pexelsClipUrl as string,
        source: "pexels" as const,
        start,
        end,
      };
    });
}

export function formatMatchDuration(start: number, end: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return `${fmt(start)}-${fmt(end)}`;
}
