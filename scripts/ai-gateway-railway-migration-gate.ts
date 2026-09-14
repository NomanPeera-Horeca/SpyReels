import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();
const target = process.env.SPYREELS_DB_GATE_TARGET?.trim();
const expectedHostToken = process.env.SPYREELS_DB_GATE_EXPECT_HOST?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the AI Gateway migration gate.");
}
if (target !== "mysql-staging") {
  throw new Error("Refusing to run: SPYREELS_DB_GATE_TARGET must equal mysql-staging.");
}
if (!expectedHostToken) {
  throw new Error("SPYREELS_DB_GATE_EXPECT_HOST is required.");
}

const parsed = new URL(databaseUrl);
if (!parsed.hostname.includes(expectedHostToken)) {
  throw new Error(
    `Refusing to run: database host does not match the expected staging host token (${expectedHostToken}).`
  );
}

const migrationPath = path.resolve("drizzle/0096_ai_gateway_oauth.sql");
const migrationSql = await fs.readFile(migrationPath, "utf8");

const connection = await mysql.createConnection({
  uri: databaseUrl,
  multipleStatements: true,
});

const tableNames = [
  "ai_oauth_clients",
  "ai_oauth_authorization_codes",
  "ai_oauth_refresh_tokens",
] as const;

const expectedIndexes = new Set([
  "uq_ai_oauth_clients_client_id",
  "idx_ai_oauth_clients_source",
  "uq_ai_oauth_authorization_codes_hash",
  "idx_ai_oauth_authorization_codes_client_user",
  "idx_ai_oauth_authorization_codes_expires",
  "uq_ai_oauth_refresh_tokens_hash",
  "idx_ai_oauth_refresh_tokens_family",
  "idx_ai_oauth_refresh_tokens_client_user",
  "idx_ai_oauth_refresh_tokens_expires",
]);

const expectedForeignKeys = new Set([
  "fk_ai_oauth_authorization_codes_client",
  "fk_ai_oauth_authorization_codes_user",
  "fk_ai_oauth_refresh_tokens_client",
  "fk_ai_oauth_refresh_tokens_user",
]);

try {
  const [dbRows] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
  const dbName = String(dbRows[0]?.db || "");
  if (!dbName) throw new Error("Could not resolve current database name.");

  console.log(`[ai-gateway-db-gate] connected to staging database '${dbName}'`);

  await connection.query(migrationSql);
  await connection.query(migrationSql);
  console.log("[ai-gateway-db-gate] migration applied twice successfully (idempotence PASS)");

  const placeholders = tableNames.map(() => "?").join(",");
  const [tables] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [dbName, ...tableNames]
  );
  const foundTables = new Set(tables.map((row) => String(row.TABLE_NAME)));
  for (const name of tableNames) {
    if (!foundTables.has(name)) throw new Error(`Missing expected table: ${name}`);
  }

  const [indexes] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [dbName, ...tableNames]
  );
  const foundIndexes = new Set(indexes.map((row) => String(row.INDEX_NAME)));
  for (const name of expectedIndexes) {
    if (!foundIndexes.has(name)) throw new Error(`Missing expected index: ${name}`);
  }

  const [foreignKeys] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders}) AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [dbName, ...tableNames]
  );
  const foundForeignKeys = new Set(foreignKeys.map((row) => String(row.CONSTRAINT_NAME)));
  for (const name of expectedForeignKeys) {
    if (!foundForeignKeys.has(name)) throw new Error(`Missing expected foreign key: ${name}`);
  }

  const [userTableRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
    [dbName]
  );
  if (Number(userTableRows[0]?.count || 0) !== 1) {
    throw new Error("Expected existing users table was not found; refusing to treat this as a valid SpyReels staging database.");
  }

  console.log(
    `[ai-gateway-db-gate] PASS tables=${tableNames.length} indexes=${expectedIndexes.size} foreignKeys=${expectedForeignKeys.size}`
  );
} finally {
  await connection.end();
}
