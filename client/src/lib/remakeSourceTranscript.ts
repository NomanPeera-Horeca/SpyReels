import type { LibraryRemakeSource } from "@/lib/libraryRemakeChainCore";

export type RemakeSourceTranscriptSegment = {
  startSeconds: number;
  text: string;
};

export type RemakeSourceReferenceInput =
  | { reelId: number }
  | { featuredReelId: number }
  | { tiktokVideoId: number }
  | { youtubeVideoId: number };

export function remakeSourceReferenceInput(
  source: LibraryRemakeSource | null,
  reelId: number | null
): RemakeSourceReferenceInput | null {
  if (!source) return reelId != null ? { reelId } : null;
  if (source.source === "featured") {
    return { featuredReelId: source.featuredReelId };
  }
  if (source.source === "tiktok") {
    return { tiktokVideoId: source.tiktokVideoId };
  }
  if (source.source === "youtube") {
    return { youtubeVideoId: source.youtubeVideoId };
  }
  if (source.source === "user") {
    return { reelId: source.reelId };
  }
  const collectedReelId = reelId ?? source.transcriptionReelId ?? null;
  return collectedReelId != null ? { reelId: collectedReelId } : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Normalize cached transcript segment payloads from the supported providers.
 * We only use explicit timestamps that already exist in the provider payload.
 * If a provider has no segments, the drawer falls back to plain transcript text.
 */
export function normalizeRemakeSourceSegments(
  value: unknown
): RemakeSourceTranscriptSegment[] {
  const raw = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { segments?: unknown }).segments)
      ? ((value as { segments: unknown[] }).segments ?? [])
      : [];

  const result: RemakeSourceTranscriptSegment[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const segment = item as Record<string, unknown>;
    const textValue = segment.text ?? segment.transcript ?? segment.caption;
    const text = typeof textValue === "string" ? textValue.trim() : "";
    if (!text) continue;

    const explicitMs = finiteNumber(segment.startMs ?? segment.start_ms);
    const explicitSeconds = finiteNumber(
      segment.start ?? segment.startTime ?? segment.start_time
    );
    const startSeconds =
      explicitMs != null
        ? Math.max(0, explicitMs / 1000)
        : explicitSeconds != null
          ? Math.max(0, explicitSeconds)
          : null;

    if (startSeconds == null) continue;
    result.push({ startSeconds, text });
  }

  return result.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function formatRemakeSourceTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
