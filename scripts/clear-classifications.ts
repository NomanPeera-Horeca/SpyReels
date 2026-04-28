import * as dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in environment (.env).");
    process.exit(1);
  }
  let table: "reels" | "featured_reels" | "both" = "both";
  let whereFrag = "";
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--table=")) table = a.slice("--table=".length) as typeof table;
    if (a.startsWith("--where=")) whereFrag = a.slice("--where=".length).trim();
  }
  const w = whereFrag ? ` AND (${whereFrag})` : "";
  const clear = "`classifiedAt`=NULL,`contentType`=NULL,`remakeabilityScore`=NULL,`suggestedAction`=NULL,`classificationReason`=NULL";
  const conn = await mysql.createPool(url);
  if (table === "reels" || table === "both") {
    await conn.query(`UPDATE reels SET ${clear} WHERE 1=1${w}`);
    console.log("cleared reels");
  }
  if (table === "featured_reels" || table === "both") {
    await conn.query(`UPDATE featured_reels SET ${clear} WHERE 1=1${w}`);
    console.log("cleared featured_reels");
  }
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
