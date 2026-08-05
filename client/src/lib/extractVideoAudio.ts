/**
 * Client-side demux of video audio to .m4a (AAC in MP4) via mediabunny.
 * Prefers transmux (no re-encode). Returns null on any failure (silent fallback).
 */

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { VIDEO_BROLL_AUDIO_MAX_BYTES } from "@shared/videoBroll";

export type ExtractedVideoAudio = {
  blob: Blob;
  contentType: "audio/mp4";
  filename: string;
};

function audioFilenameFromVideo(name: string): string {
  const base = name.replace(/^.*[/\\]/, "");
  const withoutExt = base.includes(".")
    ? base.slice(0, base.lastIndexOf("."))
    : base;
  const cleaned =
    withoutExt
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "audio";
  return `${cleaned}.m4a`;
}

/**
 * Extract the primary audio track into an MP4/.m4a blob.
 * Never throws to callers: returns null if demux fails, no audio, or oversized.
 */
export async function extractVideoAudio(
  file: Blob,
  originalFilename = "video.mp4"
): Promise<ExtractedVideoAudio | null> {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      return null;
    }

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    });

    // Discard video; leave audio unconfigured so mediabunny transmuxes when possible.
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { discard: true },
    });

    if (!conversion.isValid) {
      return null;
    }

    await conversion.execute();

    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }
    if (buffer.byteLength > VIDEO_BROLL_AUDIO_MAX_BYTES) {
      return null;
    }

    const blob = new Blob([buffer], { type: "audio/mp4" });
    return {
      blob,
      contentType: "audio/mp4",
      filename: audioFilenameFromVideo(originalFilename),
    };
  } catch (err) {
    console.warn("[extractVideoAudio] demux failed, using video-only fallback:", err);
    return null;
  }
}
