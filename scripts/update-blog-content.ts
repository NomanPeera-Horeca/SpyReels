import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { blogPosts } from "../drizzle/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

dotenv.config();

function extractInlineContentFromSeedBlogs(source: string, slug: string): string {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `slug:\\s*"${escaped}"[\\s\\S]*?content:\\s*\`([\\s\\S]*?)\`\\s*\\.trim\\(\\),`,
    "m",
  );
  const m = source.match(re);
  if (!m) {
    throw new Error(`Could not extract inline content for slug: ${slug}`);
  }
  return m[1].trim();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in environment (.env).");
    process.exit(1);
  }

  const db = drizzle(url);
  const seedSource = readFileSync(join(root, "seed-blogs.ts"), "utf8");

  const jobs: { slug: string; getContent: () => string }[] = [
    {
      slug: "guide-spy-on-competitor-instagram-reels",
      getContent: () => extractInlineContentFromSeedBlogs(seedSource, "guide-spy-on-competitor-instagram-reels"),
    },
  {
      slug: "guide-instagram-reels-script-generator",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "26-guide-instagram-reels-script-generator.md"), "utf8").trim(),
    },
    {
      slug: "guide-why-reels-get-no-views",
      getContent: () => extractInlineContentFromSeedBlogs(seedSource, "guide-why-reels-get-no-views"),
    },
    {
      slug: "guide-instagram-reels-hook-examples",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "04-guide-instagram-reels-hook-examples.md"), "utf8").trim(),
    },
    {
      slug: "guide-find-viral-reels-your-niche",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "05-guide-find-viral-reels-your-niche.md"), "utf8").trim(),
    },
    {
      slug: "guide-instagram-reels-analytics-tool",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "06-guide-instagram-reels-analytics-tool.md"), "utf8").trim(),
    },
    {
      slug: "guide-grow-instagram-reels-under-10k",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "07-guide-grow-instagram-reels-under-10k.md"), "utf8").trim(),
    },
    {
      slug: "guide-reverse-engineer-viral-reels",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "08-guide-reverse-engineer-viral-reels.md"), "utf8").trim(),
    },
    {
      slug: "guide-instagram-reels-script-template",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "09-guide-instagram-reels-script-template.md"), "utf8").trim(),
    },
    {
      slug: "guide-best-time-to-post-reels-2026",
      getContent: () =>
        readFileSync(join(root, "seed", "articles", "10-guide-best-time-to-post-reels-2026.md"), "utf8").trim(),
    },
  ];

  for (const { slug, getContent } of jobs) {
    const newContent = getContent();
    await db.update(blogPosts).set({ content: newContent }).where(eq(blogPosts.slug, slug));
    console.log(`Updated: ${slug}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
