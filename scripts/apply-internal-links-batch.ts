/**
 * Batch 2 SEO: internal linking + related guides sections on all published posts.
 *
 * Usage:
 *   pnpm exec tsx scripts/apply-internal-links-batch.ts --dry-run
 *   pnpm exec tsx scripts/apply-internal-links-batch.ts
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { blogPosts } from "../drizzle/schema";
import { getDb, updateBlogPost } from "../server/db";
import { BLOG_RELATED_SLUGS } from "../shared/blogRedirects";
import {
  appendRelatedGuidesIfMissing,
  contentHasRelatedGuidesSection,
} from "../shared/blogInternalLinkSections";

const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const DRY_RUN = process.argv.includes("--dry-run");
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Seed article file overrides full content refresh. */
const SEED_CONTENT_REFRESH: Record<string, string> = {
  "guide-spy-on-competitor-instagram-reels": "03-guide-spy-on-competitor-instagram-reels.md",
  "guide-find-viral-reels-your-niche": "05-guide-find-viral-reels-your-niche.md",
  "guide-reverse-engineer-viral-reels": "08-guide-reverse-engineer-viral-reels.md",
  "guide-instagram-reels-hook-examples": "04-guide-instagram-reels-hook-examples.md",
  "guide-instagram-reels-analytics-tool": "06-guide-instagram-reels-analytics-tool.md",
  "guide-grow-instagram-reels-under-10k": "07-guide-grow-instagram-reels-under-10k.md",
  "guide-instagram-reels-script-template": "09-guide-instagram-reels-script-template.md",
  "guide-best-time-to-post-reels-2026": "10-guide-best-time-to-post-reels-2026.md",
  "guide-meedro-alternative": "11-guide-meedro-alternative.md",
  "guide-viralfindr-alternative": "12-guide-viralfindr-alternative.md",
  "meedro-review-2026": "13-meedro-review-2026.md",
  "viralfindr-review-2026": "14-viralfindr-review-2026.md",
  "guide-instagram-reels-spy-tool": "15-guide-instagram-reels-spy-tool.md",
  "guide-instagram-reels-content-analysis-2026": "16-guide-instagram-reels-content-analysis-2026.md",
  "guide-alex-hormozi-instagram-reels-analysis": "17-guide-alex-hormozi-instagram-reels-analysis.md",
  "guide-instagram-reels-engagement-rate": "18-guide-instagram-reels-engagement-rate.md",
  "guide-instagram-reels-hook-patterns-data": "19-guide-instagram-reels-hook-patterns-data.md",
  "guide-transcribe-instagram-reels-analysis": "20-guide-transcribe-instagram-reels-analysis.md",
  "guide-how-to-go-viral-on-instagram-reels-2026": "21-guide-how-to-go-viral-on-instagram-reels-2026.md",
  "guide-instagram-reels-hook-ideas-2026": "22-guide-instagram-reels-hook-ideas-2026.md",
  "guide-instagram-reels-content-strategy-under-10k": "23-guide-instagram-reels-content-strategy-under-10k.md",
};

function loadArticle(file: string): string {
  return readFileSync(join(__dirname, "..", "seed", "articles", file), "utf8").trim();
}

function resolveContent(slug: string, currentContent: string): string {
  const seedFile = SEED_CONTENT_REFRESH[slug];
  const base = seedFile ? loadArticle(seedFile) : currentContent;
  return appendRelatedGuidesIfMissing(base, slug);
}

async function main() {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL missing in .env");
  }

  if (dbUrl.includes(PRODUCTION_HOST)) {
    console.log(`Target: production (${PRODUCTION_HOST})`);
  } else {
    console.log("Target: non-production DATABASE_URL");
  }

  if (DRY_RUN) {
    console.log("DRY RUN: no writes");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Could not connect to database");
  }

  const rows = await db
    .select({ id: blogPosts.id, slug: blogPosts.slug, content: blogPosts.content })
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"));

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!BLOG_RELATED_SLUGS[row.slug]) {
      skipped++;
      continue;
    }

    const nextContent = resolveContent(row.slug, row.content);
    if (nextContent === row.content) {
      skipped++;
      continue;
    }

    const hadRelated = contentHasRelatedGuidesSection(row.content);
    const hasRelated = contentHasRelatedGuidesSection(nextContent);
    console.log(
      `${DRY_RUN ? "[dry-run] " : ""}update ${row.slug} (related section: ${hadRelated ? "had" : "added"} -> ${hasRelated ? "yes" : "no"})`
    );

    if (!DRY_RUN) {
      await updateBlogPost(row.id, { content: nextContent });
    }
    updated++;
  }

  console.log(`Done. Updated ${updated}, skipped ${skipped}, total published ${rows.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
