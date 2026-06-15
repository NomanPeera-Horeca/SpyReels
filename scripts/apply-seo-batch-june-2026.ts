/**
 * June 2026 SEO batch: spy meta, article refreshes, vs link append, 3 new posts.
 *
 * Usage:
 *   pnpm exec tsx scripts/apply-seo-batch-june-2026.ts --dry-run
 *   pnpm exec tsx scripts/apply-seo-batch-june-2026.ts
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { asc, eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { blogPosts, users } from "../drizzle/schema";
import { createBlogPost, getDb, updateBlogPost } from "../server/db";
import { BLOG_SLUG_REDIRECTS } from "../shared/blogRedirects";

const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const DRY_RUN = process.argv.includes("--dry-run");
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadArticle(file: string): string {
  return readFileSync(join(__dirname, "..", "seed", "articles", file), "utf8").trim();
}

const CONTENT_REFRESH: Array<{ slug: string; articleFile: string }> = [
  { slug: "guide-spy-on-competitor-instagram-reels", articleFile: "03-guide-spy-on-competitor-instagram-reels.md" },
  { slug: "guide-meedro-alternative", articleFile: "11-guide-meedro-alternative.md" },
  { slug: "guide-viralfindr-alternative", articleFile: "12-guide-viralfindr-alternative.md" },
  { slug: "meedro-review-2026", articleFile: "13-meedro-review-2026.md" },
  { slug: "viralfindr-review-2026", articleFile: "14-viralfindr-review-2026.md" },
  { slug: "guide-find-viral-reels-your-niche", articleFile: "05-guide-find-viral-reels-your-niche.md" },
  { slug: "guide-reverse-engineer-viral-reels", articleFile: "08-guide-reverse-engineer-viral-reels.md" },
];

const VS_LINK_APPEND: Record<string, string> = {
  "spyreels-vs-meedro": `\n\n## Related comparisons\n\nRead the other side of the matchup in [SpyReels vs ViralFindr](/blog/spyreels-vs-viralfindr). Explore the [viral reel finder](/features/viral-reel-finder) for ranked Reels research. [Try SpyReels free](https://spyreels.ai).\n`,
  "spyreels-vs-viralfindr": `\n\n## Related comparisons\n\nRead the other side of the matchup in [SpyReels vs Meedro](/blog/spyreels-vs-meedro). Explore the [viral reel finder](/features/viral-reel-finder) for ranked Reels research. [Try SpyReels free](https://spyreels.ai).\n`,
};

const NEW_POSTS = [
  {
    title: "How to Go Viral on Instagram Reels in 2026 (The Exact Formula)",
    slug: "guide-how-to-go-viral-on-instagram-reels-2026",
    sourceKeyword: "how to go viral on instagram reels",
    excerpt:
      "How to go viral on Instagram Reels in 2026: research winners, reverse-engineer hooks, and publish tests weekly. Step-by-step formula with SpyReels workflow.",
    metaTitle: "How to Go Viral on Instagram Reels in 2026 (Exact Formula)",
    metaDescription:
      "How to go viral on Instagram Reels in 2026 with a repeatable formula: spy competitors, transcribe hooks, test weekly, and scale what retains viewers.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1200&q=80",
    tags: ["how to go viral on instagram reels", "instagram reels strategy", "viral hooks"],
    articleFile: "21-guide-how-to-go-viral-on-instagram-reels-2026.md",
  },
  {
    title: "10 Instagram Reels Hook Templates That Actually Go Viral",
    slug: "guide-instagram-reels-hook-ideas-2026",
    sourceKeyword: "instagram reels hook ideas",
    excerpt:
      "Ten Instagram Reels hook templates with examples, when to use each, and how to adapt them for your niche. Plus a free hook generator link.",
    metaTitle: "10 Instagram Reels Hook Templates That Go Viral (2026)",
    metaDescription:
      "Instagram Reels hook ideas you can film today: 10 templates with examples, pattern notes, and links to our free viral hook generator.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80",
    tags: ["instagram reels hook ideas", "viral hooks", "reels templates"],
    articleFile: "22-guide-instagram-reels-hook-ideas-2026.md",
  },
  {
    title: "Instagram Reels Content Strategy for Small Accounts (Under 10K)",
    slug: "guide-instagram-reels-content-strategy-under-10k",
    sourceKeyword: "instagram reels content strategy",
    excerpt:
      "Instagram Reels content strategy for accounts under 10K: research cadence, hook tests, proof formats, and a weekly calendar that fits solo creators.",
    metaTitle: "Instagram Reels Content Strategy for Under 10K (2026)",
    metaDescription:
      "Instagram Reels content strategy for small accounts under 10K followers: weekly research, hook tests, proof formats, and a calendar you can keep.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
    tags: ["instagram reels content strategy", "under 10k followers", "content calendar"],
    articleFile: "23-guide-instagram-reels-content-strategy-under-10k.md",
  },
] as const;

function loadEnv(): void {
  config({ path: resolve(process.cwd(), ".env") });
  const rotated = resolve(process.cwd(), ".env.had-rotated-creds");
  if (existsSync(rotated)) {
    config({ path: rotated, override: true });
  }
}

function assertProductionUrl(url: string): void {
  if (!url.includes(PRODUCTION_HOST)) {
    throw new Error(`Refusing: DATABASE_URL must use ${PRODUCTION_HOST}`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  assertProductionUrl(databaseUrl);

  console.log(`SEO batch on production${DRY_RUN ? " [DRY RUN]" : ""}\n`);

  const conn = await mysql.createConnection(databaseUrl);

  try {
    const spyMeta = {
      metaTitle: "How to Spy on Competitor Instagram Reels (Step-by-Step 2026)",
      metaDescription:
        "Learn the exact method to analyze any competitor's Instagram Reels, find what's going viral in your niche, and reverse-engineer their formula. Free to try.",
    };
    if (DRY_RUN) {
      console.log("[meta] guide-spy-on-competitor-instagram-reels", spyMeta);
    } else {
      const [r] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET metaTitle = ?, metaDescription = ?, updatedAt = NOW() WHERE slug = ?`,
        [spyMeta.metaTitle, spyMeta.metaDescription, "guide-spy-on-competitor-instagram-reels"]
      );
      console.log(`[meta] guide-spy-on-competitor-instagram-reels rows=${r.affectedRows}`);
    }

    for (const [fromSlug, toSlug] of Object.entries(BLOG_SLUG_REDIRECTS)) {
      const canonicalUrl = `https://spyreels.ai/blog/${toSlug}`;
      if (DRY_RUN) {
        console.log(`[redirect-db] ${fromSlug} -> noindex canonical ${canonicalUrl}`);
        continue;
      }
      await conn.execute(
        `UPDATE blog_posts SET noIndex = 1, canonicalUrl = ?, updatedAt = NOW() WHERE slug = ?`,
        [canonicalUrl, fromSlug]
      );
    }

    for (const row of CONTENT_REFRESH) {
      const content = loadArticle(row.articleFile);
      if (DRY_RUN) {
        console.log(`[content] ${row.slug} from ${row.articleFile} (${content.length} chars)`);
        continue;
      }
      const [r] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET content = ?, updatedAt = NOW() WHERE slug = ?`,
        [content, row.slug]
      );
      console.log(`[content] ${row.slug} rows=${r.affectedRows}`);
    }

    for (const [slug, append] of Object.entries(VS_LINK_APPEND)) {
      if (DRY_RUN) {
        console.log(`[vs-append] ${slug}`);
        continue;
      }
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT content FROM blog_posts WHERE slug = ? LIMIT 1`,
        [slug]
      );
      const existing = String(rows[0]?.content ?? "");
      if (existing.includes("Related comparisons")) {
        console.log(`[vs-append] ${slug} skip (already appended)`);
        continue;
      }
      const [r] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET content = ?, updatedAt = NOW() WHERE slug = ?`,
        [existing + append, slug]
      );
      console.log(`[vs-append] ${slug} rows=${r.affectedRows}`);
    }
  } finally {
    await conn.end();
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Drizzle DB unavailable for inserts");
  }

  const firstUser = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
  const authorId = firstUser[0]?.id;
  if (!authorId) {
    throw new Error("No users found for authorId");
  }

  for (const post of NEW_POSTS) {
    const existing = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, post.slug))
      .limit(1);

    if (existing[0]) {
      if (DRY_RUN) {
        console.log(`[insert] skip existing ${post.slug}`);
        continue;
      }
      await updateBlogPost(existing[0].id, {
        title: post.title,
        excerpt: post.excerpt,
        content: loadArticle(post.articleFile),
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        sourceKeyword: post.sourceKeyword,
        coverImageUrl: post.coverImageUrl,
        ogImageUrl: post.coverImageUrl,
        tags: [...post.tags],
        status: "published",
        noIndex: false,
        updatedAt: new Date(),
      });
      console.log(`[insert] updated existing id=${existing[0].id} slug=${post.slug}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`[insert] would create ${post.slug}`);
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
      publishedAt: new Date(),
      noIndex: false,
    });
    console.log(`[insert] created id=${id} slug=${post.slug}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
