/**
 * Phase E: copy featured catalog tables from STAGING to PRODUCTION.
 * Only: niches, featured_accounts, featured_account_niches, featured_reels.
 * Does not touch __drizzle_migrations, users, scrape_jobs, transcriptions, etc.
 *
 * Run:
 *   export SOURCE_URL='mysql://...shinkansen...'
 *   export TARGET_URL='mysql://...maglev...'
 *   # optional: TARGET_NOT_EMPTY_OK=1  to allow non-empty target tables
 *   node scripts/copy-staging-catalog-to-prod.mjs
 */

import mysql from "mysql2/promise";

const SOURCE_STAGING = "shinkansen";
const TARGET_PROD = "maglev";

const CATALOG_TABLES = [
  { name: "niches", orderBy: "`id` ASC" },
  { name: "featured_accounts", orderBy: "`id` ASC" },
  { name: "featured_account_niches", orderBy: "`accountId` ASC, `nicheId` ASC" },
  { name: "featured_reels", orderBy: "`id` ASC" },
];

const CHUNK_SIZE = 500;
/** Smaller sub-batches for INSERT to reduce packet size (featured_reels can be large). */
const INSERT_BATCH = 100;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertHost(name, urlStr, mustInclude) {
  let host;
  try {
    host = new URL(urlStr).hostname;
  } catch (e) {
    throw new Error(name + " URL invalid: " + (e?.message || e));
  }
  if (!host.toLowerCase().includes(mustInclude.toLowerCase())) {
    throw new Error(
      name + " host must include '" + mustInclude + "'. Got: " + host
    );
  }
  return host;
}

async function getCount(conn, table) {
  const safe = "`" + String(table).replace(/`/g, "``") + "`";
  const [rows] = await conn.query("SELECT COUNT(*) AS n FROM " + safe);
  return Number(rows[0]?.n ?? 0);
}

async function getAllCounts(conn) {
  const out = {};
  for (const { name } of CATALOG_TABLES) {
    out[name] = await getCount(conn, name);
  }
  return out;
}

async function getColumnMeta(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return rows.map((r) => ({
    name: r.COLUMN_NAME,
    dataType: (r.DATA_TYPE || "").toLowerCase(),
  }));
}

/**
 * Return values in same order as `columns`, for one row.
 */
function normalizeValues(columns, row) {
  const out = [];
  for (const col of columns) {
    let v = row[col.name];
    if (v === undefined) v = null;
    if (v === null) {
      out.push(null);
      continue;
    }
    if (v instanceof Date) {
      out.push(v);
      continue;
    }
    if (Buffer.isBuffer(v)) {
      out.push(v);
      continue;
    }
    if (col.dataType === "json" && v !== null && typeof v === "object") {
      out.push(JSON.stringify(v));
      continue;
    }
    out.push(v);
  }
  return out;
}

/**
 * @param {import('mysql2/promise').Connection} target
 * @param {string} table
 * @param {Array<{name: string, dataType: string}>} columns
 * @param {object[]} rows
 */
async function insertRowsIgnore(target, table, columns, rows) {
  if (rows.length === 0) return 0;
  const colList = columns.map((c) => "`" + c.name.replace(/`/g, "``") + "`").join(", ");
  const colNames = columns.map((c) => c.name);
  const safeTable = "`" + table.replace(/`/g, "``") + "`";

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const valueRows = batch.map((row) => normalizeValues(columns, row));
    const ph = valueRows
      .map(() => "(" + colNames.map(() => "?").join(",") + ")")
      .join(", ");
    const flat = valueRows.flat();
    await target.query("INSERT IGNORE INTO " + safeTable + " (" + colList + ") VALUES " + ph, flat);
  }
  return rows.length;
}

async function copyTable(source, target, def, sourceCols, targetCols) {
  const { name, orderBy } = def;
  const sNames = sourceCols.map((c) => c.name).join(",");
  const tNames = targetCols.map((c) => c.name).join(",");
  if (sNames !== tNames) {
    throw new Error(
      "Column mismatch for " + name + " between source and target. Source: " + sNames + " Target: " + tNames
    );
  }
  if (sNames === "") {
    throw new Error("No columns for table " + name);
  }

  let offset = 0;
  let totalInserted = 0;

  await target.query("START TRANSACTION");
  try {
    for (;;) {
      const [rows] = await source.query(
        "SELECT * FROM `" + name.replace(/`/g, "``") + "` ORDER BY " + orderBy + " LIMIT ? OFFSET ?",
        [CHUNK_SIZE, offset]
      );
      if (!rows.length) break;

      const n = await insertRowsIgnore(target, name, sourceCols, rows);
      totalInserted += n;
      offset += rows.length;
      console.log(
        "  " + name + ": copied batch ending offset " + offset + " (rows in batch " + rows.length + ")"
      );
    }
    await target.query("COMMIT");
  } catch (e) {
    await target.query("ROLLBACK");
    throw e;
  }
  return totalInserted;
}

async function fkOrphanCount(conn) {
  const [fan] = await conn.query(`
    SELECT COUNT(*) AS n FROM featured_account_niches fan
    LEFT JOIN featured_accounts fa ON fa.id = fan.accountId
    WHERE fa.id IS NULL
  `);
  const [fniche] = await conn.query(`
    SELECT COUNT(*) AS n FROM featured_account_niches fan
    LEFT JOIN niches n ON n.id = fan.nicheId
    WHERE n.id IS NULL
  `);
  const [fr] = await conn.query(`
    SELECT COUNT(*) AS n FROM featured_reels fr
    LEFT JOIN featured_accounts fa ON fa.id = fr.featuredAccountId
    WHERE fa.id IS NULL
  `);
  return {
    accountOrphans: Number(fan[0]?.n ?? 0),
    nicheOrphans: Number(fniche[0]?.n ?? 0),
    reelAccountOrphans: Number(fr[0]?.n ?? 0),
  };
}

function formatCounts(obj) {
  return (
    "niches=" +
    obj.niches +
    ", featured_accounts=" +
    obj.featured_accounts +
    ", featured_account_niches=" +
    obj.featured_account_niches +
    ", featured_reels=" +
    obj.featured_reels
  );
}

async function main() {
  const sourceUrl = process.env.SOURCE_URL;
  const targetUrl = process.env.TARGET_URL;
  const allowTargetNonEmpty = process.env.TARGET_NOT_EMPTY_OK === "1";

  if (!sourceUrl?.trim() || !targetUrl?.trim()) {
    console.error("Set SOURCE_URL and TARGET_URL, then re-run.");
    process.exit(1);
  }

  const sourceHost = assertHost("SOURCE_URL", sourceUrl, SOURCE_STAGING);
  const targetHost = assertHost("TARGET_URL", targetUrl, TARGET_PROD);
  console.log("Source host:", sourceHost, "(expected staging)");
  console.log("Target host:", targetHost, "(expected production)");
  console.log("\nStarting in 5 seconds. Ctrl+C to abort.\n");
  await sleep(5000);

  const source = await mysql.createConnection({ uri: sourceUrl, multipleStatements: true });
  const target = await mysql.createConnection({ uri: targetUrl, multipleStatements: true });

  try {
    const beforeSource = await getAllCounts(source);
    const beforeTarget = await getAllCounts(target);

    console.log("Source: " + formatCounts(beforeSource));
    console.log("Target (BEFORE): " + formatCounts(beforeTarget));

    const hasRows =
      beforeTarget.niches > 0 ||
      beforeTarget.featured_accounts > 0 ||
      beforeTarget.featured_account_niches > 0 ||
      beforeTarget.featured_reels > 0;

    if (hasRows && !allowTargetNonEmpty) {
      console.error(
        "\nRefusing: one or more target catalog tables are not empty. Set TARGET_NOT_EMPTY_OK=1 to override."
      );
      process.exit(1);
    }
    if (hasRows && allowTargetNonEmpty) {
      console.warn("TARGET_NOT_EMPTY_OK=1: continuing despite non-empty target tables (INSERT IGNORE may skip duplicates).");
    }

    for (const def of CATALOG_TABLES) {
      const { name } = def;
      console.log("\n--- Copying " + name + " ---");
      const sourceCols = await getColumnMeta(source, name);
      const targetCols = await getColumnMeta(target, name);
      await copyTable(source, target, def, sourceCols, targetCols);
      const afterN = await getCount(target, name);
      console.log("Target " + name + " row count after copy: " + afterN);
    }

    const afterTarget = await getAllCounts(target);
    console.log("\n========== Target (AFTER) ==========");
    console.log(formatCounts(afterTarget));

    console.log("\n========== Count vs source ==========");
    let allMatch = true;
    for (const { name } of CATALOG_TABLES) {
      const s = beforeSource[name];
      const t = afterTarget[name];
      const ok = s === t;
      if (!ok) allMatch = false;
      console.log(
        name + ": source=" + s + " target=" + t + " " + (ok ? "MATCH" : "MISMATCH")
      );
    }
    if (!allMatch) {
      console.log(
        "\nIf you used INSERT IGNORE and target had data, MISMATCH is expected. Otherwise investigate."
      );
    }

    console.log("\n========== FK integrity (target) ==========");
    const fk = await fkOrphanCount(target);
    if (
      fk.accountOrphans === 0 &&
      fk.nicheOrphans === 0 &&
      fk.reelAccountOrphans === 0
    ) {
      console.log("FK integrity OK (no orphan featured_account_niches or featured_reels references).");
    } else {
      console.log("FK problems:");
      if (fk.accountOrphans) {
        console.log("  featured_account_niches missing featured_accounts parent: " + fk.accountOrphans);
      }
      if (fk.nicheOrphans) {
        console.log("  featured_account_niches missing niches parent: " + fk.nicheOrphans);
      }
      if (fk.reelAccountOrphans) {
        console.log("  featured_reels missing featured_accounts parent: " + fk.reelAccountOrphans);
      }
    }

    console.log("\nDone. __drizzle_migrations was not modified.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
