/**
 * Session stash for B-roll landing preview results across Stripe checkout redirect.
 * Sibling to brollPendingScript.ts (auth handoff); this covers checkout return.
 */

import type { BrollLandingMatch } from "@shared/brollLanding";

export const BROLL_PENDING_PREVIEW_KEY = "spyreels:broll_pending_preview";

/** Ignore stashes older than one hour. */
export const BROLL_PENDING_PREVIEW_TTL_MS = 60 * 60 * 1000;

export type BrollPendingScriptPreview = {
  mode: "script";
  script: string;
  matches: BrollLandingMatch[];
  beatsMatched: number;
  totalSeconds: number;
  savedAt: number;
};

export type BrollPendingVideoPreview = {
  mode: "video";
  videoId: number;
  accessToken: string | null;
  savedAt: number;
};

export type BrollPendingPreview =
  | BrollPendingScriptPreview
  | BrollPendingVideoPreview;

/** Live snapshot from DemoWidget used right before Stripe navigation. */
export type BrollPreviewSnapshot = {
  mode: "script" | "video";
  script: string;
  matches: BrollLandingMatch[];
  beatsMatched: number;
  totalSeconds: number;
  videoId: number | null;
  accessToken: string | null;
  phase: "idle" | "loading" | "results" | "error";
};

function isMatch(value: unknown): value is BrollLandingMatch {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  const matchStatus =
    m.matchStatus === "no_match"
      ? "no_match"
      : m.matchStatus === "matched" || typeof m.clipUrl === "string"
        ? "matched"
        : null;
  if (!matchStatus) return false;
  if (
    typeof m.beat !== "string" ||
    typeof m.keyword !== "string" ||
    typeof m.clipUrl !== "string" ||
    typeof m.posterUrl !== "string" ||
    !(m.source === "pexels" || m.source === "pixabay" || m.source === "ai") ||
    typeof m.start !== "number" ||
    typeof m.end !== "number"
  ) {
    return false;
  }
  if (matchStatus === "matched" && !m.clipUrl) return false;
  // Normalize legacy stashes that omit matchStatus / matchConfidence.
  (m as { matchStatus: string }).matchStatus = matchStatus;
  if (
    matchStatus === "matched" &&
    m.matchConfidence !== "approximate" &&
    m.matchConfidence !== "high"
  ) {
    (m as { matchConfidence: string }).matchConfidence = "high";
  }
  return true;
}

function parsePending(raw: string): BrollPendingPreview | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = Number(data.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > BROLL_PENDING_PREVIEW_TTL_MS) return null;

    if (data.mode === "script") {
      const script = typeof data.script === "string" ? data.script : "";
      const matches = Array.isArray(data.matches)
        ? data.matches.filter(isMatch)
        : [];
      if (!matches.length) return null;
      return {
        mode: "script",
        script,
        matches,
        beatsMatched:
          typeof data.beatsMatched === "number"
            ? data.beatsMatched
            : matches.length,
        totalSeconds:
          typeof data.totalSeconds === "number" ? data.totalSeconds : 0,
        savedAt,
      };
    }

    if (data.mode === "video") {
      const videoId = Number(data.videoId);
      if (!Number.isFinite(videoId) || videoId <= 0) return null;
      return {
        mode: "video",
        videoId,
        accessToken:
          typeof data.accessToken === "string" ? data.accessToken : null,
        savedAt,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function stashBrollPreviewBeforeCheckout(
  snapshot: BrollPreviewSnapshot
): void {
  if (snapshot.phase !== "results") return;

  let payload: BrollPendingPreview | null = null;
  if (snapshot.mode === "script") {
    if (!snapshot.matches.length) return;
    payload = {
      mode: "script",
      script: snapshot.script.slice(0, 12000),
      matches: snapshot.matches,
      beatsMatched: snapshot.beatsMatched,
      totalSeconds: snapshot.totalSeconds,
      savedAt: Date.now(),
    };
  } else if (snapshot.videoId != null) {
    payload = {
      mode: "video",
      videoId: snapshot.videoId,
      accessToken: snapshot.accessToken,
      savedAt: Date.now(),
    };
  }

  if (!payload) return;
  try {
    sessionStorage.setItem(BROLL_PENDING_PREVIEW_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Peek without clearing (e.g. page mount decide restore). */
export function peekBrollPendingPreview(): BrollPendingPreview | null {
  try {
    const raw = sessionStorage.getItem(BROLL_PENDING_PREVIEW_KEY);
    if (!raw) return null;
    const parsed = parsePending(raw);
    if (!parsed) {
      sessionStorage.removeItem(BROLL_PENDING_PREVIEW_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Read and clear. Prefer after DemoWidget has applied the restore. */
export function consumeBrollPendingPreview(): BrollPendingPreview | null {
  try {
    const raw = sessionStorage.getItem(BROLL_PENDING_PREVIEW_KEY);
    sessionStorage.removeItem(BROLL_PENDING_PREVIEW_KEY);
    if (!raw) return null;
    return parsePending(raw);
  } catch {
    return null;
  }
}

export function clearBrollPendingPreview(): void {
  try {
    sessionStorage.removeItem(BROLL_PENDING_PREVIEW_KEY);
  } catch {
    /* ignore */
  }
}
