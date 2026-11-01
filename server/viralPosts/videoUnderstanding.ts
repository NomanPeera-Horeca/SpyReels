/**
 * What each viral library video is really about (step B, revised).
 *
 * Signals, strongest first:
 *   1. the transcript (whole video when <= 3 min), from the shared transcript
 *      store when anyone transcribed it before; Deepgram for Instagram and
 *      TikTok, YouTube captions for YouTube;
 *   2. frames: the hook (first 2-3 s) plus scene-change frames, 3-5 with clear
 *      speech, 8-10 with little speech or over ~60 s (YouTube: its official
 *      preview frames + thumbnail, since we never hold YouTube files);
 *   3. the creator's usual topics, worked out once per creator and reused;
 *   4. how we found the video (which pool topic, or research);
 *   5. caption, title and hashtags, only as a weak hint.
 * Output per video: a one-line summary, 1-3 topics from the approved list, a
 * format label, and a meaning embedding of the summary.
 *
 * Cost control: only viral and rising videos, each processed once (claimed
 * row), a daily USD cap (VIRAL_LIBRARY_DAILY_BUDGET_USD, default $5), and
 * transcripts are saved for remake so we never transcribe twice.
 * Runs in the queue worker, not the web server. Never throws into the caller.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  viralPostCandidates,
  viralPostPoolCandidates,
  viralPostPools,
  type ViralPostCandidate,
} from "../../drizzle/schema";
import {
  viralCreatorTopics,
  viralLibraryStatus,
  viralProcessingSpend,
  viralVideoInsights,
  viralVideoTopics,
} from "../../drizzle/viralLibrarySchema";
import { cleanViralFormat, VIRAL_VIDEO_FORMATS } from "../../shared/viralFormats";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";
import { estimateLlmCost, estimateSttCost } from "../analytics/aiCostModel";
import { getDb } from "../db";
import { downloadVideo, extractAudio, transcribeAudioBuffer } from "../services/transcribeReel";
import { getSharedTranscript, saveSharedTranscript, type SharedTranscript } from "../transcripts/sharedTranscriptStore";
import { embedTexts, EMBEDDING_MODEL } from "./embeddings";
import { frameCountFor, openVideo, planFrameTimes } from "./frames";
import { libraryHandle } from "./library";
import { SEMANTIC_POOL_MODEL } from "./semanticPoolRelevance";
import {
  anthropicClient,
  cleanVideoTopics,
  isTopicsReady,
  loadTopics,
  oneLine,
  stripCodeFences,
  syncStarterTopics,
  topicListForPrompt,
  type Topic,
} from "./topics";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const FULL_TRANSCRIPT_MAX_SEC = 180;
const CLEAR_SPEECH_MIN_WORDS = 25;
const PROVIDER_CALL_USD = 0.002;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 60 * 60 * 1000;
const CREATOR_TOPICS_TTL_MS = 30 * 86_400_000;
const TRANSCRIPT_PROMPT_CHARS = 2_500;

export function dailyBudgetUsd(): number {
  const n = Number(process.env.VIRAL_LIBRARY_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function spentToday(db: Db): Promise<number> {
  const [row] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, utcDay())).limit(1);
  return row ? Number(row.usd) : 0;
}

async function addSpend(db: Db, usd: number): Promise<void> {
  const v = Math.max(0, usd).toFixed(4);
  await db
    .insert(viralProcessingSpend)
    .values({ day: utcDay(), usd: v, videos: 1 })
    .onDuplicateKeyUpdate({ set: { usd: sql`usd + ${v}`, videos: sql`videos + 1` } });
}

/* ---------- claiming ---------- */

async function pickVideos(db: Db, limit: number): Promise<number[]> {
  const fresh = await db
    .select({ id: viralLibraryStatus.candidateId })
    .from(viralLibraryStatus)
    .leftJoin(viralVideoInsights, eq(viralVideoInsights.candidateId, viralLibraryStatus.candidateId))
    .where(and(inArray(viralLibraryStatus.status, ["viral", "rising"]), isNull(viralVideoInsights.candidateId)))
    .orderBy(desc(viralLibraryStatus.candidateId))
    .limit(limit);
  if (fresh.length >= limit) return fresh.map(r => r.id);
  const retry = await db
    .select({ id: viralVideoInsights.candidateId })
    .from(viralVideoInsights)
    .where(
      and(
        or(eq(viralVideoInsights.status, "failed"), eq(viralVideoInsights.status, "processing")),
        lt(viralVideoInsights.attempts, MAX_ATTEMPTS),
        lt(viralVideoInsights.claimedAt, new Date(Date.now() - RETRY_AFTER_MS))
      )
    )
    .limit(limit - fresh.length);
  return [...fresh.map(r => r.id), ...retry.map(r => r.id)];
}

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number })?.affectedRows ?? 0);
}

/** Claims a video so two workers never process it at once. */
async function claim(db: Db, candidateId: number): Promise<boolean> {
  const now = new Date();
  const inserted = await db
    .insert(viralVideoInsights)
    .ignore()
    .values({ candidateId, status: "processing", frameCount: 0, attempts: 1, claimedAt: now });
  if (affected(inserted) === 1) return true;
  const retried = await db
    .update(viralVideoInsights)
    .set({ status: "processing", attempts: sql`attempts + 1`, claimedAt: now })
    .where(
      and(
        eq(viralVideoInsights.candidateId, candidateId),
        or(eq(viralVideoInsights.status, "failed"), eq(viralVideoInsights.status, "processing")),
        lt(viralVideoInsights.attempts, MAX_ATTEMPTS),
        lt(viralVideoInsights.claimedAt, new Date(now.getTime() - RETRY_AFTER_MS))
      )
    );
  return affected(retried) === 1;
}

/* ---------- signals ---------- */

type Media = {
  transcript: string | null;
  transcriptSource: "shared" | "deepgram" | "youtube_captions" | "none";
  frames: Buffer[];
  frameNote: string;
  costUsd: number;
};

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 500 && buf.length < 4_000_000 ? buf : null;
  } catch {
    return null;
  }
}

async function youtubeMedia(c: ViralPostCandidate): Promise<Media> {
  let costUsd = 0;
  const cached = await getSharedTranscript("youtube", c.sourceId);
  let transcript = cached?.status === "ok" ? cached.transcript : null;
  let transcriptSource: Media["transcriptSource"] = transcript ? "shared" : "none";
  if (!cached) {
    const { fetchYouTubeTranscript } = await import("../youtube");
    const result = await fetchYouTubeTranscript(c.sourceUrl || `https://www.youtube.com/shorts/${c.sourceId}`);
    costUsd += PROVIDER_CALL_USD;
    if (result?.transcript) {
      transcript = result.transcript;
      transcriptSource = "youtube_captions";
    }
  }
  // YouTube's own preview frames (about 25%, 50%, 75% in) plus the thumbnail.
  const urls = ["hq1", "hq2", "hq3", "hqdefault"].map(n => `https://i.ytimg.com/vi/${c.sourceId}/${n}.jpg`);
  const frames = (await Promise.all(urls.map(fetchImage))).filter((b): b is Buffer => b != null);
  return { transcript, transcriptSource, frames, frameNote: "youtube_preview_frames", costUsd };
}

async function freshVideoUrl(c: ViralPostCandidate): Promise<string | null> {
  try {
    if (c.platform === "instagram") {
      const { fetchReelByShortcode } = await import("../instagram");
      return (await fetchReelByShortcode(c.sourceId))?.videoUrl ?? null;
    }
    if (c.platform === "tiktok") {
      const { fetchTikTokVideoInfo } = await import("../tiktok");
      return (await fetchTikTokVideoInfo(c.sourceUrl))?.videoUrl ?? null;
    }
  } catch {
    // fall through
  }
  return null;
}

async function downloadedMedia(c: ViralPostCandidate): Promise<Media> {
  let costUsd = 0;
  const platform = c.platform as "instagram" | "tiktok";
  let buffer: Buffer | null = null;
  if (c.videoUrl) {
    const r = await downloadVideo(c.videoUrl, c.sourceId);
    if (Buffer.isBuffer(r)) buffer = r;
  }
  if (!buffer) {
    // Instagram/TikTok links expire; ask the provider for a fresh one once.
    const url = await freshVideoUrl(c);
    costUsd += PROVIDER_CALL_USD;
    if (url) {
      const r = await downloadVideo(url, c.sourceId);
      if (Buffer.isBuffer(r)) buffer = r;
    }
  }
  if (!buffer) {
    const thumb = c.thumbnailUrl ? await fetchImage(c.thumbnailUrl) : null;
    const cached = await getSharedTranscript(platform, c.sourceId);
    return {
      transcript: cached?.status === "ok" ? cached.transcript : null,
      transcriptSource: cached?.status === "ok" ? "shared" : "none",
      frames: thumb ? [thumb] : [],
      frameNote: "thumbnail_only",
      costUsd,
    };
  }

  const video = await openVideo(buffer);
  try {
    const { durationSec, sceneTimes, soundRatio } = video.analysis;
    let transcript: string | null = null;
    let transcriptSource: Media["transcriptSource"] = "none";
    const cached = await getSharedTranscript(platform, c.sourceId);
    if (cached?.status === "ok") {
      transcript = cached.transcript;
      transcriptSource = "shared";
    } else if (!cached && soundRatio >= 0.3) {
      const cap = durationSec > FULL_TRANSCRIPT_MAX_SEC ? FULL_TRANSCRIPT_MAX_SEC : undefined;
      const audio = await extractAudio(buffer, c.sourceId, cap);
      const result = await transcribeAudioBuffer(audio, c.sourceId);
      costUsd += estimateSttCost({
        provider: "deepgram",
        model: "nova-3",
        durationSec: Math.min(durationSec || 60, FULL_TRANSCRIPT_MAX_SEC),
      }).costUsd;
      const shared: SharedTranscript | null = result.success
        ? {
            status: "ok",
            transcript: result.transcript,
            segments: result.segments,
            durationSec: durationSec || result.durationSec,
            source: "deepgram",
            partial: cap != null,
          }
        : result.errorCode === "NO_SPEECH_DETECTED"
          ? { status: "no_speech", durationSec, source: "deepgram" }
          : null;
      if (shared) await saveSharedTranscript(platform, c.sourceId, shared); // reused by remake later
      if (result.success) {
        transcript = result.transcript;
        transcriptSource = "deepgram";
      }
    }
    const words = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;
    const count = frameCountFor({ durationSec, clearSpeech: words >= CLEAR_SPEECH_MIN_WORDS });
    const frames = await video.frames(planFrameTimes(durationSec, sceneTimes, count));
    return { transcript, transcriptSource, frames, frameNote: `${frames.length}_frames`, costUsd };
  } finally {
    await video.cleanup();
  }
}

async function foundVia(db: Db, candidateId: number, statusSource: string | null): Promise<string[]> {
  const pools = await db
    .select({ niche: viralPostPools.niche, pillar: viralPostPools.pillar })
    .from(viralPostPoolCandidates)
    .innerJoin(viralPostPools, eq(viralPostPools.id, viralPostPoolCandidates.poolId))
    .where(eq(viralPostPoolCandidates.candidateId, candidateId))
    .limit(3);
  const out = pools.map(p => `search for "${oneLine(p.pillar, 60)}" in ${oneLine(p.niche, 60)}`);
  if (statusSource === "research") out.push("a creator a SpyReels user researched");
  return [...new Set(out)];
}

/* ---------- creator topics ---------- */

/** Most common topics across a creator's processed videos (>= 2 each). Pure; exported for tests. */
export function creatorTopicsFromVideos(topicLists: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const list of topicLists) for (const t of new Set(list)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([t]) => t);
}

async function creatorTopics(db: Db, topics: Topic[], c: ViralPostCandidate): Promise<{ slugs: string[]; costUsd: number }> {
  const handle = libraryHandle(c.creatorHandle ?? c.creatorId);
  if (!handle) return { slugs: [], costUsd: 0 };
  const [row] = await db
    .select()
    .from(viralCreatorTopics)
    .where(and(eq(viralCreatorTopics.platform, c.platform), eq(viralCreatorTopics.handle, handle)))
    .limit(1);
  if (row && Date.now() - row.computedAt.getTime() < CREATOR_TOPICS_TTL_MS) {
    return { slugs: Array.isArray(row.topicSlugs) ? row.topicSlugs : [], costUsd: 0 };
  }
  const handleMatch = or(
    eq(viralPostCandidates.creatorHandle, `@${handle}`),
    eq(viralPostCandidates.creatorHandle, handle)
  );
  // 1) Free: from this creator's videos we already processed.
  const tagged = await db
    .select({ candidateId: viralVideoTopics.candidateId, slug: viralVideoTopics.topicSlug })
    .from(viralVideoTopics)
    .innerJoin(viralPostCandidates, eq(viralPostCandidates.id, viralVideoTopics.candidateId))
    .where(and(eq(viralPostCandidates.platform, c.platform), handleMatch))
    .limit(200);
  const byVideo = new Map<number, string[]>();
  for (const t of tagged) byVideo.set(t.candidateId, [...(byVideo.get(t.candidateId) ?? []), t.slug]);
  let slugs = byVideo.size >= 3 ? creatorTopicsFromVideos([...byVideo.values()]) : [];
  let source = "videos";
  let costUsd = 0;
  // 2) Once per creator: one cheap text call over their recent captions/titles.
  if (slugs.length === 0) {
    const recent = await db
      .select({ caption: viralPostCandidates.caption })
      .from(viralPostCandidates)
      .where(and(eq(viralPostCandidates.platform, c.platform), handleMatch))
      .orderBy(desc(viralPostCandidates.publishedAt))
      .limit(12);
    const lines = recent.map(r => oneLine(r.caption, 200)).filter(Boolean);
    const client = anthropicClient();
    if (lines.length >= 3 && client) {
      const response = await client.messages.create({
        model: SEMANTIC_POOL_MODEL,
        max_tokens: 200,
        temperature: 0,
        system: [
          "From a creator's recent video captions, pick the 1 to 3 topics they usually make videos about.",
          'Use ONLY slugs from the list. Return JSON only: {"topics":["slug"]}',
          "",
          topicListForPrompt(topics),
        ].join("\n"),
        messages: [{ role: "user", content: `Creator @${handle} on ${c.platform}. Recent captions:\n- ${lines.join("\n- ")}` }],
      });
      reportDirectAnthropicUsage(response, "viral_creator_topics");
      costUsd += estimateLlmCost({
        model: SEMANTIC_POOL_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).costUsd;
      const text = response.content.find(b => b.type === "text");
      const parsed = text && text.type === "text" ? JSON.parse(stripCodeFences(text.text)) : {};
      slugs = cleanVideoTopics((parsed as { topics?: unknown }).topics, new Set(topics.map(t => t.slug)));
      source = "ai";
    }
  }
  const now = new Date();
  await db
    .insert(viralCreatorTopics)
    .values({ platform: c.platform, handle, topicSlugs: slugs, source, computedAt: now })
    .onDuplicateKeyUpdate({ set: { topicSlugs: slugs, source, computedAt: now } });
  return { slugs, costUsd };
}

/* ---------- the AI read ---------- */

export type VideoReading = { summary: string; topics: string[]; format: string };

/** Validates the model's answer. Pure; exported for tests. */
export function cleanVideoReading(raw: unknown, known: ReadonlySet<string>): VideoReading | null {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const summary = typeof obj.summary === "string" ? oneLine(obj.summary, 300) : "";
  if (summary.length < 8) return null;
  return { summary, topics: cleanVideoTopics(obj.topics, known), format: cleanViralFormat(obj.format) };
}

/** The text part of the request. Pure; exported for tests. */
export function buildVideoPrompt(args: {
  platform: string;
  creator: string;
  transcript: string | null;
  creatorTopics: string[];
  foundVia: string[];
  caption: string | null;
  frameCount: number;
  frameNote: string;
}): string {
  return [
    `Platform: ${args.platform}. Creator: ${args.creator || "(unknown)"}.`,
    `TRANSCRIPT (strongest signal): ${args.transcript ? oneLine(args.transcript, TRANSCRIPT_PROMPT_CHARS) : "(none: no speech or not available)"}`,
    `FRAMES: ${args.frameCount} attached (${args.frameNote}); the first ones show the opening hook when available.`,
    `CREATOR'S USUAL TOPICS: ${args.creatorTopics.join(", ") || "(unknown)"}`,
    `HOW WE FOUND IT: ${args.foundVia.join("; ") || "(unknown)"}. A hint only: searches return noise.`,
    `CAPTION/TITLE/HASHTAGS (weak hint, often clickbait or empty): ${oneLine(args.caption, 400) || "(none)"}`,
  ].join("\n");
}

async function readVideo(
  topics: Topic[],
  prompt: string,
  frames: Buffer[]
): Promise<{ reading: VideoReading | null; costUsd: number }> {
  const client = anthropicClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not configured");
  const response = await client.messages.create({
    model: SEMANTIC_POOL_MODEL,
    max_tokens: 400,
    temperature: 0,
    system: [
      {
        type: "text",
        text: [
          "You watch a short-form social video (transcript + frames) and say what it is REALLY about, so creators can find viral ideas in their niche and remake them.",
          "Trust the transcript and frames most, then the creator's usual topics, then how it was found. Treat caption/title/hashtags as a weak hint.",
          "Return JSON only:",
          '{"summary":"one plain sentence, max 25 words, what the video is about and the angle","topics":["1 to 3 slugs from the list, only when clearly about it"],"format":"one of the formats"}',
          `Formats: ${VIRAL_VIDEO_FORMATS.join(", ")}`,
          "",
          "Topics by category (use exact slugs; return [] when none fits):",
          topicListForPrompt(topics),
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...frames.map(f => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.toString("base64") },
          })),
          { type: "text" as const, text: prompt },
        ],
      },
    ],
  });
  reportDirectAnthropicUsage(response, "viral_video_understanding");
  const usage = response.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
  const costUsd = estimateLlmCost({
    model: SEMANTIC_POOL_MODEL,
    inputTokens: usage.input_tokens + Math.round((usage.cache_read_input_tokens ?? 0) * 0.1),
    outputTokens: usage.output_tokens,
  }).costUsd;
  const text = response.content.find(b => b.type === "text");
  if (!text || text.type !== "text") return { reading: null, costUsd };
  return { reading: cleanVideoReading(JSON.parse(stripCodeFences(text.text)), new Set(topics.map(t => t.slug))), costUsd };
}

/* ---------- one video ---------- */

async function processOne(db: Db, topics: Topic[], candidateId: number): Promise<{ costUsd: number }> {
  const [row] = await db
    .select({ candidate: viralPostCandidates, statusSource: viralLibraryStatus.source })
    .from(viralPostCandidates)
    .leftJoin(viralLibraryStatus, eq(viralLibraryStatus.candidateId, viralPostCandidates.id))
    .where(eq(viralPostCandidates.id, candidateId))
    .limit(1);
  if (!row) throw new Error("candidate not found");
  const c = row.candidate;
  const signals: string[] = [];

  const creator = await creatorTopics(db, topics, c);
  const media =
    c.platform === "youtube" ? await youtubeMedia(c) : await downloadedMedia(c);
  const via = await foundVia(db, candidateId, row.statusSource ?? null);
  if (media.transcript) signals.push(`transcript:${media.transcriptSource}`);
  if (media.frames.length) signals.push(media.frameNote);
  if (creator.slugs.length) signals.push("creator_topics");
  if (via.length) signals.push("found_via");
  if (c.caption?.trim()) signals.push("caption");

  const prompt = buildVideoPrompt({
    platform: c.platform,
    creator: oneLine(c.creatorHandle || c.creatorName, 60),
    transcript: media.transcript,
    creatorTopics: creator.slugs,
    foundVia: via,
    caption: c.caption,
    frameCount: media.frames.length,
    frameNote: media.frameNote,
  });
  const read = await readVideo(topics, prompt, media.frames);
  let costUsd = media.costUsd + creator.costUsd + read.costUsd;
  if (!read.reading) throw Object.assign(new Error("unreadable model answer"), { costUsd });

  const [embedding] = (await embedTexts([`${read.reading.summary} Topics: ${read.reading.topics.join(", ")}`])) ?? [null];
  const now = new Date();
  await db.delete(viralVideoTopics).where(eq(viralVideoTopics.candidateId, candidateId));
  if (read.reading.topics.length > 0) {
    await db
      .insert(viralVideoTopics)
      .values(read.reading.topics.map(slug => ({ candidateId, topicSlug: slug, taggedAt: now })));
  }
  await db
    .update(viralVideoInsights)
    .set({
      status: "done",
      summary: read.reading.summary,
      format: read.reading.format,
      transcriptSource: media.transcriptSource,
      frameCount: media.frames.length,
      signals: signals.join(",").slice(0, 255),
      embedding,
      embeddingModel: embedding ? EMBEDDING_MODEL : null,
      costUsd: costUsd.toFixed(5),
      error: null,
      processedAt: now,
    })
    .where(eq(viralVideoInsights.candidateId, candidateId));
  return { costUsd };
}

/**
 * Process up to `maxVideos` viral or rising videos, newest first, while
 * today's spend is under the cap. Safe to call from several workers.
 */
export async function processLibraryVideos(args: { maxVideos?: number } = {}): Promise<{
  processed: number;
  failed: number;
  costUsd: number;
  skipped?: "db_unavailable" | "migration_missing" | "no_api_key" | "daily_budget";
}> {
  const totals = { processed: 0, failed: 0, costUsd: 0 };
  const db = await getDb();
  if (!db) return { ...totals, skipped: "db_unavailable" };
  if (!(await isTopicsReady(db))) return { ...totals, skipped: "migration_missing" };
  if (!anthropicClient()) return { ...totals, skipped: "no_api_key" };
  const budget = dailyBudgetUsd();
  if ((await spentToday(db)) >= budget) return { ...totals, skipped: "daily_budget" };

  await syncStarterTopics(db);
  const topics = await loadTopics(db);
  const ids = await pickVideos(db, Math.max(1, Math.min(200, args.maxVideos ?? 10)));
  for (const id of ids) {
    if ((await spentToday(db)) >= budget) return { ...totals, skipped: "daily_budget" };
    if (!(await claim(db, id))) continue;
    try {
      const r = await processOne(db, topics, id);
      await addSpend(db, r.costUsd);
      totals.processed += 1;
      totals.costUsd += r.costUsd;
    } catch (err) {
      const cost = Number((err as { costUsd?: number })?.costUsd ?? 0);
      if (cost > 0) await addSpend(db, cost);
      totals.failed += 1;
      totals.costUsd += cost;
      await db
        .update(viralVideoInsights)
        .set({ status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
        .where(eq(viralVideoInsights.candidateId, id));
      console.warn("[viralLibrary] understand_failed", {
        candidateId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (ids.length > 0) console.info("[viralLibrary] understand_done", { ...totals, costUsd: Number(totals.costUsd.toFixed(4)) });
  return totals;
}

/** Report for the command line. */
export async function understandingReport(): Promise<{ byStatus: Record<string, number>; spentTodayUsd: number }> {
  const db = await getDb();
  if (!db || !(await isTopicsReady(db))) return { byStatus: {}, spentTodayUsd: 0 };
  const rows = await db
    .select({ status: viralVideoInsights.status, n: sql<number>`count(*)` })
    .from(viralVideoInsights)
    .groupBy(viralVideoInsights.status);
  return {
    byStatus: Object.fromEntries(rows.map(r => [r.status, Number(r.n)])),
    spentTodayUsd: await spentToday(db),
  };
}
