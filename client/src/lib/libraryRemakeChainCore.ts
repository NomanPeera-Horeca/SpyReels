import type { ReelClassificationLike, TranscriptionLike } from "@/lib/remakeability";
import { mergeRemakeability } from "@/lib/remakeability";

export type LibraryRemakeStage =
  | "idle"
  | "transcribing"
  | "generating"
  | "ready"
  | "inspiration"
  | "error";

export type LibraryRemakeSource =
  | { source: "user"; reelId: number; jobId?: number }
  | { source: "featured"; featuredReelId: number }
  | {
      source: "collected";
      collectedReelId: number;
      /** When list row already mapped collected -> reels.id */
      transcriptionReelId?: number | null;
    };

export type LibraryRemakeState = {
  stage: LibraryRemakeStage;
  progressPercent: number;
  errorMessage?: string;
  /** User-table reel id (user + collected paths) */
  reelId?: number;
  featuredReelId?: number;
  collectedReelId?: number;
  scriptId?: number;
  classificationReason?: string | null;
};

export const LIBRARY_POLL_MS = 2500;
export const LIBRARY_TRANSCRIBE_MAX = 60;
export const LIBRARY_GENERATE_MAX = 60;

const STAGE_FLOOR: Record<LibraryRemakeStage, number> = {
  idle: 0,
  transcribing: 25,
  generating: 65,
  ready: 100,
  inspiration: 100,
  error: 0,
};

const STAGE_CEILING: Record<LibraryRemakeStage, number> = {
  idle: 0,
  transcribing: 65,
  generating: 95,
  ready: 100,
  inspiration: 100,
  error: 0,
};

export function libraryRemakeKey(source: LibraryRemakeSource): string {
  switch (source.source) {
    case "user":
      return `user:${source.reelId}`;
    case "featured":
      return `featured:${source.featuredReelId}`;
    case "collected":
      return `collected:${source.collectedReelId}`;
  }
}

export function libraryEasedPercent(
  stage: LibraryRemakeStage,
  attempt: number,
  maxAttempts: number
): number {
  const floor = STAGE_FLOOR[stage];
  const ceiling = STAGE_CEILING[stage];
  if (maxAttempts <= 0) return floor;
  const span = ceiling - floor - 1;
  const eased = floor + Math.round((Math.min(attempt, maxAttempts) / maxAttempts) * span);
  return Math.min(ceiling - 1, Math.max(floor, eased));
}

export function isTranscriptionReadyForRecreate(
  tx: { status: string; transcript?: string | null; segments?: unknown } | null | undefined
): boolean {
  if (tx?.status !== "completed") return false;
  const text = String(tx.transcript ?? "").trim();
  if (text) return true;
  const segs = Array.isArray(tx.segments) ? tx.segments : [];
  return segs.some((s) => String((s as { text?: string })?.text ?? "").trim());
}

export type TranscribeStatusFetch = (
  input: { reelId: number } | { featuredReelId: number }
) => Promise<{
  status: string;
  transcript?: string | null;
  segments?: unknown;
} | null>;

export function transcribeStatusInput(
  source: LibraryRemakeSource,
  reelId: number | undefined,
  featuredReelId: number | undefined
): { reelId: number } | { featuredReelId: number } {
  if (source.source === "featured") return { featuredReelId: source.featuredReelId };
  const rid =
    reelId ?? (source.source === "user" ? source.reelId : source.transcriptionReelId ?? undefined);
  if (rid == null) throw new Error("Missing reel id for transcription status.");
  return { reelId: rid };
}

/**
 * Poll until transcription is ready for recreate. Only call after starting
 * transcription that returned status !== "completed". The no-voice throw
 * applies to terminal completed+empty rows, not transient parent-ready reels.
 */
export async function waitForLibraryTranscriptionReady(
  fetchStatus: TranscribeStatusFetch,
  statusInput: { reelId: number } | { featuredReelId: number },
  opts: {
    isCancelled?: () => boolean;
    onAttempt?: (attempt: number) => void;
    maxAttempts?: number;
    pollMs?: number;
  } = {}
): Promise<void> {
  const max = opts.maxAttempts ?? LIBRARY_TRANSCRIBE_MAX;
  const pollMs = opts.pollMs ?? LIBRARY_POLL_MS;
  for (let attempt = 1; attempt <= max; attempt++) {
    if (opts.isCancelled?.()) return;
    opts.onAttempt?.(attempt);
    const tx = await fetchStatus(statusInput);
    if (isTranscriptionReadyForRecreate(tx)) return;
    if (tx?.status === "completed" && !isTranscriptionReadyForRecreate(tx)) {
      throw new Error("No voice detected on this reel. Pick one with narration to remake.");
    }
    if (tx?.status === "failed") {
      throw new Error("Transcription failed. Try again.");
    }
    if (attempt < max) await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Transcription timed out. Try again.");
}

/**
 * Single fetch for reels the parent already marked transcribed. Skips the poll
 * loop when ready; throws only on terminal failed / no-voice / not-ready states.
 */
export async function assertLibraryTranscriptionReadyOnce(
  fetchStatus: TranscribeStatusFetch,
  statusInput: { reelId: number } | { featuredReelId: number }
): Promise<void> {
  const tx = await fetchStatus(statusInput);
  if (isTranscriptionReadyForRecreate(tx)) return;
  if (tx?.status === "completed") {
    throw new Error("No voice detected on this reel. Pick one with narration to remake.");
  }
  if (tx?.status === "failed") {
    throw new Error("Transcription failed. Try again.");
  }
  throw new Error("Transcription is not ready yet. Try again.");
}

export function evaluateRemakeabilityGate(
  tx: TranscriptionLike,
  classification?: ReelClassificationLike
): { proceed: true } | { proceed: false; classificationReason?: string | null } {
  const check = mergeRemakeability(tx, classification ?? null);
  if (!check.notRemakeable) return { proceed: true };
  return {
    proceed: false,
    classificationReason: classification?.classificationReason ?? null,
  };
}

export function libraryRemakeButtonLabel(state: LibraryRemakeState): string {
  const pct = state.progressPercent;
  switch (state.stage) {
    case "transcribing":
      return `Transcribing… ${pct}%`;
    case "generating":
      return `Generating… ${pct}%`;
    case "inspiration":
      return "Save for Inspiration";
    case "ready":
      return "Open script";
    case "error":
      return "Retry";
    default:
      return "Remake now";
  }
}

/** Resolve ids stored on LibraryRemakeState from source + optional post-transcribe reelId */
export function resolveLibraryIds(
  source: LibraryRemakeSource,
  transcriptionReelId?: number
): Pick<LibraryRemakeState, "reelId" | "featuredReelId" | "collectedReelId"> {
  if (source.source === "featured") {
    return { featuredReelId: source.featuredReelId };
  }
  if (source.source === "user") {
    return { reelId: source.reelId };
  }
  return {
    collectedReelId: source.collectedReelId,
    reelId: transcriptionReelId ?? source.transcriptionReelId ?? undefined,
  };
}
