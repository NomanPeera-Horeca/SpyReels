/** Pilot tables check (read-only, information_schema + row counts). */
import mysql from "mysql2/promise";
const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const [tables] = (await conn.query(`
  SELECT TABLE_NAME AS t, (SELECT COUNT(*) FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS cols
  FROM information_schema.TABLES t WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'viral_discovery_pilot%' ORDER BY TABLE_NAME`)) as unknown as [Array<Record<string, unknown>>];
console.log(`PILOT_TABLES ${tables.length}`);
for (const r of tables) {
  const [n] = (await conn.query(`SELECT COUNT(*) AS n FROM \`${r.t}\``)) as unknown as [Array<{ n: number }>];
  console.log(`PT ${r.t} | columns ${r.cols} | rows ${n[0].n}`);
}
const [cols] = (await conn.query(`SELECT COLUMN_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viral_discovery_pilots' ORDER BY ORDINAL_POSITION`)) as unknown as [Array<Record<string, unknown>>];
console.log(`PILOTS_COLUMNS ${cols.map(c => `${c.COLUMN_NAME}=${c.COLUMN_DEFAULT ?? "∅"}`).join(", ")}`);
await conn.end();
