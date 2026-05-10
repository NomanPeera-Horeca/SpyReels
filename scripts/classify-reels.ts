/**
 * Classify reels where `niche` is NULL using Claude (default model via invokeLLM)
 * and transcript + metadata. Writes 8 fields on `reels` including `confidence`.
 *
 * Requires: DATABASE_URL, ANTHROPIC_API_KEY (unless --dry-run).
 * Apply drizzle/0035_add_reels_confidence.sql before running against MySQL.
 *
 * Flags:
 *   --dry-run   count targets + first 3 (id, shortcode, ownerUsername); no API / writes
 *   --limit=N   process first N rows only
 *   --verbose   log each reel outcome
 */

import * as dotenv from "dotenv";
import type { RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";
import { invokeLLM } from "../server/_core/llm";

dotenv.config();

const BATCH_SIZE = 5;

const TARGET_SQL = `
SELECT r.id, r.shortcode, r.ownerUsername, r.caption, r.viewCount, r.likeCount, r.commentCount, t.transcript
  FROM reels r
  LEFT JOIN transcriptions t ON t.reelId = r.id AND t.status = 'completed'
 WHERE r.niche IS NULL
 ORDER BY r.id ASC
`;

const NICHE_VALUES = [
  "real_estate",
  "fitness",
  "food",
  "beauty",
  "business",
  "finance",
  "marketing",
  "parenting",
  "travel",
  "fashion",
  "tech",
  "education",
  "lifestyle",
  "spirituality",
  "hospitality",
] as const;

const HOOK_PATTERN_VALUES = [
  "question",
  "stat",
  "contrarian",
  "story",
  "direct_promise",
  "pov",
  "confession",
  "listicle",
  "comparison",
  "mistake_reveal",
] as const;

const CONTENT_TYPE_VALUES = [
  "educational",
  "story",
  "opinion",
  "personal",
  "reaction",
  "skit",
  "music",
  "other",
] as const;

const RETENTION_TACTICS_ALLOWED = new Set([
  "cliffhanger",
  "pattern_interrupt",
  "specific_numbers",
  "personal_stake",
  "callback",
  "rapid_pacing",
  "contrast",
  "list_promise",
  "direct_address",
  "proof_artifact",
]);

const NICHE_SET = new Set<string>(NICHE_VALUES);

const SYSTEM_PROMPT = `You are a viral Instagram Reels classifier for SpyReels, a tool that helps creators understand what makes content go viral.

For each reel, read the transcript and metadata, then output a JSON object with exactly these 8 fields:

{
  "niche": one of ["real_estate", "fitness", "food", "beauty", "business", "finance", "marketing", "parenting", "travel", "fashion", "tech", "education", "lifestyle", "spirituality", "hospitality"],
  "secondaryNiche": same enum as niche, OR null if no clear secondary,
  "hookPattern": one of ["question", "stat", "contrarian", "story", "direct_promise", "pov", "confession", "listicle", "comparison", "mistake_reveal"],
  "retentionTactics": array of 0 to 3 values from ["cliffhanger", "pattern_interrupt", "specific_numbers", "personal_stake", "callback", "rapid_pacing", "contrast", "list_promise", "direct_address", "proof_artifact"],
  "contentType": one of ["educational", "story", "opinion", "personal", "reaction", "skit", "music", "other"],
  "remakeabilityScore": integer 0 to 10 (10 = perfectly remakeable in another creator's voice, 0 = impossible to remake),
  "confidence": integer 0 to 100 (your confidence in this classification),
  "classificationReason": string max 200 chars, plain English, one sentence
}

RULES:
- niche must always be set (never null). If unclear, pick the closest fit.
- secondaryNiche is null if there isn't a clear second niche.
- hookPattern always set (never null). Match to closest pattern.
- retentionTactics can be empty array [] if none apply, max 3 entries.
- If the transcript is empty (NO_SPEECH_DETECTED visual content), force contentType="visual_only" is NOT allowed (not in enum). Instead set contentType="music" if it's clearly music/dance, else "other". Cap remakeabilityScore at 2. Set confidence max 40. Note in classificationReason that this was classified from caption only.
- Output ONLY the JSON object. No markdown fences, no preamble, no explanation outside the JSON.

EXAMPLES (4 hand-crafted, baked into prompt):

Example 1 — Educational fitness:
Transcript: "If you want to lose belly fat, stop doing crunches. Here are 3 exercises that actually work. First, dead bugs. 12 reps each side. Second, plank reaches. 30 seconds. Third, mountain climbers. 45 seconds. Do this 3x a week. You will see results in 21 days."
Caption: "The truth about belly fat 🔥 #fitness #fatloss"
Owner: trainwithjess
Output:
{
  "niche": "fitness",
  "secondaryNiche": null,
  "hookPattern": "contrarian",
  "retentionTactics": ["specific_numbers", "list_promise"],
  "contentType": "educational",
  "remakeabilityScore": 9,
  "confidence": 92,
  "classificationReason": "Clear contrarian hook with structured 3-item list and concrete numbers, fully repeatable framework."
}

Example 2 — Business contrarian:
Transcript: "Most people think rich people work harder. They don't. They work on different things. While you're answering emails, they're building systems that answer emails for them. The difference between rich and broke isn't hours worked. It's leverage."
Caption: "How rich people actually think differently"
Owner: codiesanchez
Output:
{
  "niche": "business",
  "secondaryNiche": "finance",
  "hookPattern": "contrarian",
  "retentionTactics": ["contrast", "direct_address"],
  "contentType": "opinion",
  "remakeabilityScore": 8,
  "confidence": 88,
  "classificationReason": "Contrarian myth-busting structure with rich-vs-broke contrast, easily adapted to other contrarian takes."
}

Example 3 — Personal story:
Transcript: "I was 23 when my dad died. He left me $3,000 and a letter that said 'don't waste this on stupid stuff.' I used it to start a food truck. Today that food truck is a chain of 14 restaurants. This is for you, dad."
Caption: "My dad's last gift 💔"
Owner: hungry_jeff
Output:
{
  "niche": "business",
  "secondaryNiche": "food",
  "hookPattern": "story",
  "retentionTactics": ["personal_stake", "specific_numbers"],
  "contentType": "personal",
  "remakeabilityScore": 2,
  "confidence": 95,
  "classificationReason": "Deeply personal life story tied to creator's specific biography, cannot be remade in another voice."
}

Example 4 — NO_SPEECH visual content (transcript empty):
Transcript: ""
Caption: "POV: when the beat drops 🎵"
Owner: dancingwithanna
Output:
{
  "niche": "lifestyle",
  "secondaryNiche": null,
  "hookPattern": "pov",
  "retentionTactics": [],
  "contentType": "music",
  "remakeabilityScore": 1,
  "confidence": 35,
  "classificationReason": "No transcript available, classified from caption only, music/dance content not remakeable as script."
}`;

interface TargetRow extends RowDataPacket {
  id: number;
  shortcode: string;
  ownerUsername: string | null;
  caption: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  transcript: string | null;
}

interface CliOptions {
  dryRun: boolean;
  verbose: boolean;
  limit: number;
}

interface RunStats {
  totalTargets: number;
  successful: number;
  failed: number;
}

interface ValidClassification {
  niche: (typeof NICHE_VALUES)[number];
  secondaryNiche: (typeof NICHE_VALUES)[number] | null;
  hookPattern: (typeof HOOK_PATTERN_VALUES)[number];
  retentionTactics: string[];
  contentType: (typeof CONTENT_TYPE_VALUES)[number];
  remakeabilityScore: number;
  confidence: number;
  classificationReason: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  let dryRun = false;
  let verbose = false;
  let limit = Infinity;

  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--verbose") verbose = true;
    else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      limit = Number.isFinite(n) && n >= 0 ? Math.floor(n) : Infinity;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/classify-reels.ts [--dry-run] [--verbose] [--limit=N]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }

  return { dryRun, verbose, limit };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectPool(): Promise<mysql.Pool> {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL not set");
  return mysql.createPool({
    uri: raw,
    connectionLimit: BATCH_SIZE,
    waitForConnections: true,
    connectTimeout: 60_000,
  });
}

async function fetchTargets(pool: mysql.Pool): Promise<TargetRow[]> {
  const [rows] = await pool.query<TargetRow[]>(TARGET_SQL);
  return rows;
}

function buildUserPayload(row: TargetRow): string {
  const transcript =
    row.transcript != null && row.transcript.trim() !== ""
      ? row.transcript
      : "(empty - no speech detected)";
  return `Owner: ${row.ownerUsername ?? ""}
Caption: ${row.caption ?? "(none)"}
Views: ${row.viewCount}
Likes: ${row.likeCount}
Comments: ${row.commentCount}

Transcript:
${transcript}`;
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return s.trim();
}

function validateClassification(
  parsed: unknown,
  reelId: number,
  rawForLog: string
): ValidClassification | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: root not object. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }

  const o = parsed as Record<string, unknown>;

  const niche = o.niche;
  if (typeof niche !== "string" || !NICHE_SET.has(niche)) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: niche. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }

  const secondaryRaw = o.secondaryNiche;
  let secondaryNiche: ValidClassification["secondaryNiche"] = null;
  if (secondaryRaw !== null && secondaryRaw !== undefined) {
    if (typeof secondaryRaw !== "string" || !NICHE_SET.has(secondaryRaw)) {
      console.warn(
        `[classify-reels] id=${reelId} validation failed: secondaryNiche. raw (first 500): ${rawForLog.slice(0, 500)}`
      );
      return null;
    }
    secondaryNiche = secondaryRaw as ValidClassification["secondaryNiche"];
  }

  const hookPattern = o.hookPattern;
  if (
    typeof hookPattern !== "string" ||
    !(HOOK_PATTERN_VALUES as readonly string[]).includes(hookPattern)
  ) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: hookPattern. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }

  const contentType = o.contentType;
  if (
    typeof contentType !== "string" ||
    !(CONTENT_TYPE_VALUES as readonly string[]).includes(contentType)
  ) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: contentType. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }

  const rt = o.retentionTactics;
  if (!Array.isArray(rt)) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: retentionTactics not array. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }
  if (rt.length > 3) {
    console.warn(
      `[classify-reels] id=${reelId} retentionTactics length ${rt.length} > 3; keeping first 3`
    );
  }
  const rtSlice = rt.slice(0, 3);
  for (const item of rtSlice) {
    if (typeof item !== "string" || !RETENTION_TACTICS_ALLOWED.has(item)) {
      console.warn(
        `[classify-reels] id=${reelId} validation failed: retentionTactics invalid value "${String(item)}". raw (first 500): ${rawForLog.slice(0, 500)}`
      );
      return null;
    }
  }

  const remake = o.remakeabilityScore;
  if (
    typeof remake !== "number" ||
    !Number.isInteger(remake) ||
    remake < 0 ||
    remake > 10
  ) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: remakeabilityScore. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }

  const conf = o.confidence;
  if (
    typeof conf !== "number" ||
    !Number.isInteger(conf) ||
    conf < 0 ||
    conf > 100
  ) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: confidence. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }

  const reasonRaw = o.classificationReason;
  if (typeof reasonRaw !== "string") {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: classificationReason not string. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }
  let classificationReason = reasonRaw.trim();
  if (classificationReason.length === 0) {
    console.warn(
      `[classify-reels] id=${reelId} validation failed: classificationReason empty after trim. raw (first 500): ${rawForLog.slice(0, 500)}`
    );
    return null;
  }
  if (classificationReason.length > 200) {
    console.warn(
      `[classify-reels] id=${reelId} classificationReason truncated from ${classificationReason.length} to 200 chars`
    );
    classificationReason = classificationReason.slice(0, 200);
  }

  return {
    niche: niche as ValidClassification["niche"],
    secondaryNiche,
    hookPattern: hookPattern as ValidClassification["hookPattern"],
    retentionTactics: rtSlice,
    contentType: contentType as ValidClassification["contentType"],
    remakeabilityScore: remake,
    confidence: conf,
    classificationReason,
  };
}

async function invokeClassifyWithRetry(userPayload: string): Promise<string> {
  const call = () =>
    invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
    });

  try {
    const response = await call();
    return String(response.choices[0]?.message?.content ?? "");
  } catch (firstErr) {
    console.warn(
      `[classify-reels] invokeLLM failed, retry in 2s:`,
      firstErr instanceof Error ? firstErr.message : firstErr
    );
    await sleep(2000);
    const response = await call();
    return String(response.choices[0]?.message?.content ?? "");
  }
}

async function writeClassification(
  pool: mysql.Pool,
  reelId: number,
  v: ValidClassification
): Promise<boolean> {
  try {
    await pool.query(
      `UPDATE reels SET
          niche = ?,
          secondaryNiche = ?,
          hookPattern = ?,
          retentionTactics = ?,
          contentType = ?,
          remakeabilityScore = ?,
          confidence = ?,
          classificationReason = ?,
          classifiedAt = NOW()
        WHERE id = ?`,
      [
        v.niche,
        v.secondaryNiche,
        v.hookPattern,
        JSON.stringify(v.retentionTactics),
        v.contentType,
        v.remakeabilityScore,
        v.confidence,
        v.classificationReason,
        reelId,
      ]
    );
    return true;
  } catch (e) {
    console.error(
      `[classify-reels] DB write failed id=${reelId}:`,
      e instanceof Error ? e.message : e
    );
    return false;
  }
}

async function processRow(
  pool: mysql.Pool,
  row: TargetRow,
  opts: { dryRun: boolean; verbose: boolean },
  stats: RunStats
): Promise<void> {
  const payload = buildUserPayload(row);
  let rawText = "";

  try {
    rawText = opts.dryRun ? "" : await invokeClassifyWithRetry(payload);
  } catch (e) {
    console.warn(
      `[classify-reels] id=${row.id} API failed after retry:`,
      e instanceof Error ? e.message : e
    );
    stats.failed++;
    if (opts.verbose) {
      console.log(`  [FAIL] id=${row.id} shortcode=${row.shortcode} (API)`);
    }
    return;
  }

  if (opts.dryRun) return;

  const stripped = stripJsonFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    console.warn(
      `[classify-reels] id=${row.id} JSON.parse failed. raw (first 500): ${rawText.slice(0, 500)}`
    );
    stats.failed++;
    if (opts.verbose) {
      console.log(`  [FAIL] id=${row.id} shortcode=${row.shortcode} (parse)`);
    }
    return;
  }

  const validated = validateClassification(parsed, row.id, stripped);
  if (!validated) {
    stats.failed++;
    if (opts.verbose) {
      console.log(`  [FAIL] id=${row.id} shortcode=${row.shortcode} (validation)`);
    }
    return;
  }

  const ok = await writeClassification(pool, row.id, validated);
  if (!ok) {
    stats.failed++;
    if (opts.verbose) {
      console.log(`  [FAIL] id=${row.id} shortcode=${row.shortcode} (db write)`);
    }
    return;
  }

  stats.successful++;
  if (opts.verbose) {
    console.log(`  [OK] id=${row.id} shortcode=${row.shortcode} niche=${validated.niche}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const started = Date.now();

  if (!opts.dryRun && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not set (required unless --dry-run)");
  }

  const pool = await connectPool();
  try {
    const all = await fetchTargets(pool);
    const slice =
      opts.limit === Infinity ? all : all.slice(0, opts.limit);

    const stats: RunStats = {
      totalTargets: slice.length,
      successful: 0,
      failed: 0,
    };

    console.log(`Total target reels: ${slice.length}`);
    if (opts.dryRun) {
      console.log("Dry run — no Claude calls, no database writes.");
      for (let i = 0; i < Math.min(3, slice.length); i++) {
        const r = slice[i];
        console.log(`  (${r.id}, ${r.shortcode}, ${r.ownerUsername ?? ""})`);
      }
    } else {
      for (let i = 0; i < slice.length; i += BATCH_SIZE) {
        const batch = slice.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((row) => processRow(pool, row, opts, stats))
        );
      }
    }

    const elapsedSec = (Date.now() - started) / 1000;
    const elapsedStr = elapsedSec.toFixed(1);
    const avgStr =
      !opts.dryRun && slice.length > 0
        ? (elapsedSec / slice.length).toFixed(2)
        : "—";

    console.log("");
    console.log("===== classify-reels summary =====");
    console.log(`  total targets:        ${stats.totalTargets}`);
    console.log(`  successful:           ${stats.successful}`);
    console.log(`  failed:               ${stats.failed}`);
    console.log(`  elapsed seconds:      ${elapsedStr}`);
    console.log(`  avg seconds per reel: ${avgStr}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
