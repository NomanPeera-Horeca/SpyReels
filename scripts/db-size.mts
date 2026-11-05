/** Database size by table (read-only, information_schema only). */
import mysql from "mysql2/promise";
const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const [rows] = (await conn.query(`
  SELECT TABLE_NAME AS t, TABLE_ROWS AS n, ROUND(DATA_LENGTH/1048576,1) AS dataMb, ROUND(INDEX_LENGTH/1048576,1) AS indexMb, ROUND(DATA_FREE/1048576,1) AS freeMb
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY DATA_LENGTH + INDEX_LENGTH DESC LIMIT 25`)) as unknown as [Array<Record<string, unknown>>];
const [tot] = (await conn.query(`SELECT ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1048576,1) AS mb, COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`)) as unknown as [Array<Record<string, unknown>>];
console.log(`DBSIZE total ${tot[0].mb} MB in ${tot[0].tables} tables`);
for (const r of rows) console.log(`DBT ${r.t} | rows~${r.n} | data ${r.dataMb} MB | index ${r.indexMb} MB | free ${r.freeMb} MB`);
try {
  const [bl] = (await conn.query(`SHOW BINARY LOGS`)) as unknown as [Array<Record<string, unknown>>];
  const mb = bl.reduce((a, r) => a + Number(r.File_size), 0) / 1048576;
  console.log(`BINLOGS ${bl.length} files ${mb.toFixed(1)} MB`);
} catch (e) {
  console.log(`BINLOGS not readable: ${e instanceof Error ? e.message : e}`);
}
try {
  const [v] = (await conn.query(`SHOW VARIABLES WHERE Variable_name IN ('log_bin','binlog_expire_logs_seconds','innodb_redo_log_capacity')`)) as unknown as [Array<Record<string, unknown>>];
  for (const r of v) console.log(`VAR ${r.Variable_name}=${r.Value}`);
} catch {}
await conn.end();
