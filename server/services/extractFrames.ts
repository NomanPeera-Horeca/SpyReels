import { spawn } from "node:child_process";

export type ExtractedFrame = {
  timestampSec: number;
  buffer: Buffer;
};

const MAX_FRAMES = 20;

function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = (items.length - 1) / (count - 1);
  const sampled: T[] = [];
  for (let i = 0; i < count; i++) {
    sampled.push(items[Math.round(i * step)]!);
  }
  return sampled;
}

function runFfmpegToJpegStream(
  videoBuffer: Buffer,
  args: string[]
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const ffmpeg = spawn("ffmpeg", args);
    ffmpeg.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    ffmpeg.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    ffmpeg.on("error", (err) => reject(err));
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8").slice(-500);
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
    ffmpeg.stdin.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPIPE") {
        // Expected when ffmpeg (e.g. with -t or -ss) stops reading stdin
        // early because it already has enough input. The close handler's
        // exit code is the real source of truth for success or failure.
        return;
      }
      reject(err);
    });
    ffmpeg.stdin.end(videoBuffer);
  });
}

function splitJpegFrames(buffer: Buffer): Buffer[] {
  const starts: number[] = [];
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
      starts.push(i);
    }
  }
  if (starts.length === 0) return [];
  const frames: Buffer[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]! : buffer.length;
    frames.push(buffer.subarray(start, end));
  }
  return frames;
}

/**
 * Extracts frames from a Reel video buffer for structural vision analysis.
 * First 3 seconds sampled at roughly 1 frame per second (hook window),
 * remainder sampled at 1 frame every 2 seconds. No disk writes, ffmpeg
 * streams JPEG frames out via stdout the same way extractAudio streams
 * MP3 audio out.
 */
export async function extractFrames(
  videoBuffer: Buffer,
  shortcode: string
): Promise<ExtractedFrame[]> {
  console.log(`[extractFrames] extracting frames for shortcode ${shortcode}`);

  const hookArgs = [
    "-i", "pipe:0",
    "-t", "3",
    "-vf", "fps=1",
    "-q:v", "2",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];
  const mainArgs = [
    "-i", "pipe:0",
    "-ss", "3",
    "-vf", "fps=0.5",
    "-q:v", "2",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];

  const [hookStream, mainStream] = await Promise.all([
    runFfmpegToJpegStream(videoBuffer, hookArgs),
    runFfmpegToJpegStream(videoBuffer, mainArgs),
  ]);

  const hookFrames = splitJpegFrames(hookStream);
  const mainFrames = splitJpegFrames(mainStream);

  const result: ExtractedFrame[] = [];
  hookFrames.forEach((buffer, i) => {
    result.push({ timestampSec: i, buffer });
  });
  mainFrames.forEach((buffer, i) => {
    result.push({ timestampSec: 3 + i * 2, buffer });
  });

  if (result.length > MAX_FRAMES) {
    console.warn(
      `[extractFrames] ${shortcode} produced ${result.length} frames, sampling down to ${MAX_FRAMES} evenly across full length`
    );
    return sampleEvenly(result, MAX_FRAMES);
  }

  return result;
}
