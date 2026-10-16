import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deterministicId,
  legacyValues,
  planLegacyBackfill,
} from "./legacyBackfill";
import { runLegacyBackfill } from "./runLegacyBackfill";

const root = path.resolve(__dirname, "../../..");

/* ------------------------------------------------------------------ */
/* Planner (pure)                                                      */
/* ------------------------------------------------------------------ */

describe("planLegacyBackfill", () => {
  const ws = (
    id: string,
    ownerUserId: number,
    isPersonal = true,
    deletedAt: Date | null = null
  ) => ({
    id,
    ownerUserId,
    isPersonal,
    deletedAt,
  });
  const user = (
    id: number,
    over: Partial<Parameters<typeof legacyValues>[0]> = {}
  ) => ({
    id,
    selectedNicheSlugs: ["fitness", " fitness ", "nutrition", ""],
    businessDescription: "  I help busy moms get fit  ",
    targetAudience: "Busy moms",
    ...over,
  });

  it("normalizes legacy values: trims, de-duplicates, drops empties", () => {
    expect(legacyValues(user(1))).toEqual({
      nicheSlugs: ["fitness", "nutrition"],
      brandDescription: "I help busy moms get fit",
      audience: "Busy moms",
    });
  });

  it("creates one unlinked profile in the personal workspace with confirmed, user-provided items", () => {
    const plan = planLegacyBackfill({
      users: [user(1)],
      workspaces: [ws("w1", 1)],
      memberships: [{ workspaceId: "w1", userId: 1 }],
      profiles: [],
      items: [],
    });
    expect(plan.profiles).toEqual([
      {
        id: deterministicId("legacy-backfill-profile", "w1"),
        workspaceId: "w1",
        status: "unlinked",
        createdByUserId: 1,
      },
    ]);
    expect(
      plan.items.map(i => [i.kind, i.source, i.status, i.evidence])
    ).toEqual([
      ["niche", "user_entered", "confirmed", "user_provided"],
      ["niche", "user_entered", "confirmed", "user_provided"],
      ["brand_description", "user_entered", "confirmed", "user_provided"],
      ["audience", "user_entered", "confirmed", "user_provided"],
    ]);
    expect(plan.items[3].payload).toEqual({ who: "Busy moms", outcome: "" });
  });

  it("is deterministic: the same input plans the same ids", () => {
    const input = {
      users: [user(1)],
      workspaces: [ws("w1", 1)],
      memberships: [{ workspaceId: "w1", userId: 1 }],
      profiles: [],
      items: [],
    };
    expect(planLegacyBackfill(input).items.map(i => i.id)).toEqual(
      planLegacyBackfill(input).items.map(i => i.id)
    );
  });

  it("never copies into team workspaces", () => {
    const plan = planLegacyBackfill({
      users: [user(1)],
      workspaces: [ws("w1", 1), ws("team", 9, false)],
      memberships: [
        { workspaceId: "w1", userId: 1 },
        { workspaceId: "team", userId: 1 },
      ],
      profiles: [],
      items: [],
    });
    expect(new Set(plan.items.map(i => i.workspaceId))).toEqual(
      new Set(["w1"])
    );
    expect(plan.counts.usersAlsoInTeamWorkspaces).toBe(1);
  });

  it("never overwrites newer values: only fills kinds the profile does not have", () => {
    const plan = planLegacyBackfill({
      users: [user(1)],
      workspaces: [ws("w1", 1)],
      memberships: [{ workspaceId: "w1", userId: 1 }],
      profiles: [
        { id: "p1", workspaceId: "w1", status: "confirmed", deletedAt: null },
      ],
      items: [{ socialProfileId: "p1", kind: "audience", status: "confirmed" }],
    });
    expect(plan.profiles).toEqual([]);
    expect(plan.items.map(i => i.kind)).toEqual([
      "niche",
      "niche",
      "brand_description",
    ]);
    expect(plan.outcomes[0]).toMatchObject({
      outcome: "planned",
      skippedKinds: ["audience"],
    });
  });

  it("reports ambiguous ownership instead of guessing", () => {
    const plan = planLegacyBackfill({
      users: [user(1), user(2), user(3), user(4)],
      workspaces: [
        ws("a", 1),
        ws("b", 1),
        ws("team", 9, false),
        ws("c", 3),
        ws("gone", 4, true, new Date()),
      ],
      memberships: [
        { workspaceId: "a", userId: 1 },
        { workspaceId: "b", userId: 1 },
        { workspaceId: "team", userId: 2 },
        { workspaceId: "c", userId: 3 },
        { workspaceId: "gone", userId: 4 },
      ],
      profiles: [
        { id: "c1", workspaceId: "c", status: "confirmed", deletedAt: null },
        { id: "c2", workspaceId: "c", status: "private", deletedAt: null },
      ],
      items: [],
    });
    expect(plan.outcomes.map(o => [o.userId, o.outcome])).toEqual([
      [1, "multiple_personal_workspaces"],
      [2, "no_personal_workspace"],
      [3, "multiple_profiles_in_workspace"],
      [4, "no_personal_workspace"],
    ]);
    expect(plan.items).toEqual([]);
  });

  it("users with nothing to copy are skipped", () => {
    const plan = planLegacyBackfill({
      users: [
        user(1, {
          selectedNicheSlugs: null,
          businessDescription: " ",
          targetAudience: null,
        }),
      ],
      workspaces: [ws("w1", 1)],
      memberships: [{ workspaceId: "w1", userId: 1 }],
      profiles: [],
      items: [],
    });
    expect(plan.outcomes[0].outcome).toBe("no_legacy_values");
    expect(plan.profiles).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Runner on real MySQL                                                */
/* ------------------------------------------------------------------ */

const url = process.env.PERSONALIZATION_SCHEMA_TEST_DB;

describe.skipIf(!url)(
  "runLegacyBackfill on real MySQL with realistic records",
  () => {
    let db: mysql.Connection;
    const dbName = "pz_backfill";
    const run = (sql: string, params: unknown[] = []) => db.query(sql, params);
    const one = async <T>(sql: string, params: unknown[] = []) =>
      ((await run(sql, params))[0] as T[])[0];

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
      await run(`CREATE TABLE users (
      id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      email varchar(320),
      selectedNicheSlugs json,
      businessDescription varchar(1000),
      targetAudience varchar(1000),
      instagramHandle varchar(64)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
      await run(pick("workspaces"));
      await run(pick("workspace_members"));
      // Stand-in for existing customer data that must stay untouched.
      await run(
        "CREATE TABLE plan_cards (id int PRIMARY KEY, workspaceId varchar(36), title varchar(200))"
      );
      await run(
        readFileSync(
          path.join(
            root,
            "docs/architecture/drafts/onboarding_v2_personalization.sql"
          ),
          "utf8"
        )
      );

      await run(`INSERT INTO users (id, email, selectedNicheSlugs, businessDescription, targetAudience, instagramHandle) VALUES
      (1, 'solo@x.test',   '["fitness","nutrition"]', 'I coach busy moms', 'Busy moms', 'solo_ig'),
      (2, 'team@x.test',   '["finance"]', 'Money tips for students', 'College students', NULL),
      (3, 'empty@x.test',  NULL, NULL, '  ', 'only_watermark'),
      (4, 'noper@x.test',  '["tech"]', 'AI tools', 'Founders', NULL),
      (5, 'newer@x.test',  '["cooking"]', 'Weeknight recipes', 'New parents', NULL),
      (6, 'twoprof@x.test','["travel"]', 'Budget travel', 'Students', NULL)`);
      await run(`INSERT INTO workspaces (id, name, ownerUserId, isPersonal) VALUES
      ('w-solo','Solo',1,1), ('w-team-p','Team owner personal',2,1), ('w-team','Agency',2,0),
      ('w-newer','Newer',5,1), ('w-two','Two',6,1)`);
      await run(`INSERT INTO workspace_members (id, workspaceId, userId, role) VALUES
      (UUID(),'w-solo',1,'owner'), (UUID(),'w-team-p',2,'owner'), (UUID(),'w-team',2,'owner'),
      (UUID(),'w-team',1,'member'), (UUID(),'w-team',4,'member'),
      (UUID(),'w-newer',5,'owner'), (UUID(),'w-two',6,'owner')`);
      // User 5 already finished the NEW onboarding: confirmed profile + confirmed audience.
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('p-newer','w-newer','instagram','chef_new','confirmed')"
      );
      await run(`INSERT INTO personalization_items (id, workspaceId, socialProfileId, kind, payload, source, status, evidence, basedOnVersion)
      VALUES ('i-newer','w-newer','p-newer','audience','{"who":"Home cooks","outcome":"cook faster"}','user_edited','confirmed','user_provided',2)`);
      // User 6 has two profiles: ambiguous.
      await run(
        "INSERT INTO social_profiles (id, workspaceId, platform, normalizedHandle, status) VALUES ('p2a','w-two','instagram','a','confirmed'), ('p2b','w-two','tiktok','b','confirmed')"
      );
      await run(
        "INSERT INTO plan_cards VALUES (1,'w-solo','Day 1'), (2,'w-team','Agency day 1')"
      );
    });

    const checksums = async () => {
      const [r] = await run(
        "CHECKSUM TABLE users, workspaces, workspace_members, plan_cards"
      );
      return JSON.stringify(r);
    };

    it("dry run writes nothing and reports the plan", async () => {
      const before = await checksums();
      const r = await runLegacyBackfill(db, { execute: false, batchSize: 2 });
      expect(r.executed).toBe(false);
      expect(r.inserted).toEqual({ profiles: 0, items: 0 });
      expect(
        (
          await one<{ n: number }>(
            "SELECT COUNT(*) n FROM personalization_items"
          )
        ).n
      ).toBe(1);
      expect(await checksums()).toBe(before);
      expect(r.counts).toMatchObject({
        usersScanned: 5,
        planned: 3,
        multiple_profiles_in_workspace: 1,
        no_personal_workspace: 1,
      });
    });

    it("execute copies into the right personal workspaces, never overwrites, and is idempotent", async () => {
      const before = await checksums();
      const first = await runLegacyBackfill(db, {
        execute: true,
        batchSize: 2,
      });
      expect(first.reconciliation).toEqual({
        profilesMissing: 0,
        itemsMissing: 0,
        ok: true,
      });
      expect(first.inserted).toEqual({
        profiles: 2,
        items: 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1,
      });

      // Solo user: unlinked profile in w-solo, 2 niches + brand + audience, all confirmed user_provided.
      const solo = (
        await run(
          "SELECT i.kind, i.source, i.status, i.evidence, p.status AS profileStatus, p.normalizedHandle FROM personalization_items i JOIN social_profiles p ON p.id = i.socialProfileId WHERE p.workspaceId = 'w-solo' ORDER BY i.kind, i.sortOrder"
        )
      )[0] as Array<Record<string, unknown>>;
      expect(solo.map(r => String(r.kind)).sort()).toEqual([
        "audience",
        "brand_description",
        "niche",
        "niche",
      ]);
      expect(
        new Set(
          solo.map(
            r =>
              `${r.source}/${r.status}/${r.evidence}/${r.profileStatus}/${r.normalizedHandle}`
          )
        )
      ).toEqual(
        new Set(["user_entered/confirmed/user_provided/unlinked/null"])
      );

      // instagramHandle was not used to create any profile.
      expect(
        (
          await one<{ n: number }>(
            "SELECT COUNT(*) n FROM social_profiles WHERE normalizedHandle IN ('solo_ig','only_watermark')"
          )
        ).n
      ).toBe(0);

      // Team workspace untouched; team owner's values went to their personal workspace only.
      expect(
        (
          await one<{ n: number }>(
            "SELECT COUNT(*) n FROM social_profiles WHERE workspaceId = 'w-team'"
          )
        ).n
      ).toBe(0);
      expect(
        (
          await one<{ n: number }>(
            "SELECT COUNT(*) n FROM personalization_items WHERE workspaceId = 'w-team-p'"
          )
        ).n
      ).toBe(3);

      // Newer confirmed audience kept; only missing kinds filled.
      const newer = (
        await run(
          "SELECT id, kind, payload FROM personalization_items WHERE socialProfileId = 'p-newer' ORDER BY kind"
        )
      )[0] as Array<{ id: string; kind: string; payload: unknown }>;
      expect(newer.map(r => r.kind).sort()).toEqual([
        "audience",
        "brand_description",
        "niche",
      ]);
      expect(newer.find(r => r.kind === "audience")?.id).toBe("i-newer");

      // Ambiguous users untouched.
      expect(
        (
          await one<{ n: number }>(
            "SELECT COUNT(*) n FROM personalization_items WHERE workspaceId = 'w-two'"
          )
        ).n
      ).toBe(0);
      expect(first.ambiguous.map(a => [a.userId, a.outcome])).toEqual([
        [4, "no_personal_workspace"],
        [6, "multiple_profiles_in_workspace"],
      ]);

      // Existing customer tables unchanged.
      expect(await checksums()).toBe(before);

      // Second run: nothing new.
      const totals = async () =>
        JSON.stringify([
          (await one<{ n: number }>("SELECT COUNT(*) n FROM social_profiles"))
            .n,
          (
            await one<{ n: number }>(
              "SELECT COUNT(*) n FROM personalization_items"
            )
          ).n,
        ]);
      const afterFirst = await totals();
      const second = await runLegacyBackfill(db, {
        execute: true,
        batchSize: 2,
      });
      expect(second.inserted).toEqual({ profiles: 0, items: 0 });
      expect(second.counts.planned).toBe(0);
      expect(second.counts.already_backfilled).toBe(3);
      expect(await totals()).toBe(afterFirst);
    });
  }
);
