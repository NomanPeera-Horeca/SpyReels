import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import * as schema from "../../drizzle/personalizationSchema";

const root = path.resolve(__dirname, "../..");
const draftSqlPath = path.join(
  root,
  "docs/architecture/drafts/onboarding_v2_personalization.sql"
);
const draftSql = readFileSync(draftSqlPath, "utf8");

const tables = Object.values(schema).filter(
  (v): v is Parameters<typeof getTableConfig>[0] =>
    typeof v === "object" &&
    v !== null &&
    Symbol.for("drizzle:IsDrizzleTable") in v
);

function sqlBlockFor(table: string): string {
  const start = draftSql.indexOf(`CREATE TABLE IF NOT EXISTS \`${table}\``);
  if (start < 0) return "";
  const end = draftSql.indexOf(") ENGINE=", start);
  return draftSql.slice(start, end);
}

describe("personalization schema: Drizzle and SQL draft match", () => {
  it("defines the seven approved tables", () => {
    expect(tables.map(t => getTableConfig(t).name).sort()).toEqual([
      "personalization_items",
      "personalization_progress",
      "profile_analysis_runs",
      "profile_analysis_stages",
      "social_profiles",
      "user_onboarding_answers",
      "workspace_member_active_profiles",
    ]);
  });

  for (const table of tables) {
    const cfg = getTableConfig(table);
    it(`${cfg.name}: every Drizzle column (and enum value) exists in the SQL draft`, () => {
      const block = sqlBlockFor(cfg.name);
      expect(block, `missing CREATE TABLE for ${cfg.name}`).not.toBe("");
      const sqlColumns = [...block.matchAll(/^\s+`([A-Za-z]+)`\s/gm)].map(
        m => m[1]
      );
      expect(sqlColumns.sort()).toEqual(cfg.columns.map(c => c.name).sort());
      for (const col of cfg.columns) {
        const values = (col as { enumValues?: string[] }).enumValues;
        if (values && values.length > 0) {
          const line =
            block.split("\n").find(l => l.includes(`\`${col.name}\` enum(`)) ??
            "";
          expect(line, `${cfg.name}.${col.name} enum`).toContain(
            `enum(${values.map(v => `'${v}'`).join(",")})`
          );
        }
      }
    });
  }

  it("the SQL draft is additive only (no ALTER, no DROP outside comments)", () => {
    const code = draftSql
      .split("\n")
      .filter(l => !l.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(
      /\bTRUNCATE\b|^\s*DELETE\s+FROM\b|^\s*UPDATE\s+`/im
    );
  });
});

describe("migration gate: drafts cannot reach a database by accident", () => {
  it("no numbered migration exists for these tables", () => {
    const sqlFiles = execSync("ls drizzle", { cwd: root })
      .toString()
      .split("\n")
      .filter(f => f.endsWith(".sql"));
    expect(
      sqlFiles.filter(f =>
        /onboarding_v2|social_profiles|personalization_(items|progress)/i.test(
          f
        )
      )
    ).toEqual([]);
  });

  it("drizzle.config.ts does not include the draft schema", () => {
    expect(
      readFileSync(path.join(root, "drizzle.config.ts"), "utf8")
    ).not.toContain("personalizationSchema");
  });

  it("no runtime code imports the draft schema yet", () => {
    const hits = execSync(
      'git grep --untracked -l -E "(from|import\\()\\s*[\'\\"][^\'\\"]*personalizationSchema" -- server client/src shared public-web scripts || true',
      { cwd: root }
    )
      .toString()
      .split("\n")
      .filter(Boolean)
      .filter(f => !f.endsWith(".test.ts"));
    expect(hits).toEqual([]);
  });

  it("the draft SQL lives outside drizzle/", () => {
    expect(existsSync(draftSqlPath)).toBe(true);
    expect(draftSqlPath.includes(`${path.sep}drizzle${path.sep}`)).toBe(false);
  });
});
