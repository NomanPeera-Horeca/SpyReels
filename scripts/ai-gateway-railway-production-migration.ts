import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();
const target = process.env.SPYREELS_DB_GATE_TARGET?.trim();
const expectedHostToken = process.env.SPYREELS_DB_GATE_EXPECT_HOST?.trim();
const productionConfirm = process.env.SPYREELS_DB_GATE_PRODUCTION_CONFIRM?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the AI Gateway production migration gate.");
}
if (target !== "production-mysql") {
  throw new Error("Refusing to run: SPYREELS_DB_GATE_TARGET must equal production-mysql.");
}
if (productionConfirm !== "YES_PRODUCTION") {
  throw new Error("Refusing to run: SPYREELS_DB_GATE_PRODUCTION_CONFIRM must equal YES_PRODUCTION.");
}
if (!expectedHostToken) {
  throw new Error("SPYREELS_DB_GATE_EXPECT_HOST is required.");
}

const parsed = new URL(databaseUrl);
if (!parsed.hostname.includes(expectedHostToken)) {
  throw new Error(
    `Refusing to run: database host does not match the expected production host token (${expectedHostToken}).`
  );
}

const migrationPath = path.resolve("drizzle/0097_ai_gateway_oauth.sql");
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

let lockAcquired = false;
try {
  const [dbRows] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
  const dbName = String(dbRows[0]?.db || "");
  if (!dbName) throw new Error("Could not resolve current database name.");

  const [userTableRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
    [dbName]
  );
  if (Number(userTableRows[0]?.count || 0) !== 1) {
    throw new Error("Expected existing users table was not found; refusing to treat this as the SpyReels production database.");
  }

  const [userCountBeforeRows] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM users");
  const userCountBefore = Number(userCountBeforeRows[0]?.count || 0);

  const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT GET_LOCK('spyreels_ai_gateway_oauth_0097', 10) AS acquired"
  );
  lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;
  if (!lockAcquired) {
    throw new Error("Could not acquire production migration lock.");
  }

  const placeholders = tableNames.map(() => "?").join(",");
  const [beforeTables] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [dbName, ...tableNames]
  );

  console.log(
    `[ai-gateway-prod-db-gate] PRECHECK db='${dbName}' users=${userCountBefore} existingAiTables=${beforeTables.length}`
  );

  await connection.query(migrationSql);
  await connection.query(migrationSql);
  console.log("[ai-gateway-prod-db-gate] migration applied twice successfully (idempotence PASS)");

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
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders}) AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [dbName, ...tableNames]
  );
  const foundForeignKeys = new Set(foreignKeys.map((row) => String(row.CONSTRAINT_NAME)));
  for (const name of expectedForeignKeys) {
    if (!foundForeignKeys.has(name)) throw new Error(`Missing expected foreign key: ${name}`);
  }

  const [userCountAfterRows] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM users");
  const userCountAfter = Number(userCountAfterRows[0]?.count || 0);
  if (userCountAfter !== userCountBefore) {
    throw new Error(`Users row count changed during additive migration (${userCountBefore} -> ${userCountAfter}).`);
  }

  console.log(
    `[ai-gateway-prod-db-gate] PASS tables=${tableNames.length} indexes=${expectedIndexes.size} foreignKeys=${expectedForeignKeys.size} usersUnchanged=${userCountAfter}`
  );
} finally {
  if (lockAcquired) {
    try {
      await connection.query("SELECT RELEASE_LOCK('spyreels_ai_gateway_oauth_0097')");
    } catch {
      // Connection close also releases the lock.
    }
  }
  await connection.end();
}
