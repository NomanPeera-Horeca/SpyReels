/**
 * Client helpers for watermarked B-roll clip downloads (free/unpaid path).
 */

import { downloadBrollClip } from "@/lib/brollDownload";

const SESSION_KEY = "spyreels_watermark_session";

export function getOrCreateWatermarkSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY)?.trim();
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `anon${Date.now().toString(36)}`;
  }
}

const POLL_MS = 2500;
const MAX_POLLS = 120; // ~5 minutes at 2.5s

export type WatermarkDownloadProgress =
  | { phase: "direct" }
  | { phase: "ready" }
  | { phase: "preparing"; jobId: number; status: "pending" | "processing" }
  | { phase: "failed"; message: string };

export type WatermarkJobsApi = {
  requestDownload: (input: {
    sourceClipUrl: string;
    sessionId?: string;
  }) => Promise<
    | { kind: "direct"; downloadUrl: string }
    | {
        kind: "ready";
        jobId: number;
        status: "completed";
        outputUrl: string;
      }
    | {
        kind: "job";
        jobId: number;
        status: "pending" | "processing";
        outputUrl: null;
      }
  >;
  getStatus: (input: {
    jobId: number;
    sessionId?: string;
  }) => Promise<{
    jobId: number;
    status: "pending" | "processing" | "completed" | "failed";
    outputUrl: string | null;
    errorMessage: string | null;
  }>;
};

/**
 * Resolve a download URL for one clip: paid → source URL; free → watermark job
 * (reuse completed cache or poll until done).
 */
export async function resolveClipDownloadUrl(
  api: WatermarkJobsApi,
  sourceClipUrl: string,
  onProgress?: (p: WatermarkDownloadProgress) => void
): Promise<string> {
  const sessionId = getOrCreateWatermarkSessionId();
  const requested = await api.requestDownload({
    sourceClipUrl,
    sessionId,
  });

  if (requested.kind === "direct") {
    onProgress?.({ phase: "direct" });
    return requested.downloadUrl;
  }

  if (requested.kind === "ready" && requested.outputUrl) {
    onProgress?.({ phase: "ready" });
    return requested.outputUrl;
  }

  const jobId = requested.jobId;
  onProgress?.({
    phase: "preparing",
    jobId,
    status: requested.status === "processing" ? "processing" : "pending",
  });

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const status = await api.getStatus({
      jobId,
      sessionId,
    });
    if (status.status === "completed" && status.outputUrl) {
      onProgress?.({ phase: "ready" });
      return status.outputUrl;
    }
    if (status.status === "failed") {
      const message =
        status.errorMessage?.trim() ||
        "Watermark render failed. Please try again.";
      onProgress?.({ phase: "failed", message });
      throw new Error(message);
    }
    onProgress?.({
      phase: "preparing",
      jobId,
      status: status.status === "processing" ? "processing" : "pending",
    });
  }

  throw new Error("Timed out preparing your download. Please try again.");
}

/** Request (or reuse) a watermarked file, then save it via fetch→blob. */
export async function downloadClipWithWatermarkGate(
  api: WatermarkJobsApi,
  sourceClipUrl: string,
  filename: string,
  onProgress?: (p: WatermarkDownloadProgress) => void
): Promise<void> {
  const url = await resolveClipDownloadUrl(api, sourceClipUrl, onProgress);
  await downloadBrollClip(url, filename);
}
