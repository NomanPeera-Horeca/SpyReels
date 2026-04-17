import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import { inArray } from "drizzle-orm";
import { blogPosts } from "../drizzle/schema";

dotenv.config();

const IDS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in environment (.env).");
    process.exit(1);
  }

  const db = drizzle(url);
  const result = await db.delete(blogPosts).where(inArray(blogPosts.id, [...IDS]));

  const affected =
    result && typeof result === "object" && "affectedRows" in result
      ? Number((result as { affectedRows: number }).affectedRows)
      : Array.isArray(result) && result[0] && typeof result[0] === "object" && "affectedRows" in result[0]
        ? Number((result[0] as { affectedRows: number }).affectedRows)
        : null;

  if (affected !== null) {
    console.log(`Deleted ${affected} row(s) from blog_posts where id IN (${IDS.join(", ")}).`);
  } else {
    console.log("Delete completed. Raw driver result:", result);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
