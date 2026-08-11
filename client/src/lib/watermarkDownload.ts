/**
 * Client helpers for watermarked B-roll clip downloads (free/unpaid path).
 * Requires an authenticated session (requestDownload / getStatus are protected).
 */

import { downloadBrollClip } from "@/lib/brollDownload";

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
  const requested = await api.requestDownload({
    sourceClipUrl,
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
