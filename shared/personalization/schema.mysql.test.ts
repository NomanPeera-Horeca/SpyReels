/**
 * Runs the draft SQL against a REAL MySQL 8 database and attacks it:
 * cross-workspace references, invalid ownership, stale references, profile
 * switching, cleanup attempts against confirmed values, duplicate and
 * concurrent analysis jobs, invented numbers.
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
import { PERSONALIZATION_PURGE_ORDER } from "../../server/personalization/lifecycle";

const url = process.env.PERSONALIZATION_SCHEMA_TEST_DB;
const root = path.resolve(__dirname, "../..");

const WS_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WS_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const P_A = "pa000000-0000-4000-8000-000000000001";
const P_A2 = "pa000000-0000-4000-8000-000000000002";
const P_B = "pb000000-0000-4000-8000-000000000001";
const RUN_A = "ra000000-0000-4000-8000-000000000001";
const RUN_B = "rb000000-0000-4000-8000-000000000001";

const FK_CHILD = /ER_NO_REFERENCED_ROW/;
const FK_PARENT = /ER_ROW_IS_REFERENCED/;
const CHECK = /ER_CHECK_CONSTRAINT_VIOLATED/;
const DUP = /ER_DUP_ENTRY/;

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
  let db2: mysql.Connection;
  let connectOpts: mysql.ConnectionOptions;

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

  beforeAll(async () => {
    const u = new URL(url!);
    const dbName = u.pathname.replace(/^\//, "");
    if (!/^[a-z0-9_]+$/i.test(dbName) || /prod|staging|railway/i.test(url!)) {
      throw new Error(
        "Refusing to use this database for a destructive schema test"
      );
    }
    connectOpts = {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      multipleStatements: true,
    };
    db = await mysql.createConnection(connectOpts);
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
    db2 = await mysql.createConnection({ ...connectOpts, database: dbName });
  });

  afterAll(async () => {
    await db?.end();
    await db2?.end();
  });

  beforeEach(async () => {
    await run("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [
      ...PERSONALIZATION_PURGE_ORDER,
      "user_onboarding_answers",
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
      `INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey, requestKind, status, requestedByUserId, completedAt) VALUES
       (?, ?, ?, 'aaaaaaaaaaaaaaaa', 'profile_analysis:a:initial', 'initial', 'succeeded', 1, NOW()),
       (?, ?, ?, 'bbbbbbbbbbbbbbbb', 'profile_analysis:b:initial', 'initial', 'succeeded', 2, NOW())`,
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
  const insertRun = (
    id: string,
    key: string,
    over: {
      kind?: string;
      status?: string;
      seq?: number | null;
      profile?: string;
      ws?: string;
    } = {}
  ) =>
    run(
      "INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey, requestKind, refreshSequence, status) VALUES (?, ?, ?, 'cccccccccccccccc', ?, ?, ?, ?)",
      [
        id,
        over.ws ?? WS_A,
        over.profile ?? P_A,
        key,
        over.kind ?? "user_refresh",
        over.seq === undefined ? 1 : over.seq,
        over.status ?? "queued",
      ]
    );

  /** Confirmed goal, audience, pillar (measured, cites RUN_A), niche, language. */
  const seedConfirmed = async () => {
    const rows = [
      item({
        kind: "goal",
        payload: JSON.stringify({ text: "Sell more ovens" }),
      }),
      item({
        kind: "audience",
        payload: JSON.stringify({ who: "Owners", outcome: "save" }),
      }),
      item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "Tours",
          description: "",
          viewSharePercent: 40,
        }),
        source: "user_edited",
        evidence: "performance_backed",
        analysisRunId: RUN_A,
      }),
      item({
        kind: "niche",
        payload: JSON.stringify({ slug: "food", label: "Food" }),
      }),
      item({
        kind: "language",
        payload: JSON.stringify({ code: "en", label: "English" }),
      }),
    ];
    for (const r of rows) await run(r.sql, r.params);
    await run(
      "INSERT INTO profile_analysis_stages (runId, stage, status) VALUES (?, 'published_content', 'done')",
      [RUN_A]
    );
    return rows.map(r => r.id);
  };
  const confirmedCount = () =>
    count(
      "personalization_items",
      "socialProfileId = ? AND status = 'confirmed'",
      [P_A]
    );

  /* ---------------------------------------------------------------- */

  describe("Task 1: confirmed personalization survives every analysis cleanup attempt", () => {
    it("deleting the analysis run a confirmed pillar cites is refused", async () => {
      await seedConfirmed();
      await rejects(
        "DELETE FROM profile_analysis_runs WHERE id = ?",
        [RUN_A],
        FK_PARENT
      );
      expect(await confirmedCount()).toBe(5);
    });

    it("deleting all runs of a profile ('cleanup') is refused while history exists", async () => {
      await seedConfirmed();
      await rejects(
        "DELETE FROM profile_analysis_runs WHERE socialProfileId = ?",
        [P_A],
        FK_PARENT
      );
      expect(
        await count("profile_analysis_runs", "socialProfileId = ?", [P_A])
      ).toBe(1);
      expect(await confirmedCount()).toBe(5);
    });

    it("deleting a run's stages first still cannot unlock deleting a run that items cite", async () => {
      await seedConfirmed();
      await run("DELETE FROM profile_analysis_stages WHERE runId = ?", [RUN_A]);
      await rejects(
        "DELETE FROM profile_analysis_runs WHERE id = ?",
        [RUN_A],
        FK_PARENT
      );
      expect(await confirmedCount()).toBe(5);
    });

    it("a run with stages cannot be casually deleted even with no items", async () => {
      await insertRun("r-x", "k-x", { status: "failed" });
      await run(
        "INSERT INTO profile_analysis_stages (runId, stage, status) VALUES ('r-x', 'published_content', 'failed')"
      );
      await rejects(
        "DELETE FROM profile_analysis_runs WHERE id = 'r-x'",
        [],
        FK_PARENT
      );
    });

    it("analysis failure and retry change only the run row; confirmed values are untouched", async () => {
      await seedConfirmed();
      await run(
        "UPDATE profile_analysis_runs SET status = 'failed', errorCode = 'provider_timeout' WHERE id = ?",
        [RUN_A]
      );
      await run(
        "UPDATE profile_analysis_runs SET status = 'queued', errorCode = NULL, completedAt = NULL WHERE id = ?",
        [RUN_A]
      );
      expect(await confirmedCount()).toBe(5);
    });

    it("regeneration supersedes old AI suggestions and keeps every confirmed value", async () => {
      await seedConfirmed();
      const oldSuggestion = item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "Old idea",
          description: "",
          viewSharePercent: null,
        }),
        source: "ai_suggested",
        status: "suggested",
        evidence: "profile_inferred",
      });
      await run(oldSuggestion.sql, oldSuggestion.params);
      await insertRun("r-regen", "k-regen", { status: "succeeded", seq: 1 });
      await run(
        "UPDATE personalization_items SET status = 'superseded' WHERE socialProfileId = ? AND source = 'ai_suggested' AND status = 'suggested' AND kind = 'pillar'",
        [P_A]
      );
      expect(
        await count(
          "personalization_items",
          "id = ? AND status = 'superseded'",
          [oldSuggestion.id]
        )
      ).toBe(1);
      expect(await confirmedCount()).toBe(5);
    });

    it("hard-deleting a profile with history is refused (history is not casually deleted)", async () => {
      await seedConfirmed();
      await rejects(
        "DELETE FROM social_profiles WHERE id = ?",
        [P_A],
        FK_PARENT
      );
      expect(await confirmedCount()).toBe(5);
    });

    it("hard-deleting a workspace with profiles is refused", async () => {
      await rejects("DELETE FROM workspaces WHERE id = ?", [WS_A], FK_PARENT);
    });

    it("the explicit erasure order (lifecycle.ts) removes everything cleanly, scoped to one workspace", async () => {
      await seedConfirmed();
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?)",
        [WS_A, P_A]
      );
      await run(
        "INSERT INTO personalization_progress (socialProfileId, workspaceId) VALUES (?, ?)",
        [P_A, WS_A]
      );
      for (const table of PERSONALIZATION_PURGE_ORDER) {
        if (table === "profile_analysis_stages") {
          await run(
            "DELETE s FROM profile_analysis_stages s JOIN profile_analysis_runs r ON r.id = s.runId WHERE r.workspaceId = ?",
            [WS_A]
          );
        } else {
          await run(`DELETE FROM \`${table}\` WHERE workspaceId = ?`, [WS_A]);
        }
      }
      for (const table of PERSONALIZATION_PURGE_ORDER) {
        if (table !== "profile_analysis_stages")
          expect(await count(table, "workspaceId = ?", [WS_A])).toBe(0);
      }
      expect(await count("social_profiles", "workspaceId = ?", [WS_B])).toBe(1);
      expect(
        await count("profile_analysis_runs", "workspaceId = ?", [WS_B])
      ).toBe(1);
    });
  });

  describe("Task 1: profile soft delete keeps history and removes it from active selections", () => {
    it("soft delete is refused while a member still has the profile selected", async () => {
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 3, ?)",
        [WS_A, P_A]
      );
      await rejects(
        "UPDATE social_profiles SET deletedAt = NOW() WHERE id = ?",
        [P_A],
        FK_PARENT
      );
    });

    it("clearing selections then soft deleting works, and history stays", async () => {
      await seedConfirmed();
      await run(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?), (?, 3, ?)",
        [WS_A, P_A, WS_A, P_A]
      );
      await run(
        "DELETE FROM workspace_member_active_profiles WHERE socialProfileId = ?",
        [P_A]
      );
      await run("UPDATE social_profiles SET deletedAt = NOW() WHERE id = ?", [
        P_A,
      ]);
      expect(await confirmedCount()).toBe(5);
      expect(
        await count("profile_analysis_runs", "socialProfileId = ?", [P_A])
      ).toBe(1);
    });

    it("a soft-deleted profile cannot be selected again", async () => {
      await run("UPDATE social_profiles SET deletedAt = NOW() WHERE id = ?", [
        P_A,
      ]);
      await rejects(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?)",
        [WS_A, P_A],
        FK_CHILD
      );
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
  });

  /* ---------------------------------------------------------------- */

  describe("Task 2: duplicate jobs, concurrency and legitimate refresh", () => {
    it("the same request (same idempotency key) can never create a second run", async () => {
      await rejects(
        "INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey, requestKind, status) VALUES ('dup', ?, ?, 'aaaaaaaaaaaaaaaa', 'profile_analysis:a:initial', 'initial', 'succeeded')",
        [WS_A, P_A],
        DUP
      );
    });

    it("only one queued or running analysis per profile, whatever the request kind", async () => {
      await insertRun("r-q", "k-q", { status: "queued", seq: 1 });
      await expect(
        insertRun("r-bg", "k-bg", {
          kind: "background",
          seq: null,
          status: "queued",
        })
      ).rejects.toMatchObject({
        code: expect.stringMatching(DUP),
      });
      // Another profile is independent.
      await insertRun("r-other", "k-other", {
        profile: P_A2,
        status: "running",
        seq: 1,
      });
    });

    it("two connections racing to start an analysis: exactly one wins", async () => {
      const attempt = (conn: mysql.Connection, id: string, key: string) =>
        conn
          .query(
            "INSERT INTO profile_analysis_runs (id, workspaceId, socialProfileId, inputHash, idempotencyKey, requestKind, refreshSequence, status) VALUES (?, ?, ?, 'dddddddddddddddd', ?, 'user_refresh', 1, 'queued')",
            [id, WS_A, P_A, key]
          )
          .then(() => "won")
          .catch((e: { code?: string }) => e.code);
      const results = await Promise.all([
        attempt(db, "race-1", "k-race-1"),
        attempt(db2, "race-2", "k-race-2"),
      ]);
      expect(results.filter(r => r === "won")).toHaveLength(1);
      expect(results.filter(r => r === "ER_DUP_ENTRY")).toHaveLength(1);
      expect(
        await count(
          "profile_analysis_runs",
          "socialProfileId = ? AND status = 'queued'",
          [P_A]
        )
      ).toBe(1);
    });

    it("a legitimate refresh on the same day is allowed once the previous run finished, and history is kept", async () => {
      await insertRun("r-1", "k-refresh-1", { status: "running", seq: 1 });
      await run(
        "UPDATE profile_analysis_runs SET status = 'succeeded', completedAt = NOW() WHERE id = 'r-1'"
      );
      await insertRun("r-2", "k-refresh-2", { status: "queued", seq: 2 });
      expect(
        await count("profile_analysis_runs", "socialProfileId = ?", [P_A])
      ).toBe(3);
    });

    it("refresh sequence is required for user refreshes and forbidden otherwise", async () => {
      await expect(
        insertRun("r-s0", "k-s0", { seq: null, status: "failed" })
      ).rejects.toMatchObject({ code: expect.stringMatching(CHECK) });
      await expect(
        insertRun("r-s1", "k-s1", { kind: "initial", seq: 1, status: "failed" })
      ).rejects.toMatchObject({ code: expect.stringMatching(CHECK) });
    });
  });

  /* ---------------------------------------------------------------- */

  describe("Task 3: workspace isolation and ownership", () => {
    it("profiles cannot reference a workspace that does not exist", async () => {
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('x1', 'no-such-ws', 'instagram', 'h', 'confirmed')",
        [],
        FK_CHILD
      );
    });

    it("a profile with history cannot be moved to another workspace", async () => {
      await seedConfirmed();
      await rejects(
        "UPDATE social_profiles SET workspaceId = ? WHERE id = ?",
        [WS_B, P_A],
        FK_PARENT
      );
    });

    it("the same handle twice in one workspace is refused, allowed in another", async () => {
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('x2', ?, 'instagram', 'brand_a', 'confirmed')",
        [WS_A],
        DUP
      );
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('x3', ?, 'instagram', 'brand_a', 'confirmed')",
        [WS_B]
      );
    });

    it("active-profile selection requires membership and a profile of the same workspace", async () => {
      await rejects(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 1, ?)",
        [WS_A, P_B],
        FK_CHILD
      );
      await rejects(
        "INSERT INTO workspace_member_active_profiles (workspaceId, userId, socialProfileId) VALUES (?, 2, ?)",
        [WS_A, P_A],
        FK_CHILD
      );
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
        FK_CHILD
      );
    });

    it("analysis runs cannot reference a profile of another workspace", async () => {
      await expect(
        insertRun("r9", "k9", { ws: WS_B, profile: P_A, status: "failed" })
      ).rejects.toMatchObject({ code: expect.stringMatching(FK_CHILD) });
    });

    it("items cannot attach to another workspace's profile or cite another profile's analysis", async () => {
      const wrongWs = item({ workspaceId: WS_B, socialProfileId: P_A });
      await rejects(wrongWs.sql, wrongWs.params, FK_CHILD);
      const wrongRun = item({
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
      await rejects(wrongRun.sql, wrongRun.params, FK_CHILD);
    });

    it("progress cannot be written for a profile under another workspace", async () => {
      await rejects(
        "INSERT INTO personalization_progress (socialProfileId, workspaceId) VALUES (?, ?)",
        [P_A2, WS_B],
        FK_CHILD
      );
    });
  });

  describe("no invented numbers, clean skips, valid identities", () => {
    it("performance-backed items need a run; AI-recommended pillars cannot carry a view share", async () => {
      const noRun = item({
        evidence: "performance_backed",
        analysisRunId: null,
      });
      await rejects(noRun.sql, noRun.params, CHECK);
      const inventedShare = item({
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
      await rejects(inventedShare.sql, inventedShare.params, CHECK);
    });

    it("zero-post, private and 'not posting yet' profiles can store recommended pillars without numbers", async () => {
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('priv', ?, 'instagram', 'private_acct', 'private')",
        [WS_A]
      );
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np1', ?, NULL, NULL, 'not_posting_yet')",
        [WS_A]
      );
      for (const profile of [P_A, "priv", "np1"]) {
        const i = item({
          socialProfileId: profile,
          kind: "pillar",
          payload: JSON.stringify({
            title: `Idea for ${profile}`,
            description: "",
          }),
          source: "ai_suggested",
          status: "suggested",
          evidence: "profile_inferred",
        });
        await run(i.sql, i.params);
      }
    });

    it("'I don't post yet' has no handle; real profiles need platform and handle; strategy carries over", async () => {
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np2', ?, NULL, NULL, 'not_posting_yet')",
        [WS_A]
      );
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np3', ?, 'instagram', 'x', 'not_posting_yet')",
        [WS_A],
        CHECK
      );
      await rejects(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('np4', ?, NULL, NULL, 'confirmed')",
        [WS_A],
        CHECK
      );
      const i = item({ socialProfileId: "np2" });
      await run(i.sql, i.params);
      await run(
        "UPDATE social_profiles SET status = 'pending_confirmation', platform = 'instagram', normalizedHandle = 'new_creator' WHERE id = 'np2'"
      );
      expect(
        await count("personalization_items", "socialProfileId = 'np2'")
      ).toBe(1);
    });

    it("dismissed rows record their version; attribution cannot be both answered and skipped", async () => {
      const bad = item({ status: "dismissed", dismissedAtVersion: null });
      await rejects(bad.sql, bad.params, CHECK);
      await rejects(
        "INSERT INTO user_onboarding_answers (userId, attributionSource, attributionSkippedAt) VALUES (1, 'friend', NOW())",
        [],
        CHECK
      );
      await run(
        "INSERT INTO user_onboarding_answers (userId, attributionSkippedAt) VALUES (1, NOW())"
      );
    });

    it("editing keeps the old row as superseded and does not touch analysis history", async () => {
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

  describe("migration 0104 pillar_subtopics", () => {
    const migration = () =>
      readFileSync(path.join(root, "drizzle/0104_pillar_subtopics.sql"), "utf8");

    it("keeps existing pillars, enforces keys, and rolls back without deleting them", async () => {
      const pillar = item({
        kind: "pillar",
        payload: JSON.stringify({
          title: "Tours",
          description: "",
          viewSharePercent: null,
        }),
        source: "user_entered",
        evidence: "user_provided",
      });
      await run(pillar.sql, pillar.params);
      const ensureTable = async () => {
        const [rows] = await run(
          "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pillar_subtopics'"
        );
        if (Number((rows as Array<{ n: number }>)[0].n) === 0) await run(migration());
      };
      try {
        await run("DROP TABLE pillar_subtopics");
        await expect(run("SELECT COUNT(*) AS n FROM pillar_subtopics")).rejects.toMatchObject({
          code: "ER_NO_SUCH_TABLE",
        });
        expect(await count("personalization_items", "id = ?", [pillar.id])).toBe(1);

        await run(migration());
        expect(await count("pillar_subtopics")).toBe(0);
        expect(await count("personalization_items", "id = ?", [pillar.id])).toBe(1);

        await run(
          `INSERT INTO pillar_subtopics (id, workspaceId, socialProfileId, pillarItemId, label, normalizedLabel, normalizedPillarTitle, status, source, basedOnPillarHash)
           VALUES ('st-1', ?, ?, ?, 'Food cost', 'food cost', 'tours', 'suggested', 'ai_suggested', 'h')`,
          [WS_A, P_A, pillar.id]
        );
        await rejects(
          `INSERT INTO pillar_subtopics (id, workspaceId, socialProfileId, pillarItemId, label, normalizedLabel, normalizedPillarTitle, status, source, basedOnPillarHash)
           VALUES ('st-2', ?, ?, ?, 'Menu', 'menu', 'tours', 'suggested', 'ai_suggested', 'h')`,
          [WS_B, P_A, pillar.id],
          FK_CHILD
        );
        await rejects(
          `INSERT INTO pillar_subtopics (id, workspaceId, socialProfileId, pillarItemId, label, normalizedLabel, normalizedPillarTitle, status, source, basedOnPillarHash)
           VALUES ('st-3', ?, ?, '00000000-0000-4000-8000-000000000099', 'Menu', 'menu', 'tours', 'suggested', 'ai_suggested', 'h')`,
          [WS_A, P_A],
          FK_CHILD
        );
        await rejects(
          `INSERT INTO pillar_subtopics (id, workspaceId, socialProfileId, pillarItemId, label, normalizedLabel, normalizedPillarTitle, status, source, basedOnPillarHash)
           VALUES ('st-4', ?, ?, ?, 'Food Cost', 'food cost', 'tours', 'suggested', 'ai_suggested', 'h')`,
          [WS_A, P_A, pillar.id],
          DUP
        );
        await rejects(
          `INSERT INTO pillar_subtopics (id, workspaceId, socialProfileId, pillarItemId, label, normalizedLabel, normalizedPillarTitle, status, dismissedFromStatus, source, basedOnPillarHash)
           VALUES ('st-5', ?, ?, ?, 'Ghost', 'ghost', 'tours', 'suggested', 'suggested', 'ai_suggested', 'h')`,
          [WS_A, P_A, pillar.id],
          CHECK
        );
        await rejects("DELETE FROM personalization_items WHERE id = ?", [pillar.id], FK_PARENT);

        await run("DROP TABLE pillar_subtopics");
        expect(await count("personalization_items", "id = ?", [pillar.id])).toBe(1);
        await run(migration());
        await run(migration());
        expect(await count("pillar_subtopics")).toBe(0);
        expect(await count("personalization_items", "id = ?", [pillar.id])).toBe(1);
      } finally {
        await ensureTable();
      }
    });
  });
});
