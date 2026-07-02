/**
 * Backfill sourceKeyword on production blog_posts (NULL only).
 *
 * Usage:
 *   pnpm tsx scripts/backfill-source-keywords.ts           # apply
 *   pnpm tsx scripts/backfill-source-keywords.ts --dry-run # log only
 */
import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import mysql from "mysql2/promise";

const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv(): void {
  const envFileArg = process.argv.find((a) => a.startsWith("--env-file="));
  const envPath = envFileArg
    ? resolve(process.cwd(), envFileArg.slice("--env-file=".length))
    : resolve(process.cwd(), ".env");

  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

loadEnv();

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
  "guide-how-to-go-viral-on-instagram-reels-2026": "how to go viral on instagram reels",
  "guide-instagram-reels-hook-ideas-2026": "instagram reels hook ideas",
  "guide-instagram-reels-content-strategy-under-10k": "instagram reels content strategy",
};

function assertProductionDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy the current URL from Railway into .env."
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
    `Target: production (${PRODUCTION_HOST}) — ${Object.keys(KEYWORD_MAP).length} slugs${DRY_RUN ? " [DRY RUN]" : ""}\n`
  );

  const conn = await mysql.createConnection(databaseUrl);

  try {
    let updated = 0;
    let skipped = 0;
    let missing = 0;

    for (const [slug, keyword] of Object.entries(KEYWORD_MAP)) {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT id, sourceKeyword FROM blog_posts WHERE slug = ? LIMIT 1`,
        [slug]
      );

      const row = rows[0];
      if (!row) {
        console.log(`[missing] ${slug} — post not found`);
        missing++;
        continue;
      }

      if (row.sourceKeyword != null && String(row.sourceKeyword).trim() !== "") {
        console.log(
          `[skip] ${slug} — sourceKeyword already set: "${row.sourceKeyword}"`
        );
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`Updated ${slug} -> ${keyword} (dry-run, not written)`);
        updated++;
        continue;
      }

      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `UPDATE blog_posts SET sourceKeyword = ?, updatedAt = NOW() WHERE slug = ? AND sourceKeyword IS NULL`,
        [keyword, slug]
      );

      if (result.affectedRows === 0) {
        console.log(
          `[skip] ${slug} — no row updated (sourceKeyword may have been set concurrently)`
        );
        skipped++;
        continue;
      }

      console.log(`Updated ${slug} -> ${keyword}`);
      updated++;
    }

    const [nullRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT slug FROM blog_posts WHERE status = 'published' AND (sourceKeyword IS NULL OR sourceKeyword = '') ORDER BY slug`
    );
    if (nullRows.length > 0) {
      console.log("\nPublished posts still missing sourceKeyword:");
      for (const row of nullRows) {
        console.log(`  - ${row.slug}`);
      }
    }

    console.log(
      `\nDone. updated=${updated} skipped=${skipped} missing=${missing}`
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
