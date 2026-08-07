/**
 * One-shot: search Pexels (same helper as product) for gallery sample clips,
 * download SD MP4s, trim to ~7s portrait, and write under client/src/assets/broll-generator/clips/.
 *
 * Usage: PEXELS_API_KEY=... pnpm exec tsx scripts/source-broll-gallery-clips.ts
 */

import { execFileSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { searchPexelsVideos } from "../server/broll/searchPexelsVideo";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "client/src/assets/broll-generator/clips");
const TMP_DIR = join(ROOT, "tmp/broll-gallery-source");

const TARGETS = [
  {
    slug: "alarm",
    query: "alarm clock dawn morning wake up",
    captionBeat: "quit their morning routine",
    captionClip: "alarm clock at dawn",
  },
  {
    slug: "calendar",
    query: "calendar page pen mark date",
    captionBeat: "by day 10",
    captionClip: "calendar page with pen",
  },
  {
    slug: "journal",
    query: "hand writing journal notebook morning",
    captionBeat: "the one habit that actually stuck",
    captionClip: "hand writing in a journal",
  },
  {
    slug: "coffee",
    query: "pour over coffee morning light cup",
    captionBeat: "so simple",
    captionClip: "pour-over coffee in morning light",
  },
  {
    slug: "sunrise",
    query: "runners jogging sunrise outdoors path",
    captionBeat: "nobody told you sooner",
    captionClip: "runners at sunrise",
  },
] as const;

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} for ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

function trimCompress(input: string, output: string): void {
  // ~7s loopable clip, small portrait preview, muted audio stripped.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      input,
      "-t",
      "7",
      "-an",
      "-vf",
      "scale=360:-2:flags=lanczos",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "28",
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      output,
    ],
    { stdio: "inherit" }
  );
}

async function main() {
  if (!process.env.PEXELS_API_KEY?.trim()) {
    console.error("PEXELS_API_KEY is required");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const used = new Set<string>();
  const manifest: Array<Record<string, unknown>> = [];

  for (const target of TARGETS) {
    const candidates = await searchPexelsVideos(target.query, {
      perPage: 10,
      page: 1,
      orientation: "portrait",
      excludeUrls: used,
    });
    // Prefer 6-9s clips, then short clips (2-15s) when available.
    const pick =
      candidates.find(
        (c) => c.durationSeconds >= 6 && c.durationSeconds <= 9
      ) ??
      candidates.find(
        (c) => c.durationSeconds >= 2 && c.durationSeconds <= 15
      ) ??
      candidates.find((c) => c.durationSeconds > 0 && c.durationSeconds <= 30) ??
      candidates[0];

    if (!pick) {
      throw new Error(`No Pexels result for query: ${target.query}`);
    }

    used.add(pick.previewUrl);
    used.add(pick.sourceUrl);

    const rawPath = join(TMP_DIR, `${target.slug}-raw.mp4`);
    const outPath = join(OUT_DIR, `${target.slug}.mp4`);
    console.log(`\n[${target.slug}] id=${pick.id} ${pick.durationSeconds}s`);
    console.log(`  query: ${target.query}`);
    console.log(`  source: ${pick.sourceUrl}`);
    console.log(`  preview: ${pick.previewUrl}`);
    console.log(`  photographer: ${pick.photographerName}`);

    await download(pick.previewUrl, rawPath);
    trimCompress(rawPath, outPath);
    if (existsSync(rawPath)) unlinkSync(rawPath);

    manifest.push({
      slug: target.slug,
      pexelsId: pick.id,
      query: target.query,
      sourceUrl: pick.sourceUrl,
      photographerName: pick.photographerName,
      photographerUrl: pick.photographerUrl,
      originalDurationSeconds: pick.durationSeconds,
      output: `client/src/assets/broll-generator/clips/${target.slug}.mp4`,
      captionBeat: target.captionBeat,
      captionClip: target.captionClip,
    });
  }

  writeFileSync(
    join(TMP_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("\nWrote manifest to tmp/broll-gallery-source/manifest.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
