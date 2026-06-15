/**
 * Inserts 5 research / data study blog posts (420 Reel analysis cluster).
 * Run: pnpm exec tsx scripts/insert-five-research-blogs-2026.ts
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
    title: "Instagram Reels Content Analysis: 420 Top Reels Study (2026)",
    slug: "guide-instagram-reels-content-analysis-2026",
    sourceKeyword: "instagram reels content analysis",
    excerpt:
      "We analyzed 420 top Instagram Reels from 14 creators by engagement rate. See hook patterns, formats, ER vs views, and how to run the same content analysis.",
    metaTitle: "Instagram Reels Content Analysis (2026 Study)",
    metaDescription:
      "Instagram Reels content analysis on 420 top performers from 14 creators. Hook patterns, ER vs views, formats, and a repeatable research workflow for 2026.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80",
    tags: [
      "instagram reels content analysis",
      "reverse engineer instagram reels",
      "instagram reels research",
    ],
    articleFile: "16-guide-instagram-reels-content-analysis-2026.md",
  },
  {
    title: "Alex Hormozi Instagram Reels Analysis: Hooks, Formats, and ER Data",
    slug: "guide-alex-hormozi-instagram-reels-analysis",
    sourceKeyword: "alex hormozi instagram reels",
    excerpt:
      "Data-backed Alex Hormozi Instagram Reels analysis: contrarian hooks, text on screen vs talking head, and why 1M views can still mean low engagement rate.",
    metaTitle: "Alex Hormozi Instagram Reels Analysis (2026)",
    metaDescription:
      "Alex Hormozi Instagram Reels analysis from 60 ER-ranked exports. Hook patterns, formats, Leila vs Alex ER, and how to remake structure ethically.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1200&q=80",
    tags: [
      "alex hormozi instagram reels",
      "hormozi reels",
      "instagram reels analysis",
    ],
    articleFile: "17-guide-alex-hormozi-instagram-reels-analysis.md",
  },
  {
    title: "Instagram Reels Engagement Rate vs Views: When 1M Views Is a Flop",
    slug: "guide-instagram-reels-engagement-rate",
    sourceKeyword: "instagram reels engagement rate",
    excerpt:
      "Learn Instagram Reels engagement rate: formula, why ER beats views for competitor research, and real data from Hormozi, ayushman.pandita, and 12 more accounts.",
    metaTitle: "Instagram Reels Engagement Rate Guide (2026)",
    metaDescription:
      "Instagram Reels engagement rate explained with formula and 420-Reel data. Why ER beats views when analyzing competitors and how to sort winners correctly.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
    tags: [
      "instagram reels engagement rate",
      "reels analytics",
      "instagram reels metrics",
    ],
    articleFile: "18-guide-instagram-reels-engagement-rate.md",
  },
  {
    title: "Instagram Reels Hook Patterns That Won (Data From 420 Top Reels)",
    slug: "guide-instagram-reels-hook-patterns-data",
    sourceKeyword: "instagram reels hook patterns",
    excerpt:
      "Instagram Reels hook patterns from 420 top performers: question hooks averaged 5.67% ER, contrarian and direct promise dominated volume, listicles lagged.",
    metaTitle: "Instagram Reels Hook Patterns (2026 Data)",
    metaDescription:
      "Instagram Reels hook patterns ranked by data from 420 top Reels. Question, stat, contrarian, and direct promise hooks with ER averages and when to use each.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&q=80",
    tags: [
      "instagram reels hook patterns",
      "viral hooks instagram reels",
      "reel hooks",
    ],
    articleFile: "19-guide-instagram-reels-hook-patterns-data.md",
  },
  {
    title: "How to Transcribe and Analyze Competitor Instagram Reels in Excel",
    slug: "guide-transcribe-instagram-reels-analysis",
    sourceKeyword: "transcribe instagram reels",
    excerpt:
      "Transcribe Instagram Reels for competitor research: manual steps, Excel export columns, hook text vs thumbnail text, and automated spy + classify workflows.",
    metaTitle: "Transcribe Instagram Reels for Analysis (2026)",
    metaDescription:
      "How to transcribe Instagram Reels and analyze competitors in Excel. Hook text, transcripts, classification columns, and ER-ranked export workflow.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80",
    tags: [
      "transcribe instagram reels",
      "instagram reels transcript",
      "competitor analysis",
    ],
    articleFile: "20-guide-transcribe-instagram-reels-analysis.md",
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
