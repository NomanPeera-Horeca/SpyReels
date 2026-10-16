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
      const sqlColumns = [
        ...block.matchAll(
          /^\s+`([A-Za-z]+)`\s+(?:varchar|int|bigint|enum|json|text|timestamp)\b/gm
        ),
      ].map(m => m[1]);
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

  for (const table of tables) {
    const cfg = getTableConfig(table);
    it(`${cfg.name}: foreign keys, CHECKs and unique keys match the SQL draft`, () => {
      const block = sqlBlockFor(cfg.name);
      const sqlNames = (re: RegExp) =>
        [...block.matchAll(re)].map(m => m[1]).sort();
      const fkFromSql = sqlNames(/CONSTRAINT `(fk_[a-z_]+)` FOREIGN KEY/g);
      const chkFromSql = sqlNames(/CONSTRAINT `(chk_[a-z_]+)` CHECK/g);
      const uniqFromSql = sqlNames(/UNIQUE KEY `([a-z_]+)`/g);
      expect(cfg.foreignKeys.map(fk => fk.getName()).sort()).toEqual(fkFromSql);
      expect(cfg.checks.map(c => c.name).sort()).toEqual(chkFromSql);
      const drizzleUnique = [
        ...cfg.uniqueConstraints.map(u => u.name ?? ""),
        ...cfg.indexes.filter(i => i.config.unique).map(i => i.config.name),
      ].sort();
      expect(drizzleUnique).toEqual(uniqFromSql);
    });
  }

  it("every child of social_profiles references (socialProfileId, workspaceId) together", () => {
    for (const table of tables) {
      const cfg = getTableConfig(table);
      for (const fk of cfg.foreignKeys) {
        const ref = fk.reference();
        if (getTableConfig(ref.foreignTable).name !== "social_profiles")
          continue;
        expect(
          ref.columns.map(c => c.name),
          `${cfg.name}.${fk.getName()}`
        ).toEqual(["socialProfileId", "workspaceId"]);
        // Active selections point at the LIVE workspace column so a
        // soft-deleted profile cannot stay selected.
        const expectedParent =
          cfg.name === "workspace_member_active_profiles"
            ? ["id", "liveWorkspaceId"]
            : ["id", "workspaceId"];
        expect(ref.foreignColumns.map(c => c.name)).toEqual(expectedParent);
      }
    }
  });

  for (const table of tables) {
    const cfg = getTableConfig(table);
    it(`${cfg.name}: nullability and deletion rules match the SQL draft`, () => {
      const block = sqlBlockFor(cfg.name);
      for (const col of cfg.columns) {
        const line =
          block
            .split("\n")
            .find(l => new RegExp(`^\\s+\`${col.name}\`\\s`).test(l)) ?? "";
        const sqlNotNull =
          /\bNOT NULL\b/.test(line) || /PRIMARY KEY/.test(line);
        const pkCols = [
          ...(block.match(/PRIMARY KEY \(([^)]+)\)/)?.[1] ?? "").matchAll(
            /`(\w+)`/g
          ),
        ].map(m => m[1]);
        expect(col.notNull, `${cfg.name}.${col.name} nullability`).toBe(
          sqlNotNull || pkCols.includes(col.name)
        );
      }
      for (const fk of cfg.foreignKeys) {
        const m = block.match(
          new RegExp(
            `CONSTRAINT \`${fk.getName()}\` [^\\n]*ON DELETE (CASCADE|RESTRICT|SET NULL)`
          )
        );
        expect(m?.[1]?.toLowerCase(), `${fk.getName()} ON DELETE`).toBe(
          fk.onDelete
        );
      }
    });
  }

  it("history tables never cascade deletes; only selections and account answers do", () => {
    const cascading: string[] = [];
    for (const table of tables) {
      const cfg = getTableConfig(table);
      for (const fk of cfg.foreignKeys) {
        if (fk.onDelete === "cascade")
          cascading.push(`${cfg.name}.${fk.getName()}`);
      }
    }
    expect(cascading.sort()).toEqual([
      "user_onboarding_answers.fk_user_onboarding_answers_user",
      "workspace_member_active_profiles.fk_member_active_profile_member",
      "workspace_member_active_profiles.fk_member_active_profile_profile",
    ]);
  });

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

  it("only personalization modules touch the personalization tables", () => {
    const hits = execSync(
      'git grep --untracked -l -E "(from|import\\()\\s*[\'\\"][^\'\\"]*personalizationSchema" -- server client/src shared public-web scripts || true',
      { cwd: root }
    )
      .toString()
      .split("\n")
      .filter(Boolean)
      .filter(f => !f.endsWith(".test.ts"))
      .filter(f => !f.startsWith("server/personalization/"));
    expect(hits).toEqual([]);
  });

  it("the live server reaches personalization code only through the gated entry points", () => {
    const hits = execSync(
      'git grep --untracked -l -E "(from|import\\()\\s*[\'\\"][^\'\\"]*personalization/" -- server || true',
      { cwd: root }
    )
      .toString()
      .split("\n")
      .filter(Boolean)
      .filter(f => !f.endsWith(".test.ts"))
      .filter(f => !f.startsWith("server/personalization/"));
    // onboardingV2Router: every procedure but `experience` checks the rollout switch.
    // pilotHandlers: registers the two job types; jobs are only enqueued by that router.
    // homeV2Router: every procedure checks the Home switch (assertHomeV2Access).
    expect(hits.sort()).toEqual([
      "server/durableJobs/pilotHandlers.ts",
      "server/routers/homeV2Router.ts",
      "server/routers/onboardingV2Router.ts",
    ]);
  });

  it("every onboarding v2 procedure except `experience` is behind the rollout switch", () => {
    const src = readFileSync(
      path.join(root, "server/routers/onboardingV2Router.ts"),
      "utf8"
    );
    const procs = [...src.matchAll(/^  (\w+): (\w+)/gm)].map(m => [m[1], m[2]]);
    expect(procs.length).toBeGreaterThan(5);
    for (const [name, builder] of procs) {
      expect([name, builder]).toEqual([
        name,
        name === "experience" ? "protectedProcedure" : "v2Procedure",
      ]);
    }
  });

  it("every Home v2 procedure is behind the Home switch", () => {
    const src = readFileSync(path.join(root, "server/routers/homeV2Router.ts"), "utf8");
    expect(src).toMatch(/const homeProcedure = protectedProcedure\.use\(async \(\{ ctx, next \}\) => \{\s*await assertHomeV2Access\(ctx\.user\);/);
    const body = src.slice(src.indexOf("export const homeV2Router = router({"));
    const procs = [...body.matchAll(/^  (\w+): (\w+)/gm)].map(m => [m[1], m[2]]);
    expect(procs.length).toBeGreaterThanOrEqual(5);
    for (const [name, builder] of procs) expect([name, builder]).toEqual([name, "homeProcedure"]);
  });

  it("personalization jobs use the existing durable queue, off by default", () => {
    const types = readFileSync(
      path.join(root, "server/durableJobs/types.ts"),
      "utf8"
    );
    expect(types).toContain('"profile_analysis"');
    expect(types).toContain('"personalization_recommendations"');
    const dispatch = readFileSync(
      path.join(root, "server/durableJobs/dispatch.ts"),
      "utf8"
    );
    expect(dispatch).toContain(
      'profile_analysis: "DURABLE_QUEUE_PERSONALIZATION_ENABLED"'
    );
  });

  it("the new experience stays off by default for everyone", async () => {
    const { readExperienceConfig, resolveExperienceAccess } = await import(
      "../onboardingV2Access"
    );
    expect(
      resolveExperienceAccess(
        { role: "admin", email: "a@b.c", createdAt: new Date() },
        readExperienceConfig({})
      )
    ).toMatchObject({ onboarding: "legacy", home: "research" });
  });

  it("the draft SQL lives outside drizzle/", () => {
    expect(existsSync(draftSqlPath)).toBe(true);
    expect(draftSqlPath.includes(`${path.sep}drizzle${path.sep}`)).toBe(false);
  });
});
