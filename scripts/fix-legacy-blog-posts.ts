/**
 * One-shot fix for 3 legacy production blog posts:
 * - Append "## Frequently asked questions" + 5 Q&As (Claude) if missing
 * - Normalize plain-text headings to ## / ### for TOC anchor IDs
 * - Backfill publishedAt when null
 *
 * Usage:
 *   pnpm tsx scripts/fix-legacy-blog-posts.ts           # apply updates
 *   pnpm tsx scripts/fix-legacy-blog-posts.ts --dry-run # log only, no writes
 */
import { config } from "dotenv";
import { resolve } from "path";
import mysql from "mysql2/promise";
import Anthropic from "@anthropic-ai/sdk";

const PRODUCTION_ENV_FILE = ".env.had-rotated-creds";
const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const MODEL = "claude-sonnet-4-6";
const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY_SLUGS = [
  "how-to-go-viral-on-instagram-reels-2026",
  "how-to-spy-on-viral-instagram-reels",
  "how-to-write-instagram-reels-scripts-that-go-viral",
] as const;

const FAQ_HEADING_RE = /^##\s+Frequently asked questions\s*$/im;

const SLUG_TOPIC_HINTS: Record<(typeof LEGACY_SLUGS)[number], string> = {
  "how-to-go-viral-on-instagram-reels-2026":
    "going viral on Instagram Reels in 2026, algorithm signals, watch-through rate, shares, saves, view counts, posting strategy for new accounts",
  "how-to-spy-on-viral-instagram-reels":
    "competitor research on Instagram Reels, finding viral Reels in a niche, ethical spying, tools and methods, patterns and structure extraction",
  "how-to-write-instagram-reels-scripts-that-go-viral":
    "writing Instagram Reels scripts, hooks, script structure, watch-through optimization, sounding natural on camera, SpyReels as a scripting tool",
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-");
}

/** Mirrors BlogPost.tsx normalizeContentToMarkdown for stored markdown + TOC ids. */
function normalizeBlogMarkdownHeadings(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let inFaq = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      normalized.push("");
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      if (/^##\s+Frequently asked questions/i.test(trimmed)) {
        inFaq = true;
      }
      normalized.push(trimmed);
      continue;
    }

    if (/^frequently asked questions/i.test(trimmed)) {
      inFaq = true;
      normalized.push("## Frequently asked questions");
      continue;
    }

    const isListLine = /^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
    const endsWithPeriod = trimmed.endsWith(".");
    const endsWithQuestion = trimmed.endsWith("?");
    const startsCapital = /^[A-Z]/.test(trimmed);
    const hasCommaEarly = trimmed.slice(0, 30).includes(",");
    const isShort = trimmed.length < 120;

    const isHeadingCandidate =
      isShort &&
      !endsWithPeriod &&
      startsCapital &&
      !hasCommaEarly &&
      !isListLine;

    if (isHeadingCandidate && endsWithQuestion && inFaq) {
      normalized.push(`### ${trimmed}`);
      continue;
    }

    if (isHeadingCandidate && endsWithQuestion && !inFaq) {
      normalized.push(`## ${trimmed}`);
      continue;
    }

    if (isHeadingCandidate) {
      normalized.push(`## ${trimmed}`);
      continue;
    }

    normalized.push(trimmed);
  }

  return normalized.join("\n\n").replace(/^(\|.*\|)\n\n(?=\|)/gm, "$1\n");
}

function hasFaqSection(content: string): boolean {
  return FAQ_HEADING_RE.test(content);
}

function contentPreview(content: string, max = 500): string {
  return content.replace(/\s+/g, " ").trim().slice(0, max);
}

function stripFencedMarkdown(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:markdown)?\s*([\s\S]*?)```$/i);
  return fence ? fence[1].trim() : trimmed;
}

function validateFaqBlock(markdown: string): string {
  const block = stripFencedMarkdown(markdown);
  if (!FAQ_HEADING_RE.test(block)) {
    throw new Error("Generated FAQ missing '## Frequently asked questions' heading");
  }
  const questions = block.match(/^###\s+.+\?/gm) ?? [];
  if (questions.length < 5) {
    throw new Error(
      `Generated FAQ has ${questions.length} questions; expected at least 5`
    );
  }
  return block.trim();
}

async function generateFaqBlock(params: {
  slug: (typeof LEGACY_SLUGS)[number];
  title: string;
  preview: string;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });
  const topicHint = SLUG_TOPIC_HINTS[params.slug];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0.4,
    system: `You write SEO blog FAQ sections for SpyReels (Instagram Reels research and AI scripting).
Output ONLY valid markdown. No preamble, no code fences.
Use exactly this structure:
## Frequently asked questions

### [Question ending with ?]
[2-3 sentence answer paragraph]

Repeat for exactly 5 questions.
Do not use em dashes. Mention SpyReels at most once, only if natural.`,
    messages: [
      {
        role: "user",
        content: `Write a FAQ section for this blog post.

Slug: ${params.slug}
Title: ${params.title}
Topic focus: ${topicHint}
Opening excerpt: ${params.preview}

Requirements:
- Exactly 5 questions as ### headings, each ending with ?
- Each answer is 2-3 sentences, practical, for creators
- Questions must match the slug topic (not generic Instagram advice)`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  return validateFaqBlock(textBlock.text);
}

function appendFaqSection(content: string, faqBlock: string): string {
  const base = content.trimEnd();
  return `${base}\n\n${faqBlock.trim()}\n`;
}

function logHeadingAnchors(slug: string, content: string): void {
  const headings = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## ") || line.startsWith("### "))
    .map((line) => {
      const level = line.startsWith("### ") ? "h3" : "h2";
      const text = line.replace(/^###?\s+/, "");
      return { level, text, id: slugify(text) };
    });

  console.log(`  [anchors] ${slug}: ${headings.length} headings`);
  for (const h of headings.slice(0, 8)) {
    console.log(`    ${h.level} #${h.id} — ${h.text.slice(0, 60)}`);
  }
  if (headings.length > 8) {
    console.log(`    ... +${headings.length - 8} more`);
  }
}

type PostRow = {
  id: number;
  slug: string;
  title: string;
  content: string;
  publishedAt: Date | string | null;
  createdAt: Date | string;
};

async function main() {
  const databaseUrl = assertProductionDatabase();
  console.log(
    `Target: production (${PRODUCTION_HOST})${DRY_RUN ? " [DRY RUN]" : ""}\n`
  );

  const conn = await mysql.createConnection(databaseUrl);

  try {
    for (const slug of LEGACY_SLUGS) {
      console.log(`\n--- ${slug} ---`);

      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT id, slug, title, content, publishedAt, createdAt
         FROM blog_posts WHERE slug = ? LIMIT 1`,
        [slug]
      );

      const row = rows[0] as PostRow | undefined;
      if (!row) {
        console.log("  [skip] post not found");
        continue;
      }

      console.log(`  [fetch] id=${row.id} title="${row.title}"`);
      console.log(
        `  [fetch] content length=${row.content.length} publishedAt=${row.publishedAt ?? "NULL"}`
      );

      if (hasFaqSection(row.content)) {
        console.log("  [skip] already has '## Frequently asked questions'");
        continue;
      }

      const preview = contentPreview(row.content);
      console.log(`  [claude] generating FAQ (${MODEL})...`);
      const faqBlock = await generateFaqBlock({
        slug,
        title: row.title,
        preview,
      });
      console.log(`  [claude] FAQ block length=${faqBlock.length}`);

      let newContent = appendFaqSection(row.content, faqBlock);
      const beforeNormalizeLen = newContent.length;
      newContent = normalizeBlogMarkdownHeadings(newContent);
      console.log(
        `  [normalize] headings normalized (${beforeNormalizeLen} -> ${newContent.length} chars)`
      );
      logHeadingAnchors(slug, newContent);

      const publishedAt =
        row.publishedAt ??
        row.createdAt ??
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      console.log(
        `  [publish] publishedAt will be set to ${row.publishedAt ? "(unchanged)" : publishedAt}`
      );

      if (DRY_RUN) {
        console.log("  [dry-run] no database write");
        continue;
      }

      await conn.execute(
        `UPDATE blog_posts
         SET content = ?,
             publishedAt = COALESCE(publishedAt, ?),
             updatedAt = NOW()
         WHERE id = ?`,
        [newContent, publishedAt, row.id]
      );
      console.log(`  [done] updated id=${row.id}`);
    }

    console.log("\nAll legacy slugs processed.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
