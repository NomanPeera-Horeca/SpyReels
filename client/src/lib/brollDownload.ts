/**
 * Client-side B-roll clip download helpers.
 * Prefer fetch → blob → object URL over <a download href={remote}> because
 * Pexels CDN often blocks cross-origin anchor downloads (CORS).
 */

import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { BrollBeat } from "@shared/broll";

/** Zero-padded beat number for filenames, e.g. beat 0 → "01". */
export function beatFileIndex(beatIndex: number): string {
  return String(beatIndex + 1).padStart(2, "0");
}

/**
 * Download a single MP4 via fetch → blob → object URL so the browser saves
 * a named .mp4 file reliably.
 */
export async function downloadBrollClip(
  previewUrl: string,
  filename: string
): Promise<void> {
  const url = previewUrl.trim();
  if (!url) throw new Error("No clip URL to download");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Revoke after a tick so the download can start.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

/**
 * Bundle all beat clips with a previewUrl into a zip (client-side JSZip,
 * same pattern as carousel slide export). Skips empty previewUrls.
 * Filenames: broll-beat-01.mp4, broll-beat-02.mp4, ...
 */
export async function downloadAllBrollClipsAsZip(
  beats: BrollBeat[],
  zipName = "broll-clips.zip"
): Promise<{ added: number; skipped: number }> {
  const zip = new JSZip();
  let added = 0;
  let skipped = 0;

  for (const beat of beats) {
    const clip = beat.clips.find((c) => c.previewUrl?.trim());
    if (!clip?.previewUrl?.trim()) {
      skipped += 1;
      continue;
    }
    const filename = `broll-beat-${beatFileIndex(beat.index)}.mp4`;
    try {
      const response = await fetch(clip.previewUrl);
      if (!response.ok) {
        skipped += 1;
        continue;
      }
      const blob = await response.blob();
      zip.file(filename, blob);
      added += 1;
    } catch {
      skipped += 1;
    }
  }

  if (added === 0) {
    throw new Error("No clips available to zip");
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, zipName);
  return { added, skipped };
}
