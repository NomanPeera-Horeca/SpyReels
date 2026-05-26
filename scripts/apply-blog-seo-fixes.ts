/**
 * Blog SEO consolidation: noindex legacy posts, canonicals, meta polish, sourceKeyword.
 *
 * Usage:
 *   pnpm tsx scripts/apply-blog-seo-fixes.ts --dry-run
 *   pnpm tsx scripts/apply-blog-seo-fixes.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import mysql from "mysql2/promise";
import { BLOG_SLUG_REDIRECTS } from "../shared/blogRedirects";

const PRODUCTION_ENV_FILE = ".env.had-rotated-creds";
const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const DRY_RUN = process.argv.includes("--dry-run");

const KEYWORD_MAP: Record<string, string> = {
  "how-to-go-viral-on-instagram-reels-2026":
    "how to go viral on instagram reels",
  "how-to-spy-on-viral-instagram-reels":
    "how to spy on viral instagram reels",
  "how-to-write-instagram-reels-scripts-that-go-viral":
    "instagram reels scripts that go viral",
  "guide-spy-on-competitor-instagram-reels":
    "spy on competitor instagram reels",
  "guide-instagram-reels-script-generator": "instagram reels script generator",
  "guide-why-reels-get-no-views": "why my reels get no views",
  "guide-instagram-reels-hook-examples": "instagram reels hook examples",
  "guide-find-viral-reels-your-niche": "find viral reels in your niche",
  "guide-instagram-reels-analytics-tool": "instagram reels analytics tool",
  "guide-grow-instagram-reels-under-10k":
    "grow instagram reels under 10k followers",
  "guide-reverse-engineer-viral-reels": "reverse engineer viral reels",
  "guide-instagram-reels-script-template": "instagram reels script template",
  "guide-best-time-to-post-reels-2026": "best time to post reels",
  "spyreels-vs-meedro": "spyreels vs meedro",
  "spyreels-vs-viralfindr": "spyreels vs viralfindr",
  "best-instagram-reels-tools-2026": "best instagram reels tools",
};

const META_UPDATES: Record<
  string,
  { metaTitle?: string; metaDescription?: string }
> = {
  "best-instagram-reels-tools-2026": {
    metaTitle: "Best Instagram Reels Tools 2026 | SpyReels",
    metaDescription:
      "Best Instagram Reels tools in 2026 compared: SpyReels, Meedro, ViralFindr, and Descript. See pricing, features, and which fits script-first creators.",
  },
  "spyreels-vs-viralfindr": {
    metaDescription:
      "SpyReels vs ViralFindr for Instagram Reels in 2026: discovery vs spy, transcribe, and AI scripts. Compare features, pricing, and who each tool fits.",
  },
};

config({
  path: resolve(process.cwd(), PRODUCTION_ENV_FILE),
  override: true,
});

function assertProductionDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      `DATABASE_URL is not set after loading ${PRODUCTION_ENV_FILE}.`
    );
  }
  if (!url.includes(PRODUCTION_HOST)) {
    throw new Error(
      `Refusing to run: DATABASE_URL must use production host ${PRODUCTION_HOST}.`
    );
  }
  return url;
}

async function main() {
  const databaseUrl = assertProductionDatabase();
  console.log(
    `Blog SEO fixes on production (${PRODUCTION_HOST})${DRY_RUN ? " [DRY RUN]" : ""}\n`
  );

  const conn = await mysql.createConnection(databaseUrl);

  try {
    for (const [fromSlug, toSlug] of Object.entries(BLOG_SLUG_REDIRECTS)) {
      const canonicalUrl = `https://spyreels.ai/blog/${toSlug}`;
      if (DRY_RUN) {
        console.log(
          `[consolidate] ${fromSlug} -> noindex, canonical ${canonicalUrl}`
        );
        continue;
      }
      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET noIndex = 1, canonicalUrl = ?, updatedAt = NOW() WHERE slug = ?`,
        [canonicalUrl, fromSlug]
      );
      console.log(
        `[consolidate] ${fromSlug} rows=${result.affectedRows} canonical=${canonicalUrl}`
      );
    }

    for (const [slug, meta] of Object.entries(META_UPDATES)) {
      if (DRY_RUN) {
        console.log(`[meta] ${slug}`, meta);
        continue;
      }
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (meta.metaTitle) {
        sets.push("metaTitle = ?");
        vals.push(meta.metaTitle);
      }
      if (meta.metaDescription) {
        sets.push("metaDescription = ?");
        vals.push(meta.metaDescription);
      }
      if (sets.length === 0) continue;
      sets.push("updatedAt = NOW()");
      vals.push(slug);
      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET ${sets.join(", ")} WHERE slug = ?`,
        vals
      );
      console.log(`[meta] ${slug} rows=${result.affectedRows}`);
    }

    for (const [slug, keyword] of Object.entries(KEYWORD_MAP)) {
      if (DRY_RUN) {
        console.log(`[keyword] ${slug} -> ${keyword}`);
        continue;
      }
      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET sourceKeyword = ?, updatedAt = NOW() WHERE slug = ? AND (sourceKeyword IS NULL OR sourceKeyword = '')`,
        [keyword, slug]
      );
      if (result.affectedRows > 0) {
        console.log(`[keyword] ${slug} -> ${keyword}`);
      }
    }

    console.log("\nDone.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
