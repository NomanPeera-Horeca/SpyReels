/**
 * Backfill: refresh featured_reels.videoUrl from ScrapeCreators, copy the
 * fresh Instagram CDN MP4 to Cloudflare R2, then UPDATE the row to the stable
 * public URL.
 *
 * Run (from repo root):
 *   export DATABASE_URL='mysql://...'
 *   export SCRAPECREATORS_API_KEY=...
 *   export CLOUDFLARE_R2_ENDPOINT=...
 *   export CLOUDFLARE_R2_ACCESS_KEY_ID=...
 *   export CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
 *   export CLOUDFLARE_R2_BUCKET=...
 *   export CLOUDFLARE_R2_PUBLIC_URL=...
 *   node --import tsx scripts/backfill-featured-reel-videos.ts
 *
 * Flags:
 *   --limit N        process at most N eligible rows
 *   --dry-run        list work without refreshing URLs, uploading, or writing DB rows
 *   --retry-failed   restrict work to rows that still look like IG/CDN video URLs
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { fetchReelByShortcode } from "../server/instagram";
import { ensureReelVideoOnR2 } from "../server/reelVideoR2";

const PAGE_SIZE = 200;
const CONCURRENCY = 3;
const PROGRESS_EVERY = 25;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const PAUSE_MS = 5_000;

const ALLOWED_HOST_MARKERS = ["shinkansen", "maglev"] as const;

type FailureKind =
  | "http403_404"
  | "timeout"
  | "url_refresh_failed"
  | "too_large"
  | "r2"
  | "db"
  | "other";

const failureCounts: Record<FailureKind, number> = {
  http403_404: 0,
  timeout: 0,
  url_refresh_failed: 0,
  too_large: 0,
  r2: 0,
  db: 0,
  other: 0,
};

interface CliOptions {
  limit: number | null;
  dryRun: boolean;
  retryFailed: boolean;
}

interface VideoRow {
  id: number;
  reelShortcode: string;
  videoUrl: string | null;
}

let migrated = 0;
let alreadyR2Skipped = 0;
let emptySkipped = 0;
let dryRunSkipped = 0;
let failed = 0;
let processed = 0;
let refreshed = 0;
let tooLargeSkipped = 0;
let urlRefreshAttempts = 0;

let totalTargetForLog = 0;

let shuttingDown = false;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function validateDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const ok = ALLOWED_HOST_MARKERS.some((m) => host.includes(m));
  if (!ok) {
    throw new Error(
      `DATABASE_URL host must be staging (shinkansen) or production (maglev). Got: ${host}`
    );
  }
  return raw;
}

function validateR2Env(): { publicUrlBase: string } {
  requireEnv("CLOUDFLARE_R2_ENDPOINT");
  requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID");
  requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  requireEnv("CLOUDFLARE_R2_BUCKET");
  const pub = requireEnv("CLOUDFLARE_R2_PUBLIC_URL").replace(/\/+$/, "");
  return { publicUrlBase: pub };
}

function parseCliOptions(argv: string[]): CliOptions {
  const opts: CliOptions = {
    limit: null,
    dryRun: false,
    retryFailed: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (arg === "--retry-failed") {
      opts.retryFailed = true;
      continue;
    }
    if (arg === "--limit") {
      const raw = argv[i + 1];
      if (!raw || !/^\d+$/.test(raw)) {
        throw new Error("--limit requires a positive integer");
      }
      const n = Number(raw);
      if (n <= 0 || n > Number.MAX_SAFE_INTEGER) {
        throw new Error("--limit out of range");
      }
      opts.limit = n;
      i++;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const raw = arg.slice("--limit=".length);
      if (!/^\d+$/.test(raw)) {
        throw new Error("--limit requires a positive integer");
      }
      const n = Number(raw);
      if (n <= 0 || n > Number.MAX_SAFE_INTEGER) {
        throw new Error("--limit out of range");
      }
      opts.limit = n;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

/**
 * Optional test scope: `FEATURED_ACCOUNT_IDS=94,36,39` (comma-separated positive integers only).
 */
function parseFeaturedAccountIdsFilter(): { ids: number[]; sql: string } | null {
  const raw = process.env.FEATURED_ACCOUNT_IDS?.trim();
  if (!raw) {
    return null;
  }
  const parts = raw.split(",");
  const ids: number[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (t === "") {
      throw new Error(
        "FEATURED_ACCOUNT_IDS: empty segment; use comma-separated integers only (e.g. 94,36,39)."
      );
    }
    if (!/^\d+$/.test(t)) {
      throw new Error("FEATURED_ACCOUNT_IDS: must be comma-separated integers only.");
    }
    const n = Number(t);
    if (n < 0 || n > Number.MAX_SAFE_INTEGER) {
      throw new Error("FEATURED_ACCOUNT_IDS: id out of range.");
    }
    ids.push(n);
  }
  if (ids.length === 0) {
    throw new Error("FEATURED_ACCOUNT_IDS: no valid ids after parsing.");
  }
  return { ids, sql: `AND featuredAccountId IN (${ids.join(",")})` };
}

function isAlreadyPublicR2(videoUrl: string, publicBase: string): boolean {
  const t = videoUrl.trim();
  if (!t) {
    return false;
  }
  return t.startsWith(publicBase);
}

function isLikelyInstagramVideoUrl(videoUrl: string): boolean {
  const t = videoUrl.trim().toLowerCase();
  return (
    t.startsWith("https://instagram.") ||
    t.startsWith("https://video.") ||
    t.includes("cdninstagram.com") ||
    t.includes("fbcdn.net")
  );
}

function classifyRefreshFailure(err: unknown): FailureKind {
  const e = err as {
    code?: string;
    message?: string;
    response?: { statusCode?: number };
  };
  const msg = (e?.message || String(err)).toLowerCase();
  const code = e?.code;
  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return "timeout";
  }
  const sc = e?.response?.statusCode;
  if (sc === 403 || sc === 404) {
    return "http403_404";
  }
  return "url_refresh_failed";
}

function classifyR2OrDbError(err: unknown): FailureKind {
  const e = err as { message?: string; code?: string };
  const msg = (e?.message || String(err)).toLowerCase();
  if (msg.includes("er_lock") || msg.includes("deadlock") || msg.includes("mysql")) {
    return "db";
  }
  return "r2";
}

function failureTotal(): number {
  return (
    failureCounts.http403_404 +
    failureCounts.timeout +
    failureCounts.url_refresh_failed +
    failureCounts.r2 +
    failureCounts.db +
    failureCounts.other
  );
}

function logProgressLine() {
  const f = failureTotal();
  console.log(
    `[${processed}/${totalTargetForLog}] migrated=${migrated} refreshed=${refreshed} skipped_alr2=${alreadyR2Skipped} too_large=${tooLargeSkipped} failed=${f} empty_skipped=${emptySkipped} dry_run=${dryRunSkipped}`
  );
  console.log(
    `  failures: 403/404=${failureCounts.http403_404} timeout=${failureCounts.timeout} url_refresh_failed=${failureCounts.url_refresh_failed} too_large=${failureCounts.too_large} r2=${failureCounts.r2} db=${failureCounts.db} other=${failureCounts.other}`
  );
}

function afterProcessStep() {
  processed += 1;
  if (processed % PROGRESS_EVERY === 0) {
    logProgressLine();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function processOneReel(
  conn: mysql.Connection,
  row: VideoRow,
  publicBase: string,
  opts: CliOptions
): Promise<void> {
  const { id, reelShortcode, videoUrl } = row;

  if (videoUrl == null || String(videoUrl).trim() === "") {
    emptySkipped += 1;
    afterProcessStep();
    return;
  }

  const src = String(videoUrl).trim();
  const shortcode = String(reelShortcode || "").trim();

  try {
    if (isAlreadyPublicR2(src, publicBase)) {
      alreadyR2Skipped += 1;
      afterProcessStep();
      return;
    }

    if (opts.retryFailed && !isLikelyInstagramVideoUrl(src)) {
      emptySkipped += 1;
      afterProcessStep();
      return;
    }

    if (!shortcode) {
      failureCounts.url_refresh_failed += 1;
      failed += 1;
      console.warn(`  [id=${id}] missing reelShortcode; cannot refresh video URL`);
      afterProcessStep();
      return;
    }

    if (opts.dryRun) {
      dryRunSkipped += 1;
      console.log(`  [id=${id}] dry-run: would refresh shortcode=${shortcode} and mirror video`);
      afterProcessStep();
      return;
    }

    urlRefreshAttempts += 1;
    let freshVideoUrl = "";
    try {
      const fresh = await withTimeout(
        fetchReelByShortcode(shortcode),
        DOWNLOAD_TIMEOUT_MS,
        `fetchReelByShortcode(${shortcode})`
      );
      freshVideoUrl = String(fresh?.videoUrl ?? "").trim();
      if (!freshVideoUrl) {
        failureCounts.url_refresh_failed += 1;
        failed += 1;
        console.warn(`  [id=${id}] URL refresh returned no videoUrl for shortcode=${shortcode}`);
        afterProcessStep();
        return;
      }
      refreshed += 1;
    } catch (err) {
      const k = classifyRefreshFailure(err);
      failureCounts[k] += 1;
      failed += 1;
      console.warn(
        `  [id=${id}] URL refresh error (${k}) shortcode=${shortcode}:`,
        err instanceof Error ? err.message : err
      );
      afterProcessStep();
      return;
    }

    let r2Url = "";
    try {
      r2Url = await withTimeout(
        ensureReelVideoOnR2(shortcode, freshVideoUrl),
        DOWNLOAD_TIMEOUT_MS,
        `ensureReelVideoOnR2(${shortcode})`
      );
    } catch (err) {
      const k = classifyR2OrDbError(err);
      failureCounts[k] += 1;
      failed += 1;
      console.warn(
        `  [id=${id}] R2 mirror failed (${k}) shortcode=${shortcode}:`,
        err instanceof Error ? err.message : err
      );
      afterProcessStep();
      return;
    }

    if (!r2Url || !isAlreadyPublicR2(r2Url, publicBase)) {
      failureCounts.too_large += 1;
      tooLargeSkipped += 1;
      console.warn(
        `  [id=${id}] too_large: helper returned non-R2 URL for shortcode=${shortcode}; leaving DB unchanged`
      );
      afterProcessStep();
      return;
    }

    try {
      await conn.query("UPDATE featured_reels SET videoUrl = ? WHERE id = ?", [r2Url, id]);
      migrated += 1;
    } catch (err) {
      recordDbFailure(id, err);
      return;
    }

    afterProcessStep();
  } catch (err) {
    failureCounts.other += 1;
    failed += 1;
    console.warn(`  [id=${id}] unexpected:`, err instanceof Error ? err.message : err);
    afterProcessStep();
  }
}

function recordDbFailure(id: number, err: unknown) {
  failureCounts.db += 1;
  failed += 1;
  console.warn(`  [id=${id}] DB error:`, err instanceof Error ? err.message : err);
  afterProcessStep();
}

async function runPage(
  conn: mysql.Connection,
  rows: VideoRow[],
  publicBase: string,
  opts: CliOptions
) {
  let next = 0;
  const n = rows.length;
  const workers = Array.from({ length: Math.min(CONCURRENCY, n) }, async () => {
    for (;;) {
      if (shuttingDown) {
        return;
      }
      const j = next++;
      if (j >= n) {
        return;
      }
      await processOneReel(conn, rows[j]!, publicBase, opts);
    }
  });
  await Promise.all(workers);
}

async function main() {
  process.on("SIGINT", () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(
      "\nSIGINT: will finish the current page (up to " + PAGE_SIZE + " rows) then exit with stats.\n"
    );
  });

  const databaseUrl = validateDatabaseUrl();
  const { publicUrlBase } = validateR2Env();
  const opts = parseCliOptions(process.argv.slice(2));
  const accountFilter = parseFeaturedAccountIdsFilter();
  const accSql = accountFilter?.sql ?? "";
  const retrySql = opts.retryFailed
    ? `AND (
           videoUrl LIKE 'https://instagram.%'
        OR videoUrl LIKE 'https://video.%'
        OR videoUrl LIKE '%cdninstagram.com%'
        OR videoUrl LIKE '%fbcdn.net%'
       )`
    : "";

  if (accountFilter) {
    console.log(
      "FEATURED_ACCOUNT_IDS: restricting to account IDs: " + accountFilter.ids.join(", ")
    );
  }
  if (opts.limit != null) {
    console.log("CLI --limit: processing at most " + opts.limit + " rows");
  }
  if (opts.dryRun) {
    console.log("CLI --dry-run: no URL refresh, R2 upload, or DB update will run");
  }
  if (opts.retryFailed) {
    console.log("CLI --retry-failed: restricting to IG/CDN-looking video URLs");
  }

  console.log("Starting in " + PAUSE_MS / 1000 + " seconds. Ctrl+C to abort before connect.\n");
  await new Promise((r) => setTimeout(r, PAUSE_MS));

  const conn = await mysql.createConnection({ uri: databaseUrl, multipleStatements: false });

  try {
    const [totalRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM featured_reels
       WHERE videoUrl IS NOT NULL
         AND TRIM(videoUrl) != ''
         AND videoUrl NOT LIKE ?` +
        (accSql ? "\n         " + accSql : "") +
        (retrySql ? "\n         " + retrySql : ""),
      [publicUrlBase + "%"]
    );
    const totalTarget = Number(totalRows[0]?.c);
    totalTargetForLog = opts.limit == null ? totalTarget : Math.min(totalTarget, opts.limit);

    const [r2Already] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM featured_reels
       WHERE videoUrl IS NOT NULL
         AND TRIM(videoUrl) != ''
         AND videoUrl LIKE ?` +
        (accSql ? "\n         " + accSql : ""),
      [publicUrlBase + "%"]
    );
    console.log("Total featured_reels with non-R2 videoUrl: " + totalTarget);
    console.log("Rows that already have public R2 URL prefix (will skip): " + Number(r2Already[0]?.c));

    let lastId = 0;
    for (;;) {
      if (shuttingDown) {
        break;
      }
      const remaining =
        opts.limit == null ? PAGE_SIZE : Math.max(0, Math.min(PAGE_SIZE, opts.limit - processed));
      if (remaining <= 0) {
        break;
      }

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id, reelShortcode, videoUrl FROM featured_reels
         WHERE id > ?
           AND videoUrl IS NOT NULL
           AND TRIM(videoUrl) != ''
           AND videoUrl NOT LIKE ?` +
          (accSql ? "\n           " + accSql : "") +
          (retrySql ? "\n           " + retrySql : "") +
          `
         ORDER BY id ASC
         LIMIT ? OFFSET ?`,
        [lastId, publicUrlBase + "%", remaining, 0]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        break;
      }
      const batch = rows.map((r) => ({
        id: Number(r.id),
        reelShortcode: String(r.reelShortcode ?? ""),
        videoUrl: r.videoUrl == null ? null : String(r.videoUrl),
      }));
      lastId = batch[batch.length - 1]!.id;
      await runPage(conn, batch, publicUrlBase, opts);
    }

    if (processed > 0 && processed % PROGRESS_EVERY !== 0) {
      logProgressLine();
    }

    const fTotal = failureTotal();
    const estimatedCost = urlRefreshAttempts * 0.001;

    console.log("\n========== FINAL REPORT ==========");
    console.log("Total featured_reels with non-R2 videoUrl: " + totalTarget);
    console.log("Target rows this run: " + totalTargetForLog);
    console.log("Already R2 in DB (skipped, no work): " + alreadyR2Skipped);
    console.log("Dry-run skipped: " + dryRunSkipped);
    console.log("Refreshed via ScrapeCreators: " + refreshed);
    console.log("Migrated (fresh URL + R2 mirror + DB update): " + migrated);
    console.log("Too large / helper returned non-R2 URL (skipped, no DB update): " + tooLargeSkipped);
    console.log("Failed: " + fTotal);
    console.log("  HTTP 403/404 (expired or blocked): " + failureCounts.http403_404);
    console.log("  Timeout: " + failureCounts.timeout);
    console.log("  URL refresh failed: " + failureCounts.url_refresh_failed);
    console.log("  Too large: " + failureCounts.too_large);
    console.log("  R2 error: " + failureCounts.r2);
    console.log("  DB error: " + failureCounts.db);
    console.log("  Other: " + failureCounts.other);
    console.log("Empty video skipped: " + emptySkipped);
    console.log(
      "Estimated ScrapeCreators cost: " +
        urlRefreshAttempts +
        " credits x ~$0.001 = ~$" +
        estimatedCost.toFixed(3)
    );
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
