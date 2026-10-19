import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  loadRepoMigrations,
  parseMysqlVersion,
  runPersonalizationPreflight,
  type Queryable,
} from "./preflight";

const root = path.resolve(__dirname, "../..");
const repoMigrations = loadRepoMigrations(path.join(root, "drizzle"));

describe("parseMysqlVersion", () => {
  it("accepts 8.0.16 and later", () => {
    for (const v of ["8.0.16", "8.0.46-0ubuntu0.24.04.4", "8.4.2", "9.1.0"]) {
      expect(parseMysqlVersion(v).ok, v).toBe(true);
    }
  });
  it("rejects older MySQL and MariaDB", () => {
    for (const v of ["8.0.15", "5.7.44-log", "10.11.6-MariaDB"]) {
      expect(parseMysqlVersion(v).ok, v).toBe(false);
    }
  });
});

describe("loadRepoMigrations", () => {
  it("hashes every numbered drizzle/*.sql file; 0105 is the latest in the repo", () => {
    expect(repoMigrations.length).toBeGreaterThan(100);
    expect(repoMigrations.at(-1)?.prefix).toBe("0105");
    expect(repoMigrations.every(m => /^[a-f0-9]{64}$/.test(m.sha256))).toBe(
      true
    );
  });
});

describe("read-only guard", () => {
  it("refuses any non-read statement before it reaches the database", async () => {
    const sent: string[] = [];
    const fake: Queryable = {
      query: async sql => {
        sent.push(sql);
        if (/__drizzle_migrations/.test(sql)) throw new Error("stop here");
        return [[], []];
      },
    };
    await expect(
      runPersonalizationPreflight(fake, {
        repoMigrations,
        expectedLatestPrefix: "0105",
      })
    ).rejects.toThrow("stop here");
    expect(
      sent.every(s =>
        /^\s*(SELECT|SHOW|START TRANSACTION READ ONLY|ROLLBACK)\b/i.test(s)
      )
    ).toBe(true);
    expect(sent.at(-1)).toBe("ROLLBACK");
  });
});

const url = process.env.PERSONALIZATION_SCHEMA_TEST_DB;

describe.skipIf(!url)(
  "preflight against a real MySQL that looks like production",
  () => {
    let db: mysql.Connection;
    const dbName = "pz_preflight";

    const run = (sql: string, params: unknown[] = []) => db.query(sql, params);

    beforeAll(async () => {
      const u = new URL(url!);
      db = await mysql.createConnection({
        host: u.hostname,
        port: Number(u.port || 3306),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        multipleStatements: true,
      });
    });
    afterAll(async () => db?.end());

    beforeEach(async () => {
      await run(
        `DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\` COLLATE utf8mb4_0900_ai_ci; USE \`${dbName}\`;`
      );
      const ddl = readFileSync(
        path.join(root, "drizzle/0042_workspaces_phase1_create.sql"),
        "utf8"
      );
      const pick = (name: string) => {
        const start = ddl.indexOf(`CREATE TABLE \`${name}\``);
        return ddl.slice(
          start,
          ddl.indexOf(";", ddl.indexOf(") ENGINE=", start)) + 1
        );
      };
      await run(
        "CREATE TABLE `users` (`id` int AUTO_INCREMENT NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
      );
      await run(pick("workspaces"));
      await run(pick("workspace_members"));
      await run(
        "CREATE TABLE `__drizzle_migrations` (`id` serial PRIMARY KEY, `hash` text NOT NULL, `created_at` bigint)"
      );
      // Record every repo migration in order, like production does.
      let t = 1_700_000_000_000;
      for (const m of repoMigrations) {
        await run(
          "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
          [m.sha256, (t += 1000)]
        );
      }
    });

    const preflight = () =>
      runPersonalizationPreflight(db, {
        repoMigrations,
        expectedLatestPrefix: "0105",
      });

    it("passes when 0105 is the latest, MySQL is 8.0.16+, collations match and no new table exists", async () => {
      const r = await preflight();
      expect(r.checks.map(c => [c.name, c.pass])).toEqual([
        ["latest_applied_migration", true],
        ["mysql_version", true],
        ["existing_tables_compatible", true],
        ["new_tables_absent", true],
      ]);
      expect(r.pass).toBe(true);
      expect(r.latestAppliedRepoMigration).toBe(
        "0105_pillar_subtopic_recovery.sql"
      );
    });

    it("fails when production has an unknown migration applied after 0102 (e.g. a 0103 from a branch)", async () => {
      await run(
        "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        ["f".repeat(64), 1_900_000_000_000]
      );
      const r = await preflight();
      expect(r.pass).toBe(false);
      expect(r.checks[0]).toMatchObject({
        name: "latest_applied_migration",
        pass: false,
      });
      expect(r.unknownAppliedHashes).toBe(1);
    });

    it("fails when 0102 was never recorded", async () => {
      const last = repoMigrations.at(-1)!;
      await run("DELETE FROM `__drizzle_migrations` WHERE `hash` = ?", [
        last.sha256,
      ]);
      expect((await preflight()).checks[0].pass).toBe(false);
    });

    it("fails when one of the new tables already exists", async () => {
      await run(
        "CREATE TABLE `social_profiles` (`id` varchar(36) PRIMARY KEY)"
      );
      const r = await preflight();
      expect(r.checks[3]).toMatchObject({
        name: "new_tables_absent",
        pass: false,
      });
    });

    it("fails when a referenced table uses a different collation", async () => {
      await run("SET FOREIGN_KEY_CHECKS = 0");
      await run(
        "ALTER TABLE `workspaces` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
      );
      await run("SET FOREIGN_KEY_CHECKS = 1");
      const r = await preflight();
      expect(r.checks[2]).toMatchObject({
        name: "existing_tables_compatible",
        pass: false,
      });
      expect(r.checks[2].detail).toContain("utf8mb4_unicode_ci");
    });

    it("a write attempted inside the preflight transaction is refused by MySQL itself", async () => {
      await run("START TRANSACTION READ ONLY");
      await expect(
        run(
          "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES ('x', 1)"
        )
      ).rejects.toThrow(/READ ONLY/);
      await run("ROLLBACK");
    });

    it("writes nothing: the migrations table is unchanged after a run", async () => {
      const [[before]] = (await run(
        "SELECT COUNT(*) AS n FROM `__drizzle_migrations`"
      )) as unknown as [[{ n: number }]];
      await preflight();
      const [[after]] = (await run(
        "SELECT COUNT(*) AS n FROM `__drizzle_migrations`"
      )) as unknown as [[{ n: number }]];
      expect(after.n).toBe(before.n);
    });
  }
);
