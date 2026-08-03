/**
 * Refreshes script-generator + find-viral guides for Ubersuggest competitor gaps.
 * Run: pnpm exec tsx scripts/refresh-script-gen-and-find-viral-blogs.ts
 */
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { blogPosts } from "../drizzle/schema";
import { getDb, updateBlogPost } from "../server/db";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadArticle(file: string): string {
  return readFileSync(join(__dirname, "..", "seed", "articles", file), "utf8").trim();
}

const UPDATES = [
  {
    slug: "guide-instagram-reels-script-generator",
    title: "Instagram Reels Script Generator: How to Use One Without Sounding Fake",
    sourceKeyword: "instagram reels script generator",
    metaTitle: "Instagram Reels Script Generator (2026) | SpyReels",
    metaDescription:
      "Use an Instagram Reels script generator the right way: brief inputs, hook-body-CTA structure, edit passes, and a SpyReels research-to-script workflow.",
    articleFile: "26-guide-instagram-reels-script-generator.md",
  },
  {
    slug: "guide-find-viral-reels-your-niche",
    title: "How to Find Viral Reels in Your Niche (2026 Method)",
    sourceKeyword: "how to find viral reels",
    metaTitle: "How to Find Viral Reels (2026 Guide) | SpyReels",
    metaDescription:
      "Stop scrolling for content ideas. Find real viral Reels in your niche within seconds, then remake them in your own voice. Your shortcut to going viral.",
    articleFile: "05-guide-find-viral-reels-your-niche.md",
  },
] as const;

async function main(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const row of UPDATES) {
    const existing = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, row.slug))
      .limit(1);
    if (!existing[0]) {
      console.warn(`Skip missing slug=${row.slug}`);
      continue;
    }
    await updateBlogPost(existing[0].id, {
      title: row.title,
      content: loadArticle(row.articleFile),
      sourceKeyword: row.sourceKeyword,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      updatedAt: new Date(),
    });
    console.log(`Updated id=${existing[0].id} slug=${row.slug}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
