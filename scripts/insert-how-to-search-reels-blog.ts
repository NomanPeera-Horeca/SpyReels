/**
 * Inserts the "how to search Reels on Instagram" guide.
 * Run: pnpm exec tsx scripts/insert-how-to-search-reels-blog.ts
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
  title: "How to Search Reels on Instagram (2026 Guide)",
  slug: "guide-how-to-search-reels-on-instagram",
  sourceKeyword: "how to search reels on instagram",
  excerpt:
    "How to search Reels on Instagram with Search, the Reels tab, audio, and tags. Plus when to use a viral reel finder instead of scrolling Explore.",
  metaTitle: "How to Search Reels on Instagram (2026)",
  metaDescription:
    "How to search Reels on Instagram and IG videos step by step. Use Search, the Reels tab, audio, and tags, then rank winners with a viral reel finder today.",
  coverImageUrl:
    "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&q=80",
  tags: [
    "how to search reels on instagram",
    "how to search reels on ig",
    "search instagram videos",
    "instagram video search",
    "search reels",
    "how to find videos on instagram",
    "search viral",
    "viral posts",
    "how to find trending reels on instagram",
  ],
  articleFile: "27-guide-how-to-search-reels-on-instagram.md",
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
