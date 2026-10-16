/**
 * Runs the draft SQL against a REAL MySQL 8 database and attacks it:
 * cross-workspace references, invalid ownership, stale references, profile
 * switching, invented numbers and duplicate jobs.
 *
 * Skipped unless PERSONALIZATION_SCHEMA_TEST_DB is set, e.g.
 *   PERSONALIZATION_SCHEMA_TEST_DB=mysql://user:pass@127.0.0.1:3306/scratch_db
 * The database named in the URL is DROPPED and recreated. Never point this at
 * a shared, staging or production database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.PERSONALIZATION_SCHEMA_TEST_DB;
const root = path.resolve(__dirname, "../..");

const WS_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WS_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const P_A = "pa000000-0000-4000-8000-000000000001";
const P_A2 = "pa000000-0000-4000-8000-000000000002";
const P_B = "pb000000-0000-4000-8000-000000000001";
const RUN_A = "ra000000-0000-4000-8000-000000000001";
const RUN_B = "rb000000-0000-4000-8000-000000000001";

function baseDdl(): string {
  const ddl = readFileSync(
    path.join(root, "drizzle/0042_workspaces_phase1_create.sql"),
    "utf8"
  );
  const pick = (name: string) => {
    const start = ddl.indexOf(`CREATE TABLE \`${name}\``);
    const end = ddl.indexOf(";", ddl.indexOf(") ENGINE=", start));
    return ddl.slice(start, end + 1);
  };
  return [
    "CREATE TABLE `users` (`id` int AUTO_INCREMENT NOT NULL PRIMARY KEY, `email` varchar(320)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;",
    pick("workspaces"),
    pick("workspace_members"),
  ].join("\n");
}

describe.skipIf(!url)("personalization schema on real MySQL", () => {
  let db: mysql.Connection;

  const run = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const rejects = async (sql: string, params: unknown[], code: RegExp) => {
    await expect(run(sql, params)).rejects.toMatchObject({
      code: expect.stringMatching(code),
    });
  };
  const count = async (
    table: string,
    where = "1=1",
    params: unknown[] = []
  ) => {
    const [rows] = await run(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`,
      params
    );
    return Number((rows as Array<{ n: number }>)[0].n);
  };

  const FK = /ER_NO_REFERENCED_ROW|ER_NO_REFERENCED_ROW_2/;
  const CHECK = /ER_CHECK_CONSTRAINT_VIOLATED/;

  beforeAll(async () => {
    const u = new URL(url!);
    const dbName = u.pathname.replace(/^\//, "");
    if (!/^[a-z0-9_]+$/i.test(dbName) || /prod|staging|railway/i.test(url!)) {
      throw new Error(
        "Refusing to use this database for a destructive schema test"
      );
    }
    db = await mysql.createConnection({
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      multipleStatements: true,
    });
    await run(
      `DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\`; USE \`${dbName}\`;`
    );
    await run(baseDdl());
    const draft = readFileSync(
      path.join(
        root,
        "docs/architecture/drafts/onboarding_v2_personalization.sql"
      ),
      "utf8"
    );
    await run(draft);
    await run(draft); // idempotent
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await run("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [
      "personalization_progress",
      "personalization_items",
      "profile_analysis_stages",
      "profile_analysis_runs",
      "user_onboarding_answers",
      "workspace_member_active_profiles",
      "social_profiles",
      "workspace_members",
      "workspaces",
      "users",
    ]) {
      await run(`DELETE FROM \`${t}\``);
    }
    await run("SET FOREIGN_KEY_CHECKS = 1");
    // user 1 owns A, user 2 owns B, user 3 is a member of A only
    await run(
      "INSERT INTO users (id, email) VALUES (1,'a@x.test'),(2,'b@x.test'),(3,'m@x.test')"
    );
    await run(
      "INSERT INTO workspaces (id, name, ownerUserId) VALUES (?, 'A', 1), (?, 'B', 2)",
      [WS_A, WS_B]
    );
    await run(
      "INSERT INTO workspace_members (id, workspaceId, userId, role) VALUES (UUID(), ?, 1, 'owner'), (UUID(), ?, 3, 'member'), (UUID(), ?, 2, 'owner')",
      [WS_A, WS_A, WS_B]
    );
    await run(
      `INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status, createdByUserId, createdAt) VALUES
       (?, ?, 'instagram', 'brand_a', 'confirmed', 1, '2026-01-01 00:00:00'),
       (?, ?, 'tiktok', 'brand_a', 'confirmed', 1, '2026-01-02 00:00:00'),
       (?, ?, 'instagram', 'brand_b', 'confirmed', 2, '2026-01-01 00:00:00')`,
      [P_A, WS_A, P_A2, WS_A, P_B, WS_B]
    );
    await run(
      `INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey, status, requestedByUserId) VALUES
       (?, ?, ?, 'aaaaaaaaaaaaaaaa', 'profile_analysis:a:1', 'succeeded', 1),
       (?, ?, ?, 'bbbbbbbbbbbbbbbb', 'profile_analysis:b:1', 'succeeded', 2)`,
      [RUN_A, WS_A, P_A, RUN_B, WS_B, P_B]
    );
  });

  const item = (over: Record<string, unknown> = {}) => {
    const row = {
      id: `it-${Math.random().toString(16).slice(2, 10)}`,
      workspaceId: WS_A,
      socialProfileId: P_A,
      kind: "goal",
      payload: JSON.stringify({ text: "Sell more ovens" }),
      source: "user_entered",
      status: "confirmed",
      evidence: "user_provided",
      basedOnVersion: 1,
      dismissedAtVersion: null,
      analysisRunId: null,
      supersedesItemId: null,
      ...over,
    };
    const cols = Object.keys(row);
    return {
      sql: `INSERT INTO personalization_items (${cols.map(c => `\`${c}\``).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
      params: Object.values(row),
      id: row.id,
    };
  };

  describe("1. every social profile belongs to exactly one existing workspace", () => {
    it("rejects a profile for a workspace that does not exist", async () => {
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('x1', 'no-such-ws', 'instagram', 'h', 'confirmed')",
        [],
        FK
      );
    });
    it("rejects the same handle twice in one workspace, allows it in another", async () => {
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('x2', ?, 'instagram', 'brand_a', 'confirmed')",
        [WS_A],
        /ER_DUP_ENTRY/
      );
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('x3', ?, 'instagram', 'brand_a', 'confirmed')",
        [WS_B]
      );
    });
  });

  describe("2. a member cannot select a profile from another workspace", () => {
    it("rejects selecting workspace B's profile inside workspace A", async () => {
      await rejects(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?)",
        [WS_A, P_B],
        FK
      );
    });
    it("rejects a selection by someone who is not a member of the workspace", async () => {
      await rejects(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 2, ?)",
        [WS_A, P_A],
        FK
      );
    });
    it("allows profile switching within the workspace, one selection per member", async () => {
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 3, ?)",
        [WS_A, P_A]
      );
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 3, ?) ON DUPLICATE KEY UPDATE socialProfileId = VALUES(socialProfileId)",
        [WS_A, P_A2]
      );
      expect(
        await count("workspace_member_active_profiles", "userId = 3")
      ).toBe(1);
      await rejects(
        "UPDATE workspace_member_active_profiles SET socialProfileId = ? WHERE workspaceId = ? AND userId = 3",
        [P_B, WS_A],
        FK
      );
    });
  });

  describe("3. analysis runs belong to the correct profile and workspace", () => {
    it("rejects a run whose workspace does not own the profile", async () => {
      await rejects(
        "INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey) VALUES ('r9', ?, ?, 'cccccccccccccccc', 'k9')",
        [WS_B, P_A],
        FK
      );
    });
    it("rejects a duplicate job (same idempotency key)", async () => {
      await rejects(
        "INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey) VALUES ('r10', ?, ?, 'aaaaaaaaaaaaaaaa', 'profile_analysis:a:1')",
        [WS_A, P_A],
        /ER_DUP_ENTRY/
      );
    });
  });

  describe("4. personalization items cannot attach to unrelated profiles", () => {
    it("rejects an item whose workspace does not own the profile", async () => {
      const i = item({ workspaceId: WS_B, socialProfileId: P_A });
      await rejects(i.sql, i.params, FK);
    });
    it("rejects an item that cites another profile's analysis run", async () => {
      const i = item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "Tours",
          description: "",
          viewSharePercent: 40,
        }),
        source: "ai_suggested",
        status: "suggested",
        evidence: "performance_backed",
        analysisRunId: RUN_B,
      });
      await rejects(i.sql, i.params, FK);
    });
    it("accepts a performance-backed pillar citing its own profile's run", async () => {
      const i = item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "Tours",
          description: "",
          viewSharePercent: 40,
        }),
        source: "ai_suggested",
        status: "suggested",
        evidence: "performance_backed",
        analysisRunId: RUN_A,
      });
      await run(i.sql, i.params);
    });
  });

  describe("5. switching workspace exposes nothing: every row is pinned to one workspace", () => {
    it("a workspace-scoped read for B returns none of A's data", async () => {
      const a = item();
      await run(a.sql, a.params);
      await run(
        "INSERT INTO personalization_progress (socialProfileId, workspaceId) VALUES (?, ?)",
        [P_A, WS_A]
      );
      for (const t of [
        "personalization_items",
        "personalization_progress",
        "profile_analysis_runs",
      ]) {
        expect(
          await count(t, "workspaceId = ? AND socialProfileId = ?", [WS_B, P_A])
        ).toBe(0);
      }
      await rejects(
        "INSERT INTO personalization_progress (socialProfileId, workspaceId) VALUES (?, ?)",
        [P_A2, WS_B],
        FK
      );
    });
  });

  describe("6. no invalid active selection after delete", () => {
    it("hard delete of a profile removes selections, items, runs, stages and progress", async () => {
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?)",
        [WS_A, P_A]
      );
      await run(
        "INSERT INTO profile_analysis_stages (runId, stage, status) VALUES (?, 'published_content', 'done')",
        [RUN_A]
      );
      const i = item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "T",
          description: "",
          viewSharePercent: 10,
        }),
        evidence: "performance_backed",
        analysisRunId: RUN_A,
      });
      await run(i.sql, i.params);
      await run(
        "INSERT INTO personalization_progress (socialProfileId, workspaceId) VALUES (?, ?)",
        [P_A, WS_A]
      );
      await run("DELETE FROM social_profiles WHERE id = ?", [P_A]);
      expect(await count("workspace_member_active_profiles")).toBe(0);
      expect(
        await count("personalization_items", "socialProfileId = ?", [P_A])
      ).toBe(0);
      expect(
        await count("profile_analysis_runs", "socialProfileId = ?", [P_A])
      ).toBe(0);
      expect(await count("profile_analysis_stages")).toBe(0);
      expect(await count("personalization_progress")).toBe(0);
    });
    it("a member leaving the workspace removes their selection", async () => {
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 3, ?)",
        [WS_A, P_A]
      );
      await run(
        "DELETE FROM workspace_members WHERE workspaceId = ? AND userId = 3",
        [WS_A]
      );
      expect(await count("workspace_member_active_profiles")).toBe(0);
    });
    it("soft delete keeps the row, so the server must clear selections (see resolveActiveProfileId)", async () => {
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?)",
        [WS_A, P_A]
      );
      await run("UPDATE social_profiles SET deletedAt = NOW() WHERE id = ?", [
        P_A,
      ]);
      // Documented limit: the DB cannot see soft deletes. The server deactivation
      // path deletes selections in the same transaction, and readers ignore them.
      expect(await count("workspace_member_active_profiles")).toBe(1);
    });
  });

  describe("no invented numbers, clean skips, valid identities", () => {
    it("rejects performance-backed items without a run", async () => {
      const i = item({ evidence: "performance_backed", analysisRunId: null });
      await rejects(i.sql, i.params, CHECK);
    });
    it("rejects a view share on an AI-recommended (not measured) pillar", async () => {
      const i = item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "T",
          description: "",
          viewSharePercent: 35,
        }),
        source: "ai_suggested",
        status: "suggested",
        evidence: "profile_inferred",
      });
      await rejects(i.sql, i.params, CHECK);
    });
    it("accepts a recommended pillar with no number (zero-post and private accounts)", async () => {
      for (const payload of [
        { title: "T", description: "", viewSharePercent: null },
        { title: "T2", description: "" },
      ]) {
        const i = item({
          kind: "pillar",
          payload: JSON.stringify(payload),
          source: "ai_suggested",
          status: "suggested",
          evidence: "profile_inferred",
        });
        await run(i.sql, i.params);
      }
    });
    it("dismissed rows must record the version they were dismissed at, others must not", async () => {
      const bad1 = item({ status: "dismissed", dismissedAtVersion: null });
      await rejects(bad1.sql, bad1.params, CHECK);
      const bad2 = item({ status: "confirmed", dismissedAtVersion: 2 });
      await rejects(bad2.sql, bad2.params, CHECK);
      const ok = item({
        status: "dismissed",
        dismissedAtVersion: 2,
        source: "ai_suggested",
        evidence: "profile_inferred",
      });
      await run(ok.sql, ok.params);
    });
    it("attribution cannot be both answered and skipped", async () => {
      await rejects(
        "INSERT INTO user_onboarding_answers (userId, attributionSource, attributionSkippedAt) VALUES (1, 'friend', NOW())",
        [],
        CHECK
      );
      await run(
        "INSERT INTO user_onboarding_answers (userId, attributionSkippedAt) VALUES (1, NOW())"
      );
    });
    it("'I don't post yet' profiles have no handle; real profiles must have platform and handle", async () => {
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np1', ?, NULL, NULL, 'not_posting_yet')",
        [WS_A]
      );
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np2', ?, 'instagram', 'x', 'not_posting_yet')",
        [WS_A],
        CHECK
      );
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np3', ?, NULL, NULL, 'confirmed')",
        [WS_A],
        CHECK
      );
      // The strategy carries over when they start posting.
      const i = item({ socialProfileId: "np1" });
      await run(i.sql, i.params);
      await run(
        "UPDATE social_profiles SET status = 'pending_confirmation', platform = 'instagram', normalizedHandle = 'new_creator' WHERE id = 'np1'"
      );
      expect(
        await count("personalization_items", "socialProfileId = 'np1'")
      ).toBe(1);
    });
  });

  describe("history is preserved", () => {
    it("editing creates a new row; the old one stays as superseded; runs are untouched", async () => {
      const old = item({
        kind: "audience",
        payload: JSON.stringify({ who: "Owners", outcome: "save" }),
      });
      await run(old.sql, old.params);
      const runsBefore = await count("profile_analysis_runs");
      await run(
        "UPDATE personalization_items SET status = 'superseded' WHERE id = ?",
        [old.id]
      );
      const edited = item({
        kind: "audience",
        payload: JSON.stringify({ who: "Chefs", outcome: "save" }),
        source: "user_edited",
        basedOnVersion: 2,
        supersedesItemId: old.id,
      });
      await run(edited.sql, edited.params);
      expect(
        await count(
          "personalization_items",
          "socialProfileId = ? AND kind = 'audience'",
          [P_A]
        )
      ).toBe(2);
      expect(await count("profile_analysis_runs")).toBe(runsBefore);
    });
  });
});
