/**
 * Inserts 5 competitor-intent blog posts (Meedro / ViralFindr alternatives, reviews, spy tool).
 * Run: pnpm exec tsx scripts/insert-five-competitor-blogs-2026.ts
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

function loadArticle(file: string): string {
  return readFileSync(join(__dirname, "..", "seed", "articles", file), "utf8").trim();
}

const POSTS = [
  {
    title: "Best Meedro Alternative for Instagram Reels Creators (2026)",
    slug: "guide-meedro-alternative",
    sourceKeyword: "meedro alternative",
    excerpt:
      "Looking for a Meedro alternative? Compare SpyReels vs Meedro on pricing, Reels workflow, transcription, and who should switch in 2026.",
    metaTitle: "Best Meedro Alternative 2026 | SpyReels",
    metaDescription:
      "Best Meedro alternative for Instagram Reels in 2026. Compare SpyReels on pricing, transcription, AI scripts, and who should switch from Meedro today.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80",
    tags: ["meedro alternative", "comparison", "instagram reels tool"],
    articleFile: "11-guide-meedro-alternative.md",
  },
  {
    title: "Best ViralFindr Alternative for Instagram Reels (2026 Guide)",
    slug: "guide-viralfindr-alternative",
    sourceKeyword: "viralfindr alternative",
    excerpt:
      "Outgrowing ViralFindr? See the best ViralFindr alternatives for transcription, hook breakdown, and AI scripts, with an honest SpyReels comparison.",
    metaTitle: "Best ViralFindr Alternative 2026 | SpyReels",
    metaDescription:
      "Best ViralFindr alternative in 2026 for creators who need transcription, hook breakdown, and AI scripts. Honest SpyReels comparison and switch steps.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
    tags: ["viralfindr alternative", "comparison", "instagram reels tool"],
    articleFile: "12-guide-viralfindr-alternative.md",
  },
  {
    title: "Meedro Review 2026: Pricing, Pros, Cons, and Better Options",
    slug: "meedro-review-2026",
    sourceKeyword: "meedro review",
    excerpt:
      "Honest Meedro review for 2026: strengths, credit pricing, who it fits, and when SpyReels is a better pick for Instagram Reels creators.",
    metaTitle: "Meedro Review 2026: Honest Pros and Cons",
    metaDescription:
      "Meedro review 2026: honest pros, cons, credit pricing, and who it fits. See when SpyReels is the better pick for Instagram Reels creators. Compare now.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80",
    tags: ["meedro review", "comparison", "instagram reels tool"],
    articleFile: "13-meedro-review-2026.md",
  },
  {
    title: "ViralFindr Review 2026: Is It Worth It? (And What to Use Instead)",
    slug: "viralfindr-review-2026",
    sourceKeyword: "viralfindr review",
    excerpt:
      "ViralFindr review 2026 with honest pros, cons, pricing, and when to switch to SpyReels for transcription, hooks, and AI Reels scripts.",
    metaTitle: "ViralFindr Review 2026: Worth It?",
    metaDescription:
      "ViralFindr review 2026: worth it or not? Features, pricing, common complaints, and the best alternative when you need scripts, not only downloads.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&q=80",
    tags: ["viralfindr review", "comparison", "instagram reels tool"],
    articleFile: "14-viralfindr-review-2026.md",
  },
  {
    title: "Best Instagram Reels Spy Tool in 2026 (SpyReels vs Meedro vs ViralFindr)",
    slug: "guide-instagram-reels-spy-tool",
    sourceKeyword: "instagram reels spy tool",
    excerpt:
      "Compare the best Instagram Reels spy tools in 2026: SpyReels, Meedro, and ViralFindr. Features, ethics, and which fits script-first creators.",
    metaTitle: "Best Instagram Reels Spy Tool 2026",
    metaDescription:
      "Best Instagram Reels spy tool in 2026 compared: SpyReels vs Meedro vs ViralFindr. See transcription, hooks, AI scripts, pricing, and who each fits.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1200&q=80",
    tags: ["instagram reels spy tool", "competitor research", "instagram reels"],
    articleFile: "15-guide-instagram-reels-spy-tool.md",
  },
] as const;

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

  const publishedAt = new Date();
  let inserted = 0;
  let skipped = 0;

  for (const post of POSTS) {
    const existing = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, post.slug))
      .limit(1);
    if (existing[0]) {
      console.warn(`Skip slug="${post.slug}" (id=${existing[0].id} already exists)`);
      skipped += 1;
      continue;
    }

    const id = await createBlogPost({
      authorId,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: loadArticle(post.articleFile),
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      coverImageUrl: post.coverImageUrl,
      ogImageUrl: post.coverImageUrl,
      tags: [...post.tags],
      sourceKeyword: post.sourceKeyword,
      status: "published",
      publishedAt,
      noIndex: false,
    });

    console.log(`Inserted id=${id} slug=${post.slug} keyword=${post.sourceKeyword}`);
    inserted += 1;
  }

  console.log(`Done. inserted=${inserted} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
