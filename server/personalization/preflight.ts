/**
 * Read-only production preflight for the personalization migration.
 *
 * Answers the four gate questions with SELECTs only:
 * 1. Which repo migrations production has applied (matched by sha256 of the
 *    file bytes, exactly how docs/deploy-notes/manual-migrations.md records
 *    them in __drizzle_migrations), and whether anything unknown was applied
 *    after the latest known one.
 * 2. MySQL version is 8.0.16+ (CHECK constraints enforced).
 * 3. users / workspaces / workspace_members match what the draft's foreign
 *    keys need (collation, column types, the member unique key).
 * 4. None of the seven new tables exist yet.
 *
 * Safety: runs inside START TRANSACTION READ ONLY and refuses to send any
 * statement that is not a read. It never prints connection details.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const PERSONALIZATION_TABLES = [
  "social_profiles",
  "workspace_member_active_profiles",
  "user_onboarding_answers",
  "profile_analysis_runs",
  "profile_analysis_stages",
  "personalization_items",
  "personalization_progress",
] as const;

export const REQUIRED_COLLATION = "utf8mb4_0900_ai_ci";
export const MIN_MYSQL = [8, 0, 16] as const;

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
};

export type RepoMigration = { file: string; prefix: string; sha256: string };

export type PreflightCheck = { name: string; pass: boolean; detail: string };
export type PreflightReport = {
  pass: boolean;
  checks: PreflightCheck[];
  latestAppliedRepoMigration: string | null;
  unknownAppliedHashes: number;
};

/** sha256 of every drizzle/*.sql file, the same way production records them. */
export function loadRepoMigrations(drizzleDir: string): RepoMigration[] {
  return readdirSync(drizzleDir)
    .filter(f => /^\d{4}[a-z]?_.*\.sql$/.test(f))
    .sort()
    .map(file => ({
      file,
      prefix: file.match(/^(\d{4}[a-z]?)_/)![1],
      sha256: createHash("sha256")
        .update(readFileSync(path.join(drizzleDir, file)))
        .digest("hex"),
    }));
}

const READ_ONLY = /^\s*(SELECT|SHOW|START TRANSACTION READ ONLY|ROLLBACK)\b/i;

function guarded(conn: Queryable): Queryable {
  return {
    query: (sql, params) => {
      if (!READ_ONLY.test(sql)) {
        throw new Error(
          `Preflight refused a non-read statement: ${sql.slice(0, 40)}`
        );
      }
      return conn.query(sql, params);
    },
  };
}

async function rows<T>(
  conn: Queryable,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const [r] = await conn.query(sql, params);
  return r as T[];
}

export function parseMysqlVersion(v: string): {
  ok: boolean;
  mariadb: boolean;
  parts: number[];
} {
  const mariadb = /mariadb/i.test(v);
  const parts = (v.match(/^(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
  if (parts.length !== 3 || mariadb) return { ok: false, mariadb, parts };
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_MYSQL[i]) return { ok: true, mariadb, parts };
    if (parts[i] < MIN_MYSQL[i]) return { ok: false, mariadb, parts };
  }
  return { ok: true, mariadb, parts };
}

export async function runPersonalizationPreflight(
  rawConn: Queryable,
  opts: { repoMigrations: RepoMigration[]; expectedLatestPrefix: string }
): Promise<PreflightReport> {
  const conn = guarded(rawConn);
  const checks: PreflightCheck[] = [];
  let latestAppliedRepoMigration: string | null = null;
  let unknownAppliedHashes = 0;

  await conn.query("START TRANSACTION READ ONLY");
  try {
    // 1. Applied migrations
    const applied = await rows<{ hash: string; created_at: number | string }>(
      conn,
      "SELECT `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `created_at` ASC"
    );
    const byHash = new Map(opts.repoMigrations.map(m => [m.sha256, m]));
    const matched = applied.map(a => ({
      ...a,
      repo: byHash.get(a.hash) ?? null,
    }));
    const known = matched.filter(m => m.repo);
    const latest = known
      .sort((a, b) => a.repo!.prefix.localeCompare(b.repo!.prefix))
      .at(-1);
    latestAppliedRepoMigration = latest?.repo?.file ?? null;
    const latestAt = latest ? Number(latest.created_at) : 0;
    const unknownAfter = matched.filter(
      m => !m.repo && Number(m.created_at) > latestAt
    );
    unknownAppliedHashes = matched.filter(m => !m.repo).length;
    const newerInRepo = opts.repoMigrations.filter(
      m => m.prefix > opts.expectedLatestPrefix
    );
    checks.push({
      name: "latest_applied_migration",
      pass:
        latest?.repo?.prefix === opts.expectedLatestPrefix &&
        unknownAfter.length === 0 &&
        newerInRepo.length === 0,
      detail:
        `latest applied repo migration: ${latestAppliedRepoMigration ?? "none matched"}; ` +
        `expected ${opts.expectedLatestPrefix}; ` +
        `unknown hashes applied after it: ${unknownAfter.length}; ` +
        `unknown hashes total: ${unknownAppliedHashes}; ` +
        `repo files newer than expected: ${newerInRepo.map(m => m.file).join(", ") || "none"}`,
    });

    // 2. MySQL version
    const [{ v }] = await rows<{ v: string }>(conn, "SELECT VERSION() AS v");
    const parsed = parseMysqlVersion(v);
    checks.push({
      name: "mysql_version",
      pass: parsed.ok,
      detail: `${v}${parsed.mariadb ? " (MariaDB is not supported)" : ""}; need ${MIN_MYSQL.join(".")}+`,
    });

    // 3. Existing tables the draft references
    const tables = await rows<{ t: string; c: string }>(
      conn,
      "SELECT TABLE_NAME AS t, TABLE_COLLATION AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','workspaces','workspace_members')"
    );
    const cols = await rows<{
      t: string;
      col: string;
      type: string;
      c: string | null;
    }>(
      conn,
      "SELECT TABLE_NAME AS t, COLUMN_NAME AS col, COLUMN_TYPE AS type, COLLATION_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'users' AND COLUMN_NAME = 'id') OR (TABLE_NAME = 'workspaces' AND COLUMN_NAME = 'id') OR (TABLE_NAME = 'workspace_members' AND COLUMN_NAME IN ('workspaceId','userId')))"
    );
    const memberKey = await rows<{ cols: string }>(
      conn,
      "SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspace_members' AND NON_UNIQUE = 0 GROUP BY INDEX_NAME"
    );
    const col = (t: string, c: string) =>
      cols.find(x => x.t === t && x.col === c);
    const problems: string[] = [];
    for (const t of ["users", "workspaces", "workspace_members"]) {
      const found = tables.find(x => x.t === t);
      if (!found) problems.push(`${t} missing`);
      else if (found.c !== REQUIRED_COLLATION)
        problems.push(`${t} collation ${found.c}`);
    }
    if (!/^int\b/.test(col("users", "id")?.type ?? ""))
      problems.push(`users.id is ${col("users", "id")?.type ?? "missing"}`);
    if (!/^int\b/.test(col("workspace_members", "userId")?.type ?? ""))
      problems.push("workspace_members.userId not int");
    for (const [t, c] of [
      ["workspaces", "id"],
      ["workspace_members", "workspaceId"],
    ] as const) {
      const x = col(t, c);
      if (x?.type !== "varchar(36)")
        problems.push(`${t}.${c} is ${x?.type ?? "missing"}`);
      if (x?.c !== REQUIRED_COLLATION)
        problems.push(`${t}.${c} collation ${x?.c ?? "missing"}`);
    }
    if (!memberKey.some(k => k.cols === "workspaceId,userId")) {
      problems.push("workspace_members has no UNIQUE (workspaceId, userId)");
    }
    checks.push({
      name: "existing_tables_compatible",
      pass: problems.length === 0,
      detail: problems.length
        ? problems.join("; ")
        : `all ${REQUIRED_COLLATION}, key types match`,
    });

    // 4. New tables must not exist
    const existing = await rows<{ t: string }>(
      conn,
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${PERSONALIZATION_TABLES.map(() => "?").join(",")})`,
      [...PERSONALIZATION_TABLES]
    );
    checks.push({
      name: "new_tables_absent",
      pass: existing.length === 0,
      detail: existing.length
        ? `already exist: ${existing.map(e => e.t).join(", ")}`
        : "none of the 7 tables exist",
    });
  } finally {
    await conn.query("ROLLBACK");
  }

  return {
    pass: checks.every(c => c.pass),
    checks,
    latestAppliedRepoMigration,
    unknownAppliedHashes,
  };
}
