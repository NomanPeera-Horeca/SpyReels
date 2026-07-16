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
    metaDescription:
      "Best Meedro alternative for Instagram Reels in 2026. Compare SpyReels on pricing, transcription, AI scripts, and who should switch from Meedro today.",
    articleFile: "11-guide-meedro-alternative.md",
  },
  {
    slug: "guide-viralfindr-alternative",
    metaTitle: "ViralFindr Free Alternative 2026 | SpyReels",
    metaDescription:
      "Best ViralFindr free alternative in 2026 for creators who need transcription, hook breakdown, and AI scripts. Honest SpyReels comparison and switch steps.",
    articleFile: "12-guide-viralfindr-alternative.md",
  },
  {
    slug: "meedro-review-2026",
    metaDescription:
      "Meedro review 2026: honest pros, cons, credit pricing, and who it fits. See when SpyReels is the better pick for Instagram Reels creators. Compare now.",
    articleFile: "13-meedro-review-2026.md",
  },
  {
    slug: "viralfindr-review-2026",
    metaDescription:
      "ViralFindr review 2026: worth it or not? Features, pricing, common complaints, and the best alternative when you need scripts, not only downloads.",
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
