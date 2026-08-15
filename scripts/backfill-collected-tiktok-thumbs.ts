/**
 * Backfill collected_reels TikTok thumbnails that were mirrored as HEIC under
 * reel-thumbs/ (content-type image/jpeg). Browsers show a blank tile.
 *
 * Re-fetches cover metadata when possible, converts to JPEG at
 * tiktok-thumbs/{awemeId}.jpg, and updates thumbnailUrl.
 *
 * Env:
 *   DATABASE_URL
 *   CLOUDFLARE_R2_* (same as ingest)
 *
 * Run:
 *   pnpm exec tsx --env-file=.env scripts/backfill-collected-tiktok-thumbs.ts
 *   pnpm exec tsx --env-file=.env scripts/backfill-collected-tiktok-thumbs.ts --userId=9
 *   pnpm exec tsx --env-file=.env scripts/backfill-collected-tiktok-thumbs.ts --dry-run
 */

import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { collectedReels } from "../drizzle/schema";
import { getDb } from "../server/db";
import { fetchCollectedReelMetadataForPlatform } from "../server/collectedReelFetch";
import { ensureTiktokThumbnailOnR2 } from "../server/tiktokThumbnailR2";

const PAGE_SIZE = 50;
const CONCURRENCY = 3;

function needsHeicAwareThumb(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return true;
  if (u.includes("/tiktok-thumbs/")) return false;
  return true;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const userArg = process.argv.find((a) => a.startsWith("--userId="));
  const userId = userArg ? Number(userArg.slice("--userId=".length)) : null;
  if (userArg && (!Number.isFinite(userId) || (userId as number) <= 0)) {
    throw new Error("Invalid --userId=");
  }

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim()) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL is required");
  }

  const filters = [
    eq(collectedReels.platform, "tiktok"),
    eq(collectedReels.status, "ready"),
    sql`(
      ${collectedReels.thumbnailUrl} IS NULL
      OR TRIM(${collectedReels.thumbnailUrl}) = ''
      OR ${collectedReels.thumbnailUrl} NOT LIKE '%/tiktok-thumbs/%'
    )`,
  ];
  if (userId) filters.push(eq(collectedReels.userId, userId));

  const [countRow] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(collectedReels)
    .where(and(...filters));

  const target = Number(countRow?.c ?? 0);
  console.log(
    `TikTok collected rows needing HEIC-aware thumb${userId ? ` (user ${userId})` : ""}: ${target}` +
      (dryRun ? " [dry-run]" : "")
  );

  let healed = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  let lastId = 0;

  for (;;) {
    const rows = await db
      .select({
        id: collectedReels.id,
        shortcode: collectedReels.shortcode,
        reelUrl: collectedReels.reelUrl,
        thumbnailUrl: collectedReels.thumbnailUrl,
      })
      .from(collectedReels)
      .where(and(sql`${collectedReels.id} > ${lastId}`, ...filters))
      .orderBy(collectedReels.id)
      .limit(PAGE_SIZE);

    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;

    let next = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = next++;
        if (i >= rows.length) return;
        const row = rows[i]!;
        processed += 1;

        if (!needsHeicAwareThumb(row.thumbnailUrl)) {
          skipped += 1;
          continue;
        }

        try {
          let source = (row.thumbnailUrl ?? "").trim();
          const outcome = await fetchCollectedReelMetadataForPlatform(
            "tiktok",
            row.shortcode,
            row.reelUrl?.trim() || undefined
          );
          if (outcome.ok && outcome.data.thumbnailUrl?.trim()) {
            source = outcome.data.thumbnailUrl.trim();
          }
          if (!source) {
            failed += 1;
            console.warn(`[skip] id=${row.id} shortcode=${row.shortcode}: no source thumb`);
            continue;
          }

          if (dryRun) {
            console.log(
              `[dry-run] id=${row.id} shortcode=${row.shortcode} source=${source.slice(0, 80)}…`
            );
            healed += 1;
            continue;
          }

          const out = await ensureTiktokThumbnailOnR2(row.shortcode, source, {
            force: true,
          });
          if (!out.includes("/tiktok-thumbs/")) {
            failed += 1;
            console.warn(
              `[fail] id=${row.id} shortcode=${row.shortcode}: got ${out.slice(0, 100)}`
            );
            continue;
          }

          await db
            .update(collectedReels)
            .set({ thumbnailUrl: out })
            .where(eq(collectedReels.id, row.id));
          healed += 1;
          console.log(`[ok] id=${row.id} shortcode=${row.shortcode}`);
        } catch (err) {
          failed += 1;
          console.warn(
            `[fail] id=${row.id} shortcode=${row.shortcode}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    });

    await Promise.all(workers);
    console.log(
      `… processed=${processed} healed=${healed} skipped=${skipped} failed=${failed}`
    );
  }

  console.log(
    `Done. processed=${processed} healed=${healed} skipped=${skipped} failed=${failed}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
