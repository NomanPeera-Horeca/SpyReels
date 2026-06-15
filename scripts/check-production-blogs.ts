import { config } from "dotenv";
import { resolve } from "path";
import mysql from "mysql2/promise";

const PRODUCTION_ENV_FILE = ".env.had-rotated-creds";
const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";

config({
  path: resolve(process.cwd(), PRODUCTION_ENV_FILE),
  override: true,
});

type BlogRow = {
  slug: string;
  title: string;
  status: string;
  publishedAt: Date | string | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      `DATABASE_URL is not set after loading ${PRODUCTION_ENV_FILE}.`
    );
    process.exit(1);
  }

  if (!url.includes(PRODUCTION_HOST)) {
    console.error(
      `Refusing to run: DATABASE_URL must use production host ${PRODUCTION_HOST}.`
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT slug, title, status, publishedAt FROM blog_posts ORDER BY publishedAt DESC"
    );

    const table: BlogRow[] = rows.map((row) => ({
      slug: String(row.slug),
      title: String(row.title),
      status: String(row.status),
      publishedAt: row.publishedAt ?? null,
    }));

    console.log(`Production DB (${PRODUCTION_HOST}) — blog_posts\n`);
    console.table(table);
    console.log(`Total rows: ${table.length}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
