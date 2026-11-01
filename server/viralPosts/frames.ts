/**
 * Frames and audio facts for viral library videos, with ffmpeg (already used
 * in production for transcription). Works on a downloaded video buffer.
 *
 * - One analysis pass gives duration, scene-change times and silence.
 * - Frames: the hook (first 2-3 seconds) plus evenly spread frames, each
 *   snapped to a nearby scene change so we don't send duplicate shots.
 * - Frames are small JPEGs (384 px wide).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const FRAME_WIDTH = 384;
const FFMPEG_TIMEOUT_MS = 90_000;

function runFfmpeg(args: string[], opts: { binaryOut?: boolean } = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-nostdin", ...args]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, FFMPEG_TIMEOUT_MS);
    if (opts.binaryOut) proc.stdout.on("data", (c: Buffer) => out.push(c));
    else proc.stdout.resume();
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", e => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", code => {
      clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

export type VideoAnalysis = {
  durationSec: number;
  sceneTimes: number[];
  /** Share of the video that is not silence (0..1). Music counts as sound. */
  soundRatio: number;
};

/** Parses ffmpeg's stderr from the analysis pass. Pure; exported for tests. */
export function parseAnalysis(stderr: string): VideoAnalysis {
  const d = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSec = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const sceneTimes = [...stderr.matchAll(/pts_time:\s*([\d.]+)/g)]
    .map(m => Number(m[1]))
    .filter(t => Number.isFinite(t) && t >= 0);
  const silence = [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].reduce((n, m) => n + Number(m[1]), 0);
  const hasAudio = /Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Audio:/.test(stderr);
  const soundRatio = !hasAudio || durationSec <= 0 ? 0 : Math.max(0, Math.min(1, 1 - silence / durationSec));
  return { durationSec, sceneTimes: [...new Set(sceneTimes)].sort((a, b) => a - b), soundRatio };
}

/**
 * Frame times: the hook (0.5s and 2s), then even slots across the rest,
 * each moved to the nearest unused scene change inside its slot. No two
 * frames closer than 0.7s. Pure; exported for tests.
 */
export function planFrameTimes(durationSec: number, sceneTimes: number[], count: number): number[] {
  if (!(durationSec > 0) || count <= 0) return [];
  const end = Math.max(0, durationSec - 0.3);
  const hook = durationSec > 2.5 ? [0.5, 2.0] : [Math.min(0.5, end)];
  const times: number[] = [...hook].slice(0, count);
  const rest = count - times.length;
  const start = Math.min(2.5, end);
  if (rest > 0 && end > start) {
    const gap = (end - start) / rest;
    const used = new Set<number>();
    for (let i = 0; i < rest; i++) {
      const slot = start + gap * (i + 0.5);
      const near = sceneTimes
        .filter(t => !used.has(t) && t >= slot - gap / 2 && t <= slot + gap / 2 && t >= start && t <= end)
        .sort((a, b) => Math.abs(a - slot) - Math.abs(b - slot))[0];
      // A scene change frame sits on the cut; nudge 0.2s in so it shows the new shot.
      const t = near != null ? Math.min(end, near + 0.2) : slot;
      if (near != null) used.add(near);
      times.push(t);
    }
  }
  const out: number[] = [];
  for (const t of times.sort((a, b) => a - b)) {
    if (out.every(x => Math.abs(x - t) >= 0.7)) out.push(Math.round(t * 100) / 100);
  }
  return out;
}

/** 3-5 frames with clear speech in a short video; 8-10 with little speech or over ~60s. */
export function frameCountFor(args: { durationSec: number; clearSpeech: boolean }): number {
  if (args.clearSpeech && args.durationSec <= 60) return args.durationSec <= 20 ? 3 : args.durationSec <= 40 ? 4 : 5;
  return args.durationSec <= 30 ? 8 : args.durationSec <= 90 ? 9 : 10;
}

export type VideoWorkspace = {
  file: string;
  analysis: VideoAnalysis;
  frames: (times: number[]) => Promise<Buffer[]>;
  cleanup: () => Promise<void>;
};

/** Writes the video to a temp file and analyses it. Call cleanup() when done. */
export async function openVideo(buffer: Buffer): Promise<VideoWorkspace> {
  const dir = await mkdtemp(path.join(tmpdir(), "viral-frames-"));
  const file = path.join(dir, `${randomUUID()}.mp4`);
  await writeFile(file, buffer);
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    const { stderr } = await runFfmpeg([
      "-i", file,
      "-vf", "select='gt(scene,0.3)',showinfo",
      "-af", "silencedetect=noise=-35dB:d=0.5",
      "-f", "null", "-",
    ]);
    const analysis = parseAnalysis(stderr);
    return {
      file,
      analysis,
      cleanup,
      frames: async times => {
        const frames: Buffer[] = [];
        for (const t of times) {
          try {
            const { stdout } = await runFfmpeg(
              ["-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${FRAME_WIDTH}:-2`, "-q:v", "7", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
              { binaryOut: true }
            );
            if (stdout.length > 500) frames.push(stdout);
          } catch {
            // one bad frame is fine
          }
        }
        return frames;
      },
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
