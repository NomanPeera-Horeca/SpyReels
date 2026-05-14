import * as dotenv from "dotenv";
import { blogPosts, blogVersions } from "../drizzle/schema";
import { getDb } from "../server/db";

dotenv.config();

async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL missing or database unreachable.");
  }

  const posts = await db.select().from(blogPosts);
  let inserted = 0;
  for (const p of posts) {
    await db.insert(blogVersions).values({
      blogPostId: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt ?? null,
      content: p.content,
      metaTitle: p.metaTitle ?? null,
      metaDescription: p.metaDescription ?? null,
    });
    inserted += 1;
  }
  console.log(`Inserted ${inserted} snapshot row(s) into blog_versions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
