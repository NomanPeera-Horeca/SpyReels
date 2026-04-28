/**
 * Backfill: copy featured_reels.thumbnailUrl from expiring Instagram CDN URLs
 * to Cloudflare R2, then UPDATE the row to the stable public URL.
 *
 * Run (from repo root):
 *   export DATABASE_URL='mysql://...'
 *   export CLOUDFLARE_R2_ENDPOINT=...
 *   export CLOUDFLARE_R2_ACCESS_KEY_ID=...
 *   export CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
 *   export CLOUDFLARE_R2_BUCKET=...
 *   export CLOUDFLARE_R2_PUBLIC_URL=...
 *   node --import tsx scripts/backfill-featured-reel-thumbnails.ts
 *
 * Self contained. Does not modify scrape-featured-accounts.ts.
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { storageHead, storagePut, r2ObjectPublicUrl } from "../server/storage";

const PAGE_SIZE = 200;
const CONCURRENCY = 5;
const PROGRESS_EVERY = 50;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const PAUSE_MS = 5_000;

const ALLOWED_HOST_MARKERS = ["shinkansen", "maglev"] as const;

type FailureKind = "http403_404" | "timeout" | "r2" | "db" | "other";

const failureCounts: Record<FailureKind, number> = {
  http403_404: 0,
  timeout: 0,
  r2: 0,
  db: 0,
  other: 0,
};

let migrated = 0;
let alreadyR2Skipped = 0;
let emptySkipped = 0;
let failed = 0;
let processed = 0;

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

function thumbKey(reelId: number): string {
  return `featured-reel-thumbs/${reelId}.jpg`;
}

function isAlreadyPublicR2(thumbnailUrl: string, publicBase: string): boolean {
  const t = thumbnailUrl.trim();
  if (!t) {
    return false;
  }
  return t.startsWith(publicBase);
}

function classifyDownloadFailure(err: unknown): FailureKind {
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
  return "other";
}

function classifyR2OrDbError(err: unknown): FailureKind {
  const e = err as { message?: string; code?: string };
  const msg = (e?.message || String(err)).toLowerCase();
  if (msg.includes("er_lock") || msg.includes("deadlock") || msg.includes("mysql")) {
    return "db";
  }
  return "r2";
}

function logProgressLine() {
  const f =
    failureCounts.http403_404 +
    failureCounts.timeout +
    failureCounts.r2 +
    failureCounts.db +
    failureCounts.other;
  console.log(
    `[${processed}/${totalTargetForLog}] migrated=${migrated} skipped_alr2=${alreadyR2Skipped} failed=${f} empty_skipped=${emptySkipped}`
  );
  console.log(
    `  failures: 403/404=${failureCounts.http403_404} timeout=${failureCounts.timeout} r2=${failureCounts.r2} db=${failureCounts.db} other=${failureCounts.other}`
  );
}

function afterProcessStep() {
  processed += 1;
  if (processed % PROGRESS_EVERY === 0) {
    logProgressLine();
  }
}

async function processOneReel(
  conn: mysql.Connection,
  row: { id: number; thumbnailUrl: string | null },
  publicBase: string
): Promise<void> {
  const { id, thumbnailUrl } = row;

  if (thumbnailUrl == null || String(thumbnailUrl).trim() === "") {
    emptySkipped += 1;
    afterProcessStep();
    return;
  }

  const src = String(thumbnailUrl).trim();

  try {
    if (isAlreadyPublicR2(src, publicBase)) {
      alreadyR2Skipped += 1;
      afterProcessStep();
      return;
    }

    const key = thumbKey(id);
    const publicUrl = r2ObjectPublicUrl(key);

    if (await storageHead(key)) {
      try {
        await conn.query("UPDATE featured_reels SET thumbnailUrl = ? WHERE id = ?", [publicUrl, id]);
        migrated += 1;
      } catch (err) {
        recordDbFailure(id, err);
        return;
      }
      afterProcessStep();
      return;
    }

    const { gotScraping: gs } = await import("got-scraping");
    let buf: Buffer;
    try {
      const res = await gs({
        url: src,
        responseType: "buffer",
        timeout: { request: DOWNLOAD_TIMEOUT_MS },
        retry: { limit: 0 },
        followRedirect: true,
        maxRedirects: 5,
      } as Parameters<typeof gs>[0]);
      const statusCode = res.statusCode ?? 0;
      if (statusCode !== 200) {
        if (statusCode === 403 || statusCode === 404) {
          failureCounts.http403_404 += 1;
        } else {
          failureCounts.other += 1;
        }
        failed += 1;
        console.warn(`  [id=${id}] download HTTP ${statusCode} for ${src.slice(0, 100)}...`);
        afterProcessStep();
        return;
      }
      const raw = res.rawBody;
      if (!raw || raw.length === 0) {
        failureCounts.other += 1;
        failed += 1;
        console.warn(`  [id=${id}] empty response body`);
        afterProcessStep();
        return;
      }
      buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    } catch (err) {
      const k = classifyDownloadFailure(err);
      failureCounts[k] += 1;
      failed += 1;
      console.warn(
        `  [id=${id}] download error (${k}):`,
        err instanceof Error ? err.message : err
      );
      afterProcessStep();
      return;
    }

    try {
      await storagePut(key, buf, "image/jpeg");
    } catch (err) {
      const k = classifyR2OrDbError(err);
      failureCounts[k] += 1;
      failed += 1;
      console.warn(
        `  [id=${id}] R2 put failed:`,
        err instanceof Error ? err.message : err
      );
      afterProcessStep();
      return;
    }

    try {
      await conn.query("UPDATE featured_reels SET thumbnailUrl = ? WHERE id = ?", [publicUrl, id]);
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
  rows: { id: number; thumbnailUrl: string | null }[],
  publicBase: string
) {
  let next = 0;
  const n = rows.length;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      if (shuttingDown) {
        return;
      }
      const j = next++;
      if (j >= n) {
        return;
      }
      await processOneReel(conn, rows[j]!, publicBase);
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
  const accountFilter = parseFeaturedAccountIdsFilter();
  const accSql = accountFilter?.sql ?? "";
  if (accountFilter) {
    console.log(
      "FEATURED_ACCOUNT_IDS: restricting to account IDs: " + accountFilter.ids.join(", ")
    );
  }

  console.log("Starting in " + PAUSE_MS / 1000 + " seconds. Ctrl+C to abort before connect.\n");
  await new Promise((r) => setTimeout(r, PAUSE_MS));

  const conn = await mysql.createConnection({ uri: databaseUrl, multipleStatements: false });

  try {
    const [totalRows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM featured_reels WHERE thumbnailUrl IS NOT NULL AND TRIM(COALESCE(thumbnailUrl, '')) != ''" +
        (accSql ? " " + accSql : "")
    );
    const totalTarget = Number(totalRows[0]?.c);
    totalTargetForLog = totalTarget;

    const [r2Already] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM featured_reels
       WHERE thumbnailUrl IS NOT NULL
         AND TRIM(thumbnailUrl) != ''
         AND thumbnailUrl LIKE ?` +
        (accSql ? "\n         " + accSql : ""),
      [publicUrlBase + "%"]
    );
    console.log("Total featured_reels with non-null thumbnailUrl: " + totalTarget);
    console.log("Rows that already have public R2 URL prefix (will skip): " + Number(r2Already[0]?.c));

    let lastId = 0;
    for (;;) {
      if (shuttingDown) {
        break;
      }
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id, thumbnailUrl FROM featured_reels
         WHERE id > ?
           AND thumbnailUrl IS NOT NULL
           AND TRIM(COALESCE(thumbnailUrl, '')) != ''` +
          (accSql ? "\n           " + accSql : "") +
          `
         ORDER BY id ASC
         LIMIT ?`,
        [lastId, PAGE_SIZE]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        break;
      }
      const batch = rows.map((r) => ({
        id: Number(r.id),
        thumbnailUrl: r.thumbnailUrl == null ? null : String(r.thumbnailUrl),
      }));
      lastId = batch[batch.length - 1]!.id;
      await runPage(conn, batch, publicUrlBase);
    }

    if (processed > 0 && processed % PROGRESS_EVERY !== 0) {
      logProgressLine();
    }

    const fTotal =
      failureCounts.http403_404 +
      failureCounts.timeout +
      failureCounts.r2 +
      failureCounts.db +
      failureCounts.other;

    console.log("\n========== FINAL REPORT ==========");
    console.log("Total featured_reels with non-null thumbnailUrl: " + totalTarget);
    console.log("Already R2 in DB (skipped, no work): " + alreadyR2Skipped);
    console.log("Migrated (R2 object existed + DB update, or download + put + update): " + migrated);
    console.log("Failed: " + fTotal);
    console.log("  HTTP 403/404 (expired or blocked): " + failureCounts.http403_404);
    console.log("  Timeout: " + failureCounts.timeout);
    console.log("  R2 error: " + failureCounts.r2);
    console.log("  DB error: " + failureCounts.db);
    console.log("  Other: " + failureCounts.other);
    console.log("Empty thumbnail skipped: " + emptySkipped);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
