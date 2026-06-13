import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("NO_DATABASE_URL");
    process.exit(1);
  }

  const hostMatch = url.match(/@([^:/]+)/);
  console.log("Checking host:", hostMatch?.[1] ?? "unknown");

  const conn = await mysql.createConnection(url);
  const tables = ["reels", "featured_reels"];
  const expected = ["productionFormat", "thumbnailText"];

  let allOk = true;

  for (const table of tables) {
    const [rows] = await conn.query<
      { COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string }[]
    >(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME IN (?, ?)`,
      [table, ...expected]
    );

    console.log(`\n${table}:`);
    for (const col of expected) {
      const found = rows.find((r) => r.COLUMN_NAME === col);
      if (found) {
        console.log(
          `  OK ${col} - ${found.COLUMN_TYPE} nullable=${found.IS_NULLABLE}`
        );
      } else {
        console.log(`  MISSING ${col}`);
        allOk = false;
      }
    }
  }

  await conn.end();
  console.log(allOk ? "\nMigration verify: PASS" : "\nMigration verify: FAIL");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
