/**
 * Blog SEO consolidation: noindex legacy posts, canonicals, meta polish, sourceKeyword.
 *
 * Usage:
 *   pnpm tsx scripts/apply-blog-seo-fixes.ts --dry-run
 *   pnpm tsx scripts/apply-blog-seo-fixes.ts
 *
 * DATABASE_URL: copy fresh from Railway (production maglev) into .env, then:
 *   export DATABASE_URL='mysql://...'
 *   pnpm tsx scripts/apply-blog-seo-fixes.ts
 *
 * If CLI access fails, run scripts/sql/blog-seo-fixes-production.sql in Railway UI.
 */
import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import mysql from "mysql2/promise";
import { BLOG_SLUG_REDIRECTS } from "../shared/blogRedirects";

const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const DRY_RUN = process.argv.includes("--dry-run");

const KEYWORD_MAP: Record<string, string> = {
  "how-to-go-viral-on-instagram-reels-2024":
    "how to go viral on instagram reels",
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
  "guide-meedro-alternative": "meedro alternative",
  "guide-viralfindr-alternative": "viralfindr alternative",
  "meedro-review-2026": "meedro review 2026",
  "viralfindr-review-2026": "viralfindr review 2026",
  "guide-instagram-reels-spy-tool": "instagram reels spy tool",
  "guide-instagram-reels-content-analysis-2026":
    "instagram reels content analysis",
  "guide-alex-hormozi-instagram-reels-analysis":
    "alex hormozi instagram reels",
  "guide-instagram-reels-engagement-rate": "instagram reels engagement rate",
  "guide-instagram-reels-hook-patterns-data": "instagram reels hook patterns",
  "guide-transcribe-instagram-reels-analysis": "transcribe instagram reels",
  "guide-how-to-go-viral-on-instagram-reels-2026":
    "how to go viral on instagram reels",
  "guide-instagram-reels-hook-ideas-2026": "instagram reels hook ideas",
  "guide-instagram-reels-content-strategy-under-10k":
    "instagram reels content strategy",
  "guide-spyreels-review-2026": "spyreels review",
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

function loadEnv(): void {
  const envFileArg = process.argv.find((a) => a.startsWith("--env-file="));
  const envPath = envFileArg
    ? resolve(process.cwd(), envFileArg.slice("--env-file=".length))
    : resolve(process.cwd(), ".env");

  if (existsSync(envPath)) {
    config({ path: envPath });
  }

  if (!process.env.DATABASE_URL && existsSync(resolve(process.cwd(), ".env.had-rotated-creds"))) {
    config({ path: resolve(process.cwd(), ".env.had-rotated-creds") });
  }
}

function assertProductionDatabase(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy the current URL from Railway (maglev production) into .env or run:\n" +
        "  export DATABASE_URL='mysql://...'\n" +
        "Or apply scripts/sql/blog-seo-fixes-production.sql in Railway MySQL UI."
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
  loadEnv();
  const databaseUrl = assertProductionDatabase();
  console.log(
    `Blog SEO fixes on production (${PRODUCTION_HOST})${DRY_RUN ? " [DRY RUN]" : ""}\n`
  );

  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection(databaseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ER_ACCESS_DENIED")) {
      console.error(
        "MySQL rejected the password in DATABASE_URL (often stale after Railway rotation).\n\n" +
          "Fix:\n" +
          "  1. Railway -> production MySQL (maglev) -> Connect -> copy DATABASE_URL\n" +
          "  2. Put it in .env (do not use .env.had-rotated-creds if it is old)\n" +
          "  3. Re-run this script\n\n" +
          "Or run scripts/sql/blog-seo-fixes-production.sql in Railway Query tab (one line at a time).\n"
      );
    }
    throw err;
  }

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
