/**
 * Insert SpyReels review 2026 blog post (production).
 *
 * Usage:
 *   pnpm exec tsx scripts/insert-spyreels-review-2026.ts --dry-run
 *   pnpm exec tsx scripts/insert-spyreels-review-2026.ts
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { asc, eq } from "drizzle-orm";
import { blogPosts, users } from "../drizzle/schema";
import { createBlogPost, getDb } from "../server/db";

const DRY_RUN = process.argv.includes("--dry-run");
const __dirname = dirname(fileURLToPath(import.meta.url));

const SLUG = "guide-spyreels-review-2026";

const POST = {
  title: "SpyReels Review 2026: Is It Worth It for Instagram Reels Creators?",
  slug: SLUG,
  sourceKeyword: "spyreels review",
  excerpt:
    "Honest SpyReels review for 2026: who it fits, strengths, limits, pricing, and how it compares to Meedro and ViralFindr for Reels research and scripting.",
  metaTitle: "SpyReels Review 2026: Worth It for Reels Creators?",
  metaDescription:
    "SpyReels review 2026 with honest pros, cons, pricing, and comparisons to Meedro and ViralFindr. See if the spy-transcribe-script workflow fits you.",
  coverImageUrl:
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=630&fit=crop&q=80",
  tags: ["spyreels review", "instagram reels tools", "spyreels"],
};

function loadContent(): string {
  return readFileSync(
    join(__dirname, "..", "seed", "articles", "24-guide-spyreels-review-2026.md"),
    "utf8"
  ).trim();
}

async function main() {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("DB connection failed");
  }

  const existing = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(eq(blogPosts.slug, SLUG))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Skip: ${SLUG} already exists (id ${existing[0]!.id})`);
    return;
  }

  const content = loadContent();
  console.log(`${DRY_RUN ? "[dry-run] " : ""}insert ${SLUG} (${content.length} chars)`);

  if (DRY_RUN) {
    return;
  }

  const firstUser = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
  const authorId = firstUser[0]?.id;
  if (!authorId) {
    throw new Error("No users found for authorId");
  }

  const id = await createBlogPost({
    ...POST,
    authorId,
    content,
    ogImageUrl: POST.coverImageUrl,
    status: "published",
    publishedAt: new Date(),
    noIndex: false,
  });

  console.log(`Created post id=${id} slug=${SLUG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
