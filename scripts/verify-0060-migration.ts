import mysql from "mysql2/promise";

const EXPECTED_COLUMNS = [
  "id",
  "userId",
  "workspaceId",
  "scrapeJobId",
  "status",
  "currentStep",
  "progressPercent",
  "stepDone",
  "stepTotal",
  "progressLabel",
  "fileR2Key",
  "filename",
  "fileSizeBytes",
  "reelCountAtExport",
  "errorMessage",
  "expiresAt",
  "completedAt",
  "createdAt",
  "updatedAt",
] as const;

const EXPECTED_INDEXES = [
  "PRIMARY",
  "idx_export_jobs_scrape_job",
  "idx_export_jobs_workspace",
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("NO_DATABASE_URL");
    process.exit(1);
  }

  const hostMatch = url.match(/@([^:/]+)/);
  console.log("Checking host:", hostMatch?.[1] ?? "unknown");

  const conn = await mysql.createConnection(url);
  let allOk = true;

  const [tables] = await conn.query<{ TABLE_NAME: string }[]>(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'export_jobs'`
  );

  if (tables.length === 0) {
    console.log("\nexport_jobs: MISSING TABLE");
    await conn.end();
    process.exit(1);
  }

  console.log("\nexport_jobs: table exists");

  const [columns] = await conn.query<
    { COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLLATION_NAME: string | null }[]
  >(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'export_jobs'
     ORDER BY ORDINAL_POSITION`
  );

  console.log("\nColumns:");
  for (const col of EXPECTED_COLUMNS) {
    const found = columns.find((r) => r.COLUMN_NAME === col);
    if (found) {
      const coll = found.COLLATION_NAME ? ` collation=${found.COLLATION_NAME}` : "";
      console.log(
        `  OK ${col} - ${found.COLUMN_TYPE} nullable=${found.IS_NULLABLE}${coll}`
      );
    } else {
      console.log(`  MISSING ${col}`);
      allOk = false;
    }
  }

  const workspaceCol = columns.find((r) => r.COLUMN_NAME === "workspaceId");
  if (workspaceCol?.COLLATION_NAME !== "utf8mb4_0900_ai_ci") {
    console.log(
      `  FAIL workspaceId collation=${workspaceCol?.COLLATION_NAME ?? "null"} (expected utf8mb4_0900_ai_ci)`
    );
    allOk = false;
  }

  const [indexes] = await conn.query<{ INDEX_NAME: string; NON_UNIQUE: number }[]>(
    `SELECT INDEX_NAME, NON_UNIQUE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'export_jobs'
     GROUP BY INDEX_NAME, NON_UNIQUE`
  );

  console.log("\nIndexes:");
  for (const idx of EXPECTED_INDEXES) {
    const found = indexes.find((r) => r.INDEX_NAME === idx);
    if (found) {
      console.log(`  OK ${idx}`);
    } else {
      console.log(`  MISSING ${idx}`);
      allOk = false;
    }
  }

  const [fks] = await conn.query<
    { CONSTRAINT_NAME: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string }[]
  >(
    `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'export_jobs'
       AND REFERENCED_TABLE_NAME IS NOT NULL`
  );

  console.log("\nForeign keys:");
  const workspaceFk = fks.find((r) => r.CONSTRAINT_NAME.includes("workspace"));
  if (
    workspaceFk &&
    workspaceFk.REFERENCED_TABLE_NAME === "workspaces" &&
    workspaceFk.REFERENCED_COLUMN_NAME === "id"
  ) {
    console.log(`  OK ${workspaceFk.CONSTRAINT_NAME} -> workspaces(id)`);
  } else {
    console.log("  MISSING or wrong workspace FK");
    allOk = false;
  }

  await conn.end();
  console.log(allOk ? "\nMigration verify: PASS" : "\nMigration verify: FAIL");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
