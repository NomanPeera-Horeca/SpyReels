/**
 * Background reel classification (Sonnet via invokeLLM).
 * Logic duplicated from scripts/classify-reels.ts — keep in sync manually when changing prompts/validation.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { getDb } from "../db";
import { reels, transcriptions } from "../../drizzle/schema";

const BATCH_SIZE = 5;

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

Example 1: Educational fitness:
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

Example 2: Business contrarian:
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

Example 3: Personal story:
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

Example 4: NO_SPEECH visual content (transcript empty):
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

interface TargetRow {
  id: number;
  shortcode: string;
  ownerUsername: string | null;
  caption: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  transcript: string | null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        { role: "system", content: withAiFormattingRules(SYSTEM_PROMPT) },
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
  reelId: number,
  v: ValidClassification
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db
      .update(reels)
      .set({
        niche: v.niche,
        secondaryNiche: v.secondaryNiche,
        hookPattern: v.hookPattern,
        retentionTactics: v.retentionTactics,
        contentType: v.contentType,
        remakeabilityScore: v.remakeabilityScore,
        confidence: v.confidence,
        classificationReason: v.classificationReason,
        classifiedAt: new Date(),
      })
      .where(eq(reels.id, reelId));
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
  row: TargetRow,
  stats: { successful: number; failed: number }
): Promise<void> {
  const payload = buildUserPayload(row);
  let rawText = "";

  try {
    rawText = await invokeClassifyWithRetry(payload);
  } catch (e) {
    console.warn(
      `[classify-reels] id=${row.id} API failed after retry:`,
      e instanceof Error ? e.message : e
    );
    stats.failed++;
    return;
  }

  const stripped = stripJsonFences(rawText);
  let parsed: unknown;
  try {
    parsed = sanitizeAiOutputDeep(JSON.parse(stripped));
  } catch {
    console.warn(
      `[classify-reels] id=${row.id} JSON.parse failed. raw (first 500): ${rawText.slice(0, 500)}`
    );
    stats.failed++;
    return;
  }

  const validated = validateClassification(parsed, row.id, stripped);
  if (!validated) {
    stats.failed++;
    return;
  }

  const ok = await writeClassification(row.id, validated);
  if (!ok) {
    stats.failed++;
    return;
  }

  stats.successful++;
}

/** Dedupe joins that return multiple transcription rows per reel. */
function dedupeTargets(rows: TargetRow[]): TargetRow[] {
  const map = new Map<number, TargetRow>();
  for (const row of rows) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export async function classifyReelsByIds(
  reelIds: number[]
): Promise<{ ok: number; failed: number }> {
  const started = Date.now();
  const uniqueIds = [...new Set(reelIds)].filter(
    (id) => typeof id === "number" && Number.isFinite(id) && id > 0
  );

  if (uniqueIds.length === 0) {
    console.log("[classifyReelsByIds] start n=0");
    console.log("[classifyReelsByIds] done ok=0 failed=0 ms=0");
    return { ok: 0, failed: 0 };
  }

  const db = await getDb();
  if (!db) {
    console.error("[classifyReelsByIds] database unavailable");
    console.log("[classifyReelsByIds] start n=0");
    console.log(
      `[classifyReelsByIds] done ok=0 failed=0 ms=${Date.now() - started}`
    );
    return { ok: 0, failed: 0 };
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.warn(
      "[classifyReelsByIds] ANTHROPIC_API_KEY not set; skipping classification"
    );
    console.log("[classifyReelsByIds] start n=0");
    console.log(
      `[classifyReelsByIds] done ok=0 failed=0 ms=${Date.now() - started}`
    );
    return { ok: 0, failed: 0 };
  }

  const rawRows = await db
    .select({
      id: reels.id,
      shortcode: reels.shortcode,
      ownerUsername: reels.ownerUsername,
      caption: reels.caption,
      viewCount: reels.viewCount,
      likeCount: reels.likeCount,
      commentCount: reels.commentCount,
      transcript: transcriptions.transcript,
    })
    .from(reels)
    .leftJoin(
      transcriptions,
      and(eq(transcriptions.reelId, reels.id), eq(transcriptions.status, "completed"))
    )
    .where(and(inArray(reels.id, uniqueIds), isNull(reels.classifiedAt)))
    .orderBy(asc(reels.id));

  const slice = dedupeTargets(rawRows as TargetRow[]);
  const n = slice.length;
  console.log(`[classifyReelsByIds] start n=${n}`);

  const stats = { successful: 0, failed: 0 };

  for (let i = 0; i < slice.length; i += BATCH_SIZE) {
    const batch = slice.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((row) => processRow(row, stats)));
  }

  const ms = Date.now() - started;
  console.log(
    `[classifyReelsByIds] done ok=${stats.successful} failed=${stats.failed} ms=${ms}`
  );

  return { ok: stats.successful, failed: stats.failed };
}
