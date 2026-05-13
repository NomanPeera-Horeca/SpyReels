/**
 * One-time uploader for the landing-page hero video.
 *
 * Run (from repo root):
 *   export CLOUDFLARE_R2_ENDPOINT=...
 *   export CLOUDFLARE_R2_ACCESS_KEY_ID=...
 *   export CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
 *   export CLOUDFLARE_R2_BUCKET=...
 *   export CLOUDFLARE_R2_PUBLIC_URL=...
 *   tsx scripts/upload-landing-video.ts ~/Desktop/0512_compressed.mp4
 *
 * Uploads the file to R2 at `landing/hero-demo-v1.mp4` with
 * Content-Type `video/mp4` and prints the public URL.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { storagePut } from "../server/storage";

const R2_KEY = "landing/hero-demo-v1.mp4";
const CONTENT_TYPE = "video/mp4";

function resolveInputPath(input: string): string {
  if (input.startsWith("~/") || input === "~") {
    return path.join(os.homedir(), input.slice(1));
  }
  return path.resolve(input);
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error(
      "Usage: tsx scripts/upload-landing-video.ts <path-to-video.mp4>"
    );
    process.exit(1);
  }

  const absolute = resolveInputPath(inputArg);

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absolute);
  } catch (err) {
    console.error(`[upload-landing-video] cannot read file: ${absolute}`);
    throw err;
  }

  if (!stat.isFile()) {
    throw new Error(`[upload-landing-video] not a regular file: ${absolute}`);
  }

  console.log(`[upload-landing-video] source: ${absolute}`);
  console.log(`[upload-landing-video] size:   ${formatMb(stat.size)}`);
  console.log(`[upload-landing-video] target: r2://${R2_KEY}`);

  const buffer = await fs.readFile(absolute);
  const start = Date.now();
  const result = await storagePut(R2_KEY, buffer, CONTENT_TYPE);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`[upload-landing-video] uploaded in ${elapsed}s`);
  console.log(`  key: ${result.key}`);
  console.log(`  url: ${result.url}`);
  console.log("");
  console.log(
    "Next step: paste the URL above into HERO_VIDEO_URL in client/src/pages/LandingPage.tsx"
  );
}

main().catch((err) => {
  console.error("[upload-landing-video] failed:", err);
  process.exit(1);
});
