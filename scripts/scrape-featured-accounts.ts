/**
 * Scrapes the top 30 reels (by engagement rate, last 12 months) for every
 * active row in `featured_accounts` and writes them to `featured_reels`.
 *
 * Reuses `fetchProfile` / `scrapeReels` from server/instagram.ts — no
 * duplicated HTTP logic. DB access is raw mysql2 for parity with the
 * existing seed scripts.
 *
 * Idempotent: re-running UPSERTs new reels and DELETEs any stale reels
 * for the same account that fell out of the top 30.
 *
 * Env required:
 *   DATABASE_URL              — MySQL connection string
 *   SCRAPECREATORS_API_KEY    — loaded via dotenv from .env
 *   CLOUDFLARE_R2_*           — optional; if missing, raw IG pic URL is used
 *
 * Run with:
 *   DATABASE_URL="..." npx tsx scripts/scrape-featured-accounts.ts
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { fetchProfile, scrapeReels, type ReelData } from "../server/instagram";
import { ensureProfilePicOnR2 } from "../server/profilePicR2";
import { ensureReelThumbnailOnR2 } from "../server/reelThumbnailR2";
import { ensureReelVideoOnR2 } from "../server/reelVideoR2";

const TIMEFRAME_DAYS = 365;
const TOP_N = 30;
const MAX_REELS = 500;
const PER_ACCOUNT_TIMEOUT_MS = 5 * 60 * 1000;
const INTER_ACCOUNT_SLEEP_MS = 1500;

// Decimal(5,2) — max 999.99
const MAX_ENGAGEMENT_RATE = 999.99;

interface AccountRow {
  id: number;
  handle: string;
  displayName: string | null;
}

type AccountStatus = "success" | "skipped_private_or_missing" | "skipped_no_reels" | "failed";

interface AccountResult {
  handle: string;
  status: AccountStatus;
  reelsStored: number;
  reason?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Per-reel engagement rate, defined by the spec as
 *   ((likes + comments) / views) * 100
 * Guards:
 *   - viewCount <= 0  → 0 (avoids divide-by-zero / noise)
 *   - result capped at 999.99 to fit decimal(5,2)
 */
function reelEngagementRate(r: ReelData): number {
  if (!r.viewCount || r.viewCount <= 0) return 0;
  const pct = ((r.likeCount + r.commentCount) / r.viewCount) * 100;
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return Math.min(Math.round(pct * 100) / 100, MAX_ENGAGEMENT_RATE);
}

/**
 * Classify an error thrown by fetchProfile/scrapeReels so we know whether
 * to hard-skip (mark isActive=false) or retry once.
 * `fetchProfile` and `scrapeReels` both throw Error with messages like:
 *   - "User @foo not found…"
 *   - "The account @foo is private…"
 *   - "Instagram rate limit reached…"
 *   - "Failed to fetch profile for @foo: HTTP 500"
 */
function isPermanentError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("is private") ||
    msg.includes("not accessible") ||
    msg.includes("http 404")
  );
}

/**
 * Store profile pic on R2 at the canonical key (see server/profilePicR2.ts).
 * If R2 is unavailable, fall back to the raw IG URL (UI handles expiry).
 */
async function profilePicR2OrRaw(handle: string, rawUrl: string): Promise<string> {
  if (!rawUrl) return "";
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  const onR2 = await ensureProfilePicOnR2(clean, rawUrl);
  if (onR2) return onR2;
  return rawUrl;
}

async function scrapeOneAccount(
  conn: mysql.Connection,
  account: AccountRow,
  idx: number,
  total: number
): Promise<AccountResult> {
  const handle = account.handle;
  console.log(`\n[${idx}/${total}] Scraping @${handle}…`);

  // --- 1. Scrape with one retry on transient error ------------------------
  let profileBio = "";
  let reels: ReelData[] = [];
  let followerCount = 0;
  let profilePicUrl = "";
  let attempts = 0;

  while (attempts < 2) {
    attempts++;
    try {
      // fetchProfile gives us bio; scrapeReels gives us reels + follower
      // count + pic. Both call ScrapeCreators so keep them as-is and pay
      // the extra profile call (1 credit) — bio isn't returned by scrapeReels.
      const profile = await fetchProfile(handle);
      profileBio = profile.biography;

      const res = await scrapeReels(handle, TIMEFRAME_DAYS, undefined, {
        maxReels: MAX_REELS,
        timeoutMs: PER_ACCOUNT_TIMEOUT_MS,
      });
      reels = res.reels;
      followerCount = res.followerCount;
      profilePicUrl = res.profilePicUrl;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isPermanentError(err)) {
        console.warn(`    ✗ permanent error for @${handle}: ${msg}`);
        await markInactive(conn, account.id, msg);
        return { handle, status: "skipped_private_or_missing", reelsStored: 0, reason: msg };
      }
      if (attempts >= 2) {
        console.warn(`    ✗ failed twice for @${handle}: ${msg}`);
        return { handle, status: "failed", reelsStored: 0, reason: msg };
      }
      console.warn(`    ⚠  transient error, retrying in 5s: ${msg}`);
      await sleep(5000);
    }
  }

  if (reels.length === 0) {
    console.warn(`    ✗ no reels in last ${TIMEFRAME_DAYS} days for @${handle}, marking inactive`);
    await markInactive(conn, account.id, "no reels in 12mo window");
    return { handle, status: "skipped_no_reels", reelsStored: 0 };
  }

  // --- 2. Rank: engagement rate desc, take top N --------------------------
  const ranked = reels
    .map((r) => ({ reel: r, er: reelEngagementRate(r) }))
    .sort((a, b) => b.er - a.er);

  const topN = ranked.slice(0, TOP_N);
  const topShortcodes = topN.map((x) => x.reel.shortcode);

  // avg across the full 12mo window (more representative than top-30).
  const avgEr =
    ranked.length > 0
      ? Math.min(
          ranked.reduce((sum, x) => sum + x.er, 0) / ranked.length,
          MAX_ENGAGEMENT_RATE
        )
      : 0;

  console.log(
    `    ✓ ${reels.length} reels found, top ${topN.length} kept, avg ER ${avgEr.toFixed(2)}%, followers ${followerCount}`
  );

  // --- 3. Proxy profile pic (best-effort) ---------------------------------
  const proxiedPic = await profilePicR2OrRaw(handle, profilePicUrl);

  // --- 4. Upsert reels, then delete stale ones ----------------------------
  const thumbPublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  let thumbR2Ok = 0;
  let thumbR2Fallback = 0;
  let videoR2Ok = 0;
  let videoR2Fallback = 0;

  for (let i = 0; i < topN.length; i++) {
    const { reel, er } = topN[i];
    const rank = i + 1;
    const thumbUrl = await ensureReelThumbnailOnR2(reel.shortcode, reel.thumbnailUrl ?? "");
    const videoUrlStable = await ensureReelVideoOnR2(reel.shortcode, reel.videoUrl ?? "");
    if (thumbPublicBase && thumbUrl.startsWith(thumbPublicBase)) {
      thumbR2Ok++;
    } else {
      thumbR2Fallback++;
    }
    if (thumbPublicBase && videoUrlStable.startsWith(thumbPublicBase)) {
      videoR2Ok++;
    } else {
      videoR2Fallback++;
    }
    await conn.execute(
      `INSERT INTO featured_reels
         (featuredAccountId, reelShortcode, caption, viewCount, likeCount,
          commentCount, engagementRate, thumbnailUrl, videoUrl, duration,
          postedAt, \`rank\`, scrapedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         caption         = VALUES(caption),
         viewCount       = VALUES(viewCount),
         likeCount       = VALUES(likeCount),
         commentCount    = VALUES(commentCount),
         engagementRate  = VALUES(engagementRate),
         thumbnailUrl    = VALUES(thumbnailUrl),
         videoUrl        = VALUES(videoUrl),
         duration        = VALUES(duration),
         postedAt        = VALUES(postedAt),
         \`rank\`          = VALUES(\`rank\`),
         scrapedAt       = CURRENT_TIMESTAMP`,
      [
        account.id,
        reel.shortcode,
        reel.caption,
        reel.viewCount,
        reel.likeCount,
        reel.commentCount,
        er.toFixed(2),
        thumbUrl,
        videoUrlStable,
        reel.duration,
        reel.postedAt,
        rank,
      ]
    );
  }

  console.log(`  thumbnails: r2=${thumbR2Ok} fallback=${thumbR2Fallback}`);
  console.log(`  videos:     r2=${videoR2Ok} fallback=${videoR2Fallback}`);

  // Delete any previously-stored reels for this account that dropped out
  // of the new top N.
  if (topShortcodes.length > 0) {
    const placeholders = topShortcodes.map(() => "?").join(",");
    await conn.execute(
      `DELETE FROM featured_reels
        WHERE featuredAccountId = ?
          AND reelShortcode NOT IN (${placeholders})`,
      [account.id, ...topShortcodes]
    );
  } else {
    await conn.execute(
      `DELETE FROM featured_reels WHERE featuredAccountId = ?`,
      [account.id]
    );
  }

  // --- 5. Update featured_accounts row ------------------------------------
  // totalReelsEver: we only see reels inside the 12mo window (capped at
  // MAX_REELS). Storing that count here; schema column name is aspirational.
  await conn.execute(
    `UPDATE featured_accounts
        SET followerCount      = ?,
            avgEngagementRate  = ?,
            totalReelsEver     = ?,
            profilePicUrl      = ?,
            bio                = ?,
            lastFullScrape     = CURRENT_TIMESTAMP,
            isActive           = true,
            updatedAt          = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [
      followerCount,
      avgEr.toFixed(2),
      reels.length,
      proxiedPic || null,
      profileBio || null,
      account.id,
    ]
  );

  return { handle, status: "success", reelsStored: topN.length };
}

async function markInactive(
  conn: mysql.Connection,
  accountId: number,
  reason: string
): Promise<void> {
  await conn.execute(
    `UPDATE featured_accounts
        SET isActive = false,
            lastFullScrape = CURRENT_TIMESTAMP,
            updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [accountId]
  );
  console.log(`    → marked inactive (${reason.slice(0, 80)})`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL env var not set");
    process.exit(1);
  }
  if (!process.env.SCRAPECREATORS_API_KEY?.trim()) {
    console.error("ERROR: SCRAPECREATORS_API_KEY not set (expected via .env or shell env)");
    process.exit(1);
  }

  const host = new URL(databaseUrl).hostname;
  const env = host.includes("shinkansen")
    ? "STAGING"
    : host.includes("maglev")
    ? "PRODUCTION"
    : "UNKNOWN";
  console.log(`DB host:      ${host}`);
  console.log(`Environment:  ${env}`);
  console.log(`Timeframe:    last ${TIMEFRAME_DAYS} days`);
  console.log(`Top-N:        ${TOP_N} per account`);
  console.log(`Max reels:    ${MAX_REELS} per account`);
  console.log(
    `R2 proxy:     ${
      process.env.CLOUDFLARE_R2_ENDPOINT ? "enabled" : "disabled (will store raw IG URL)"
    }`
  );
  console.log("\nProceeding in 5 seconds. Ctrl+C to abort.");
  await sleep(5000);

  const conn = await mysql.createConnection(databaseUrl);

  const [accountRows]: any = await conn.execute(
    `SELECT id, handle, displayName
       FROM featured_accounts
      WHERE isActive = true AND lastFullScrape IS NULL
      ORDER BY id ASC`
  );
  const accounts: AccountRow[] = accountRows;
  console.log(`\nLoaded ${accounts.length} active featured accounts.\n`);

  const startTime = Date.now();
  const results: AccountResult[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    try {
      const result = await scrapeOneAccount(conn, account, i + 1, accounts.length);
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ✗ unexpected error for @${account.handle}: ${msg}`);
      results.push({
        handle: account.handle,
        status: "failed",
        reelsStored: 0,
        reason: msg,
      });
    }
    if (i < accounts.length - 1) {
      await sleep(INTER_ACCOUNT_SLEEP_MS);
    }
  }

  await conn.end();

  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
  const success = results.filter((r) => r.status === "success");
  const skippedPriv = results.filter((r) => r.status === "skipped_private_or_missing");
  const skippedNoReels = results.filter((r) => r.status === "skipped_no_reels");
  const failed = results.filter((r) => r.status === "failed");
  const totalReelsStored = results.reduce((sum, r) => sum + r.reelsStored, 0);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("SCRAPE SUMMARY");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`Elapsed:                    ${elapsedMin} min`);
  console.log(`Accounts processed:         ${results.length}`);
  console.log(`  ✓ success:                ${success.length}`);
  console.log(`  ⚠  no reels (inactive):   ${skippedNoReels.length}`);
  console.log(`  ✗ private/404 (inactive): ${skippedPriv.length}`);
  console.log(`  ✗ hard failures:          ${failed.length}`);
  console.log(`Total featured_reels rows:  ${totalReelsStored}`);

  if (skippedPriv.length > 0) {
    console.log("\nPrivate / 404 (marked inactive):");
    for (const r of skippedPriv) console.log(`  @${r.handle} — ${r.reason ?? ""}`);
  }
  if (skippedNoReels.length > 0) {
    console.log("\nNo reels in 12mo window (marked inactive):");
    for (const r of skippedNoReels) console.log(`  @${r.handle}`);
  }
  if (failed.length > 0) {
    console.log("\nHard failures (NOT marked inactive, retry next run):");
    for (const r of failed) console.log(`  @${r.handle} — ${r.reason ?? ""}`);
  }

  console.log("\n✓ Scrape complete");
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});
