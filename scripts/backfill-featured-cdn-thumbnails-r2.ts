/**
 * Backfill: move featured_reels.thumbnailUrl off expiring Instagram CDN URLs
 * onto Cloudflare R2 via the shared `ensureReelThumbnailOnR2` helper (same
 * shortcode key the scrape pipeline uses).
 *
 * Only touches rows whose thumbnailUrl still looks like an Instagram CDN /
 * fbcdn host. Already-R2 rows are skipped.
 *
 * Env:
 *   DATABASE_URL
 *   CLOUDFLARE_R2_ENDPOINT / ACCESS_KEY_ID / SECRET_ACCESS_KEY / BUCKET / PUBLIC_URL
 *
 * Run:
 *   pnpm exec tsx --env-file=.env scripts/backfill-featured-cdn-thumbnails-r2.ts
 */

import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { featuredReels } from "../drizzle/schema";
import { getDb } from "../server/db";
import { ensureReelThumbnailOnR2 } from "../server/reelThumbnailR2";

const PAGE_SIZE = 100;
const CONCURRENCY = 4;

function isCdnThumb(url: string): boolean {
  return /cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(url);
}

function isStableThumb(url: string): boolean {
  const base = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (base && url.startsWith(base)) return true;
  try {
    const host = new URL(url).host;
    return host.endsWith(".r2.dev") || host.includes("cloudfront.net");
  } catch {
    return false;
  }
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim()) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL is required");
  }

  const [countRow] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(featuredReels)
    .where(
      and(
        sql`${featuredReels.thumbnailUrl} IS NOT NULL`,
        sql`TRIM(${featuredReels.thumbnailUrl}) != ''`,
        sql`(
          ${featuredReels.thumbnailUrl} LIKE '%cdninstagram%'
          OR ${featuredReels.thumbnailUrl} LIKE '%fbcdn%'
          OR ${featuredReels.thumbnailUrl} LIKE '%instagram.com/%'
        )`
      )
    );

  const target = Number(countRow?.c ?? 0);
  console.log(`CDN thumbnail rows to consider: ${target}`);

  let healed = 0;
  let alreadyStable = 0;
  let failed = 0;
  let processed = 0;
  let lastId = 0;

  for (;;) {
    const rows = await db
      .select({
        id: featuredReels.id,
        reelShortcode: featuredReels.reelShortcode,
        thumbnailUrl: featuredReels.thumbnailUrl,
      })
      .from(featuredReels)
      .where(
        and(
          sql`${featuredReels.id} > ${lastId}`,
          sql`${featuredReels.thumbnailUrl} IS NOT NULL`,
          sql`TRIM(${featuredReels.thumbnailUrl}) != ''`,
          sql`(
            ${featuredReels.thumbnailUrl} LIKE '%cdninstagram%'
            OR ${featuredReels.thumbnailUrl} LIKE '%fbcdn%'
            OR ${featuredReels.thumbnailUrl} LIKE '%instagram.com/%'
          )`
        )
      )
      .orderBy(featuredReels.id)
      .limit(PAGE_SIZE);

    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;

    let next = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = next++;
        if (i >= rows.length) return;
        const row = rows[i]!;
        const src = (row.thumbnailUrl ?? "").trim();
        processed += 1;

        if (!isCdnThumb(src)) {
          alreadyStable += 1;
          continue;
        }

        try {
          const out = await ensureReelThumbnailOnR2(row.reelShortcode, src);
          if (isStableThumb(out) && out !== src) {
            await db
              .update(featuredReels)
              .set({ thumbnailUrl: out })
              .where(eq(featuredReels.id, row.id));
            healed += 1;
          } else {
            failed += 1;
            console.warn(
              `  [id=${row.id} ${row.reelShortcode}] heal failed; still CDN`
            );
          }
        } catch (err) {
          failed += 1;
          console.warn(
            `  [id=${row.id}] error:`,
            err instanceof Error ? err.message : err
          );
        }

        if (processed % 25 === 0) {
          console.log(
            `[${processed}/${target}] healed=${healed} failed=${failed} skipped=${alreadyStable}`
          );
        }
      }
    });
    await Promise.all(workers);
  }

  console.log("\n========== FINAL ==========");
  console.log(`Processed: ${processed}`);
  console.log(`Healed (CDN → R2 + DB update): ${healed}`);
  console.log(`Failed / still CDN: ${failed}`);
  console.log(`Skipped non-CDN in batch: ${alreadyStable}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
