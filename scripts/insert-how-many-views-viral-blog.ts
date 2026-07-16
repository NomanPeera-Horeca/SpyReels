/**
 * Inserts the "how many views is considered viral on Instagram" guide.
 * Run: pnpm exec tsx scripts/insert-how-many-views-viral-blog.ts
 */
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq } from "drizzle-orm";
import { blogPosts, users } from "../drizzle/schema";
import { createBlogPost, getDb } from "../server/db";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const POST = {
  title: "How Many Views Is Considered Viral on Instagram (2026 Guide)",
  slug: "guide-how-many-views-viral-instagram",
  sourceKeyword: "how many views is considered viral on instagram",
  excerpt:
    "How many views is considered viral on Instagram by follower size. Practical thresholds, why ER beats raw views, and how to spot true outliers on competitor accounts.",
  metaTitle: "How Many Views Is Viral on Instagram (2026)",
  metaDescription:
    "How many views is considered viral on Instagram in 2026? See view ranges by follower size, why median beats vanity numbers, and how to research true outliers.",
  coverImageUrl:
    "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=1200&q=80",
  tags: [
    "how many views is considered viral on instagram",
    "how many views for viral",
    "instagram reels views",
  ],
  articleFile: "25-guide-how-many-views-viral-instagram.md",
} as const;

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Check your .env file.");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available. Check DATABASE_URL.");
  }

  const firstUser = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.id))
    .limit(1);
  const authorId = firstUser[0]?.id;
  if (!authorId) {
    throw new Error("No users found. Create a user first.");
  }

  const existing = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(eq(blogPosts.slug, POST.slug))
    .limit(1);
  if (existing[0]) {
    console.warn(`Skip slug="${POST.slug}" (id=${existing[0].id} already exists)`);
    process.exit(0);
  }

  const content = readFileSync(
    join(__dirname, "..", "seed", "articles", POST.articleFile),
    "utf8"
  ).trim();

  const id = await createBlogPost({
    authorId,
    title: POST.title,
    slug: POST.slug,
    content,
    excerpt: POST.excerpt,
    coverImageUrl: POST.coverImageUrl,
    ogImageUrl: POST.coverImageUrl,
    metaTitle: POST.metaTitle,
    metaDescription: POST.metaDescription,
    sourceKeyword: POST.sourceKeyword,
    tags: [...POST.tags],
    status: "published",
    publishedAt: new Date(),
    noIndex: false,
  });

  console.log(`Inserted id=${id} slug=${POST.slug}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
