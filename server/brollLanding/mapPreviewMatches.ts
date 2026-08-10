/**
 * Map script-suggest / video-insertion results into the landing DemoWidget shape.
 */

import type { SuggestBrollResult } from "../../shared/broll";
import type {
  BrollLandingMatch,
  BrollLandingMatchSource,
} from "../../shared/brollLanding";
import type { VideoBrollInsertionPoint } from "../../shared/videoBroll";

function stockSource(
  provider: "pexels" | "pixabay" | null | undefined
): BrollLandingMatchSource {
  return provider === "pixabay" ? "pixabay" : "pexels";
}

export function mapSuggestBrollToLandingMatches(
  result: SuggestBrollResult
): BrollLandingMatch[] {
  const matches: BrollLandingMatch[] = [];
  let cursor = 0;

  for (const beat of result.beats) {
    const clip = beat.clips[0];
    const beatText = beat.scriptText.slice(0, 120);
    const keyword = beat.searchQuery || beat.visualSummary;

    if (!clip) {
      const start = cursor;
      const end = cursor + 3;
      cursor = end;
      matches.push({
        beat: beatText,
        keyword,
        clipUrl: "",
        posterUrl: "",
        source: "pexels",
        start,
        end,
        matchStatus: "no_match",
      });
      continue;
    }

    const duration = Math.max(1, Math.round(clip.durationSeconds || 3));
    const start = cursor;
    const end = cursor + Math.min(duration, 6);
    cursor = end;
    matches.push({
      beat: beatText,
      keyword,
      clipUrl: clip.previewUrl || clip.sourceUrl,
      posterUrl: clip.thumbnailUrl,
      source: stockSource(clip.provider),
      start,
      end,
      matchStatus: "matched",
      matchConfidence:
        clip.matchConfidence === "approximate" ? "approximate" : "high",
    });
  }

  return matches;
}

export function mapInsertionPointsToLandingMatches(
  points: VideoBrollInsertionPoint[]
): BrollLandingMatch[] {
  return points.map((p, i) => {
    const start = Math.max(0, Math.round(p.timestampSeconds));
    const end = start + 3;
    const hasClip = Boolean(p.pexelsClipUrl);
    return {
      beat: (p.reason || `Beat ${i + 1}`).slice(0, 120),
      keyword: p.searchQuery || "matched clip",
      clipUrl: hasClip ? (p.pexelsClipUrl as string) : "",
      posterUrl: hasClip ? (p.pexelsClipUrl as string) : "",
      source: stockSource(p.clipProvider),
      start,
      end,
      matchStatus: hasClip ? "matched" : "no_match",
      matchConfidence: hasClip ? "high" : undefined,
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

/** Count beats that have a playable stock clip. */
export function countMatchedBeats(matches: BrollLandingMatch[]): number {
  return matches.filter((m) => m.matchStatus === "matched").length;
}
