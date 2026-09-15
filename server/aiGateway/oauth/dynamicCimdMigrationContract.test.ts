import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION_NAME = "0098_ai_gateway_dynamic_cimd_clients.sql";
const migrationSql = readFileSync(resolve(ROOT, "drizzle", MIGRATION_NAME), "utf8");
const drizzleSchemaSource = readFileSync(
  resolve(ROOT, "drizzle", "aiOAuthSchema.ts"),
  "utf8"
);

function schemaTableBlock(tableName: string): string {
  const marker = `mysqlTable(\n  "${tableName}"`;
  const start = drizzleSchemaSource.indexOf(marker);
  expect(start, `missing ${tableName} Drizzle schema`).toBeGreaterThanOrEqual(0);
  const next = drizzleSchemaSource.indexOf("export const ", start + marker.length);
  return drizzleSchemaSource.slice(start, next === -1 ? undefined : next);
}

describe("AI Gateway dynamic CIMD migration contract", () => {
  it("owns migration 0098 without a sibling collision", () => {
    const siblings = readdirSync(resolve(ROOT, "drizzle"))
      .filter((name) => /^0098_.*\.sql$/.test(name))
      .sort();
    expect(siblings).toEqual([MIGRATION_NAME]);
  });

  it("drops only the two local-client foreign keys", () => {
    expect(migrationSql).toContain("fk_ai_oauth_authorization_codes_client");
    expect(migrationSql).toContain("fk_ai_oauth_refresh_tokens_client");
    expect(migrationSql).not.toContain("fk_ai_oauth_authorization_codes_user");
    expect(migrationSql).not.toContain("fk_ai_oauth_refresh_tokens_user");
    expect(migrationSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("is idempotent by checking information_schema before each FK drop", () => {
    expect(migrationSql).toContain("information_schema.REFERENTIAL_CONSTRAINTS");
    expect(migrationSql).toContain("@auth_code_client_fk_exists > 0");
    expect(migrationSql).toContain("@refresh_client_fk_exists > 0");
    expect(migrationSql).toContain("PREPARE spyreels_drop_auth_code_client_fk");
    expect(migrationSql).toContain("PREPARE spyreels_drop_refresh_client_fk");
  });

  it("keeps clientId indexed but removes the local-client relation from Drizzle", () => {
    const codes = schemaTableBlock("ai_oauth_authorization_codes");
    const refresh = schemaTableBlock("ai_oauth_refresh_tokens");

    for (const block of [codes, refresh]) {
      expect(block).toContain('clientId: varchar("clientId", { length: 128 }).notNull()');
      expect(block).not.toContain("references(() => aiOAuthClients.clientId");
      expect(block).toContain("references(() => users.id, { onDelete: \"cascade\" })");
    }

    expect(codes).toContain("idx_ai_oauth_authorization_codes_client_user");
    expect(refresh).toContain("idx_ai_oauth_refresh_tokens_client_user");
  });
});
