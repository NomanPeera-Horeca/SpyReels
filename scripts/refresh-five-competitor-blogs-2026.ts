/**
 * Updates content + meta for the 5 competitor blog posts (re-run after SEO content edits).
 * Run: pnpm exec tsx scripts/refresh-five-competitor-blogs-2026.ts
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
    slug: "guide-meedro-alternative",
    metaTitle: "Meedro Alternative | Better Than Meedro",
    metaDescription:
      "Want more views, not just more videos to study? Meedro shows you what's viral. SpyReels turns it into a ready-to-film script in your voice, so you can post and grow faster.",
    articleFile: "11-guide-meedro-alternative.md",
  },
  {
    slug: "guide-viralfindr-alternative",
    metaTitle: "ViralFindr Alternative | Better Than ViralFindr",
    metaDescription:
      "Stop collecting viral videos, start posting them. SpyReels finds what's working in your niche and writes your next script, hook, structure, and all, so you can go viral faster.",
    articleFile: "12-guide-viralfindr-alternative.md",
  },
  {
    slug: "meedro-review-2026",
    metaTitle: "Meedro Alternative | Better Than Meedro",
    metaDescription:
      "Meedro shows you viral videos. SpyReels turns them into a ready-to-film script in your voice in seconds, so you can post and grow faster.",
    articleFile: "13-meedro-review-2026.md",
  },
  {
    slug: "viralfindr-review-2026",
    metaTitle: "ViralFindr Review 2026: Is It Worth It? | SpyReels",
    metaDescription:
      "ViralFindr review 2026: honest pros, cons, pricing, and the best alternative when you need scripts, not just downloads.",
    articleFile: "14-viralfindr-review-2026.md",
  },
  {
    slug: "guide-instagram-reels-spy-tool",
    metaDescription:
      "Best Instagram Reels spy tool in 2026 compared: SpyReels vs Meedro vs ViralFindr. See transcription, hooks, AI scripts, pricing, and who each fits.",
    articleFile: "15-guide-instagram-reels-spy-tool.md",
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
      content: loadArticle(row.articleFile),
      metaDescription: row.metaDescription,
      ...("metaTitle" in row && row.metaTitle ? { metaTitle: row.metaTitle } : {}),
      updatedAt: new Date(),
    });
    console.log(`Updated id=${existing[0].id} slug=${row.slug}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
