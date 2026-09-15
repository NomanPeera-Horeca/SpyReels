import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();
const target = process.env.SPYREELS_DB_GATE_TARGET?.trim();
const expectedHostToken = process.env.SPYREELS_DB_GATE_EXPECT_HOST?.trim();
const productionConfirm = process.env.SPYREELS_DB_GATE_PRODUCTION_CONFIRM?.trim();

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (target !== "production-mysql") {
  throw new Error("Refusing to run: SPYREELS_DB_GATE_TARGET must equal production-mysql.");
}
if (productionConfirm !== "YES_PRODUCTION") {
  throw new Error("Refusing to run: SPYREELS_DB_GATE_PRODUCTION_CONFIRM must equal YES_PRODUCTION.");
}
if (!expectedHostToken) throw new Error("SPYREELS_DB_GATE_EXPECT_HOST is required.");

const parsed = new URL(databaseUrl);
if (!parsed.hostname.includes(expectedHostToken)) {
  throw new Error(
    `Refusing to run: database host does not match expected production host token (${expectedHostToken}).`
  );
}

const migrationSql = await fs.readFile(
  path.resolve("drizzle/0098_ai_gateway_dynamic_cimd_clients.sql"),
  "utf8"
);

const connection = await mysql.createConnection({ uri: databaseUrl, multipleStatements: true });
const lockName = "spyreels_ai_gateway_dynamic_cimd_0098";
let lockAcquired = false;

async function rowCount(tableName: string): Promise<number> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM \`${tableName}\``
  );
  return Number(rows[0]?.count || 0);
}

try {
  const [dbRows] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
  const dbName = String(dbRows[0]?.db || "");
  if (!dbName) throw new Error("Could not resolve current database name.");

  const requiredTables = [
    "users",
    "ai_oauth_clients",
    "ai_oauth_authorization_codes",
    "ai_oauth_refresh_tokens",
  ];
  const placeholders = requiredTables.map(() => "?").join(",");
  const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [dbName, ...requiredTables]
  );
  const foundTables = new Set(tableRows.map((row) => String(row.TABLE_NAME)));
  for (const tableName of requiredTables) {
    if (!foundTables.has(tableName)) {
      throw new Error(`Refusing to run: required table is missing: ${tableName}`);
    }
  }

  const beforeCounts = {
    users: await rowCount("users"),
    clients: await rowCount("ai_oauth_clients"),
    codes: await rowCount("ai_oauth_authorization_codes"),
    refresh: await rowCount("ai_oauth_refresh_tokens"),
  };

  const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT GET_LOCK(?, 10) AS acquired",
    [lockName]
  );
  lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;
  if (!lockAcquired) throw new Error("Could not acquire production migration lock.");

  console.log(
    `[ai-gateway-cimd-db-gate] PRECHECK db='${dbName}' users=${beforeCounts.users} clients=${beforeCounts.clients} codes=${beforeCounts.codes} refresh=${beforeCounts.refresh}`
  );

  await connection.query(migrationSql);
  await connection.query(migrationSql);
  console.log("[ai-gateway-cimd-db-gate] migration applied twice successfully (idempotence PASS)");

  const [fkRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME IN ('ai_oauth_authorization_codes','ai_oauth_refresh_tokens')
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [dbName]
  );
  const fks = new Set(fkRows.map((row) => String(row.CONSTRAINT_NAME)));

  for (const removed of [
    "fk_ai_oauth_authorization_codes_client",
    "fk_ai_oauth_refresh_tokens_client",
  ]) {
    if (fks.has(removed)) throw new Error(`Dynamic-client FK still exists: ${removed}`);
  }
  for (const retained of [
    "fk_ai_oauth_authorization_codes_user",
    "fk_ai_oauth_refresh_tokens_user",
  ]) {
    if (!fks.has(retained)) throw new Error(`Required user FK is missing: ${retained}`);
  }

  const requiredIndexes = [
    "idx_ai_oauth_authorization_codes_client_user",
    "idx_ai_oauth_authorization_codes_expires",
    "idx_ai_oauth_refresh_tokens_client_user",
    "idx_ai_oauth_refresh_tokens_expires",
    "idx_ai_oauth_refresh_tokens_family",
  ];
  const [indexRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT DISTINCT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME IN ('ai_oauth_authorization_codes','ai_oauth_refresh_tokens')`,
    [dbName]
  );
  const indexes = new Set(indexRows.map((row) => String(row.INDEX_NAME)));
  for (const indexName of requiredIndexes) {
    if (!indexes.has(indexName)) throw new Error(`Required OAuth index is missing: ${indexName}`);
  }

  const afterCounts = {
    users: await rowCount("users"),
    clients: await rowCount("ai_oauth_clients"),
    codes: await rowCount("ai_oauth_authorization_codes"),
    refresh: await rowCount("ai_oauth_refresh_tokens"),
  };

  for (const key of Object.keys(beforeCounts) as Array<keyof typeof beforeCounts>) {
    if (afterCounts[key] !== beforeCounts[key]) {
      throw new Error(
        `Row count changed during constraint-only migration for ${key} (${beforeCounts[key]} -> ${afterCounts[key]}).`
      );
    }
  }

  console.log(
    `[ai-gateway-cimd-db-gate] PASS foreignKeys=${[...fks].sort().join(",")} usersUnchanged=${afterCounts.users} oauthRowsUnchanged=true`
  );
} finally {
  if (lockAcquired) {
    try {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    } catch {
      // Closing the connection also releases the advisory lock.
    }
  }
  await connection.end();
}
