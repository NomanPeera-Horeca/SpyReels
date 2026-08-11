import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { SPYREELS_LOGO_URL } from "../../shared/staticPageStructuredData";
import { storagePutFromFile } from "../storage";
import {
  getWatermarkJobById,
  markWatermarkJobCompleted,
  markWatermarkJobFailed,
} from "./db";
import { maybeSendWatermarkReadyEmail } from "./notifyReady";

export const WATERMARK_MAX_SOURCE_BYTES = 120 * 1024 * 1024;

const DEFAULT_LOGO_URL = SPYREELS_LOGO_URL;

let cachedLogoPath: string | null = null;

function jobWorkDir(jobId: number): string {
  return join(tmpdir(), `spyreels-watermark-${jobId}-${process.pid}`);
}

async function safeUnlink(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch {
    // ignore missing/temp cleanup races
  }
}

async function resolveLogoPath(): Promise<string> {
  const fromEnv = process.env.WATERMARK_LOGO_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (cachedLogoPath) return cachedLogoPath;

  const logoUrl = process.env.WATERMARK_LOGO_URL?.trim() || DEFAULT_LOGO_URL;
  const dest = join(tmpdir(), "spyreels-watermark-logo.png");
  const res = await fetch(logoUrl);
  if (!res.ok) {
    throw new Error(`Failed to download watermark logo (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) {
    throw new Error("Watermark logo download was empty");
  }
  await writeFile(dest, buf);
  cachedLogoPath = dest;
  return dest;
}

async function downloadUrlToFile(
  url: string,
  destPath: string,
  maxBytes: number
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Source clip download failed (${res.status})`);
  }
  const lengthHeader = res.headers.get("content-length");
  if (lengthHeader) {
    const declared = Number(lengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Source clip exceeds ${maxBytes} byte limit`);
    }
  }
  if (!res.body) {
    throw new Error("Source clip response had no body");
  }

  const nodeReadable = Readable.fromWeb(
    res.body as import("node:stream/web").ReadableStream
  );
  let written = 0;
  const out = createWriteStream(destPath);

  try {
    for await (const chunk of nodeReadable) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      written += buf.length;
      if (written > maxBytes) {
        throw new Error(`Source clip exceeds ${maxBytes} byte limit`);
      }
      if (!out.write(buf)) {
        await new Promise<void>((resolve) => out.once("drain", resolve));
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve());
      out.on("error", reject);
    });
  } catch (err) {
    out.destroy();
    throw err;
  }
}

function runFfmpegWatermark(args: {
  inputPath: string;
  logoPath: string;
  outputPath: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        args.inputPath,
        "-i",
        args.logoPath,
        "-filter_complex",
        "[1:v]scale=180:-1[wm];[0:v][wm]overlay=W-w-20:H-h-20:format=auto",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-x264-params",
        "rc-lookahead=5:bframes=1:ref=1",
        "-threads",
        "2",
        "-filter_threads",
        "2",
        "-filter_complex_threads",
        "2",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        args.outputPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    const stderrChunks: Buffer[] = [];
    ffmpeg.stderr.on("data", (c: Buffer) => {
      stderrChunks.push(c);
      if (stderrChunks.length > 40) stderrChunks.shift();
    });
    ffmpeg.on("error", (err) => reject(err));
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8").slice(-800);
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

function outputR2Key(sourceClipUrl: string, jobId: number): string {
  const hash = createHash("sha256").update(sourceClipUrl).digest("hex").slice(0, 32);
  return `watermarked/${hash}-${jobId}.mp4`;
}

/**
 * File-based watermark burn for one claimed job. Always cleans temp files.
 * Does not load the source or output into a Node Buffer.
 */
export async function processWatermarkJob(jobId: number): Promise<void> {
  const job = await getWatermarkJobById(jobId);
  if (!job) {
    throw new Error(`Watermark job ${jobId} not found`);
  }
  if (job.status !== "processing") {
    console.log(
      `[watermark] skip job ${jobId}: expected processing, got ${job.status}`
    );
    return;
  }

  const dir = jobWorkDir(jobId);
  const inputPath = join(dir, "source.mp4");
  const outputPath = join(dir, "watermarked.mp4");
  let logoPath: string | null = null;

  try {
    await mkdir(dir, { recursive: true });
    logoPath = await resolveLogoPath();
    await downloadUrlToFile(
      job.sourceClipUrl,
      inputPath,
      WATERMARK_MAX_SOURCE_BYTES
    );
    await runFfmpegWatermark({
      inputPath,
      logoPath,
      outputPath,
    });
    const { url } = await storagePutFromFile(
      outputR2Key(job.sourceClipUrl, jobId),
      outputPath,
      "video/mp4"
    );
    await markWatermarkJobCompleted(jobId, url);
    console.log(`[watermark] job ${jobId} completed → ${url}`);
    await maybeSendWatermarkReadyEmail(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markWatermarkJobFailed(jobId, message);
    console.error(`[watermark] job ${jobId} failed:`, message);
    throw err;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
    // Keep cached process-wide logo; only remove per-job dir leftovers.
    try {
      const { rm } = await import("node:fs/promises");
      await rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
