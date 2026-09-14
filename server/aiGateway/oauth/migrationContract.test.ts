import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION_NAME = "0096_ai_gateway_oauth.sql";
const migrationPath = resolve(ROOT, "drizzle", MIGRATION_NAME);
const migrationSql = readFileSync(migrationPath, "utf8");
const drizzleSchemaSource = readFileSync(
  resolve(ROOT, "drizzle", "aiOAuthSchema.ts"),
  "utf8"
);
const usersSchemaSource = readFileSync(
  resolve(ROOT, "drizzle", "schema.ts"),
  "utf8"
);

function tableBlock(tableName: string): string {
  const marker = `CREATE TABLE IF NOT EXISTS \`${tableName}\``;
  const start = migrationSql.indexOf(marker);
  expect(start, `missing ${tableName} CREATE TABLE`).toBeGreaterThanOrEqual(0);
  const end = migrationSql.indexOf("\n);", start);
  expect(end, `unterminated ${tableName} CREATE TABLE`).toBeGreaterThan(start);
  return migrationSql.slice(start, end + 3);
}

function declaredColumns(block: string): string[] {
  return [...block.matchAll(/^\s*`([^`]+)`\s+/gm)].map((match) => match[1]);
}

describe("AI Gateway OAuth migration contract", () => {
  it("owns the next migration number without a sibling 0096 collision", () => {
    const siblings = readdirSync(resolve(ROOT, "drizzle"))
      .filter((name) => /^0096_.*\.sql$/.test(name))
      .sort();
    expect(siblings).toEqual([MIGRATION_NAME]);
  });

  it("creates exactly the three OAuth persistence tables", () => {
    const createStatements = [
      ...migrationSql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`([^`]+)`/g),
    ].map((match) => match[1]);

    expect(createStatements).toEqual([
      "ai_oauth_clients",
      "ai_oauth_authorization_codes",
      "ai_oauth_refresh_tokens",
    ]);
    expect(migrationSql).not.toMatch(/\bDROP\s+(TABLE|DATABASE)\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("stores secrets and grants only as hashes", () => {
    const clients = tableBlock("ai_oauth_clients");
    const codes = tableBlock("ai_oauth_authorization_codes");
    const refresh = tableBlock("ai_oauth_refresh_tokens");

    expect(clients).toContain("`clientSecretHash` varchar(64) DEFAULT NULL");
    expect(codes).toContain("`codeHash` varchar(64) NOT NULL");
    expect(refresh).toContain("`tokenHash` varchar(64) NOT NULL");
    expect(refresh).toContain("`replacedByHash` varchar(64) DEFAULT NULL");

    expect(declaredColumns(codes)).not.toContain("code");
    expect(declaredColumns(refresh)).not.toContain("refreshToken");
    expect(declaredColumns(refresh)).not.toContain("accessToken");
    expect(declaredColumns(clients)).not.toContain("clientSecret");
  });

  it("keeps the SQL migration aligned with the Drizzle OAuth schema", () => {
    const clients = tableBlock("ai_oauth_clients");
    const codes = tableBlock("ai_oauth_authorization_codes");
    const refresh = tableBlock("ai_oauth_refresh_tokens");

    expect(clients).toContain("`clientId` varchar(128) NOT NULL");
    expect(clients).toContain("`clientName` varchar(255) NOT NULL");
    expect(clients).toContain("`source` varchar(32) NOT NULL DEFAULT 'unknown'");
    expect(clients).toContain("`redirectUris` json NOT NULL");
    expect(clients).toContain("`allowedScopes` json DEFAULT NULL");
    expect(clients).toContain("UNIQUE KEY `uq_ai_oauth_clients_client_id` (`clientId`)");

    expect(codes).toContain("`clientId` varchar(128) NOT NULL");
    expect(codes).toContain("`userId` int NOT NULL");
    expect(codes).toContain("`redirectUri` varchar(1024) NOT NULL");
    expect(codes).toContain("`scope` varchar(1000) NOT NULL");
    expect(codes).toContain("`codeChallenge` varchar(128) NOT NULL");
    expect(codes).toContain("`codeChallengeMethod` varchar(16) NOT NULL DEFAULT 'S256'");
    expect(codes).toContain("`expiresAt` datetime NOT NULL");
    expect(codes).toContain("`consumedAt` datetime DEFAULT NULL");
    expect(codes).toContain("UNIQUE KEY `uq_ai_oauth_authorization_codes_hash` (`codeHash`)");

    expect(refresh).toContain("`familyId` varchar(64) NOT NULL");
    expect(refresh).toContain("`clientId` varchar(128) NOT NULL");
    expect(refresh).toContain("`userId` int NOT NULL");
    expect(refresh).toContain("`source` varchar(32) NOT NULL DEFAULT 'unknown'");
    expect(refresh).toContain("`scope` varchar(1000) NOT NULL");
    expect(refresh).toContain("`expiresAt` datetime NOT NULL");
    expect(refresh).toContain("`revokedAt` datetime DEFAULT NULL");
    expect(refresh).toContain("`lastUsedAt` datetime DEFAULT NULL");
    expect(refresh).toContain("UNIQUE KEY `uq_ai_oauth_refresh_tokens_hash` (`tokenHash`)");
    expect(refresh).toContain("KEY `idx_ai_oauth_refresh_tokens_family` (`familyId`)");

    for (const tableName of [
      "ai_oauth_clients",
      "ai_oauth_authorization_codes",
      "ai_oauth_refresh_tokens",
    ]) {
      expect(drizzleSchemaSource).toContain(`mysqlTable(\n  "${tableName}"`);
    }
    expect(drizzleSchemaSource).toContain('varchar("clientId", { length: 128 })');
    expect(drizzleSchemaSource).toContain('varchar("codeHash", { length: 64 })');
    expect(drizzleSchemaSource).toContain('varchar("tokenHash", { length: 64 })');
    expect(drizzleSchemaSource).toContain('varchar("familyId", { length: 64 })');
    expect(drizzleSchemaSource).toContain('varchar("codeChallenge", { length: 128 })');
    expect(drizzleSchemaSource).toContain('.default("S256")');
  });

  it("matches the existing users primary-key type and preserves FK cleanup", () => {
    const codes = tableBlock("ai_oauth_authorization_codes");
    const refresh = tableBlock("ai_oauth_refresh_tokens");

    expect(usersSchemaSource).toMatch(
      /export const users = mysqlTable\("users",\s*\{[\s\S]*?id:\s*int\("id"\)\.autoincrement\(\)\.primaryKey\(\)/
    );

    for (const block of [codes, refresh]) {
      expect(block).toContain(
        "FOREIGN KEY (`clientId`) REFERENCES `ai_oauth_clients` (`clientId`) ON DELETE CASCADE"
      );
      expect(block).toContain(
        "FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE"
      );
    }
  });

  it("has indexes needed for one-time grants, rotation, and expiry cleanup", () => {
    const codes = tableBlock("ai_oauth_authorization_codes");
    const refresh = tableBlock("ai_oauth_refresh_tokens");

    expect(codes).toContain("KEY `idx_ai_oauth_authorization_codes_client_user` (`clientId`, `userId`)");
    expect(codes).toContain("KEY `idx_ai_oauth_authorization_codes_expires` (`expiresAt`)");
    expect(refresh).toContain("KEY `idx_ai_oauth_refresh_tokens_client_user` (`clientId`, `userId`)");
    expect(refresh).toContain("KEY `idx_ai_oauth_refresh_tokens_expires` (`expiresAt`)");
  });
});
