import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import { blogPosts } from "../drizzle/schema";

dotenv.config();

function wordCount(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in environment (.env).");
    process.exit(1);
  }

  const db = drizzle(url);
  const rows = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      status: blogPosts.status,
      content: blogPosts.content,
    })
    .from(blogPosts);

  const table = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    wordCount: wordCount(r.content),
  }));

  console.table(table);
  console.log(`Total rows: ${table.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
