/**
 * Viral library topics (step B).
 *
 * - The approved starter list (shared/viralTopics.ts) is synced into
 *   viral_topics. Videos are tagged by videoUnderstanding.ts (transcript,
 *   frames, creator topics), using the helpers exported here.
 * - Every creator profile's confirmed niche, pillars and sub-topics are
 *   matched to topics, and get a meaning embedding. When nothing fits a
 *   pillar, AI may add up to 2 new topics, so the list grows with real
 *   creators. A changed strategy is matched again.
 *
 * Safe before migration 0109 (skips quietly). Bounded per call. Never throws
 * into the caller. Uses the same Haiku model and usage reporting as the
 * existing semantic pool check. No provider (ScrapeCreators) calls.
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import {
  viralProfileTopicRuns,
  viralProfileTopics,
  viralTopics,
  viralVideoTopics,
} from "../../drizzle/viralLibrarySchema";
import { STARTER_VIRAL_TOPICS, topicSlug, VIRAL_TOPIC_CATEGORIES } from "../../shared/viralTopics";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";
import { getDb } from "../db";
import {
  listConfirmedTopicStrategies,
  type ConfirmedTopicStrategy,
} from "../personalization/home/topicStrategies";
import { embedTexts, EMBEDDING_MODEL } from "./embeddings";
import { SEMANTIC_POOL_MODEL } from "./semanticPoolRelevance";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type Topic = { slug: string; label: string; category: string };

/** Migration 0109 tables (plus 0108's status table, which the video step reads). */
const TOPIC_TABLES = [
  "viral_topics",
  "viral_video_topics",
  "viral_video_insights",
  "viral_creator_topics",
  "viral_profile_topics",
  "viral_profile_topic_runs",
  "shared_transcripts",
  "viral_processing_spend",
];
const MAX_TOPICS_PER_VIDEO = 3;
const MAX_TOPICS_PER_PROFILE = 8;
const MAX_NEW_TOPICS_PER_PROFILE = 2;
const READY_RECHECK_MS = 10 * 60 * 1000;

let readyCache: { ready: boolean; at: number } | null = null;

export async function isTopicsReady(db: Db): Promise<boolean> {
  if (readyCache?.ready) return true;
  if (readyCache && Date.now() - readyCache.at < READY_RECHECK_MS) return false;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${sql.join(
        [...TOPIC_TABLES, "viral_library_status"].map(t => sql`${t}`),
        sql`, `
      )})`
    )) as unknown as [Array<{ n: number | string }>];
    const ready = Number(rows?.[0]?.n ?? 0) === TOPIC_TABLES.length + 1;
    readyCache = { ready, at: Date.now() };
    return ready;
  } catch {
    readyCache = { ready: false, at: Date.now() };
    return false;
  }
}

export function resetTopicsReadyCacheForTests(): void {
  readyCache = null;
}

export function stripCodeFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

/**
 * The first complete JSON object in a model answer, ignoring code fences and
 * any words before or after it. Throws when there is none. Pure; exported for tests.
 */
export function parseFirstJsonObject(text: string): unknown {
  const s = stripCodeFences(text);
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model answer");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("Unfinished JSON object in model answer");
}

export function oneLine(text: string | null | undefined, max: number): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function syncStarterTopics(db: Db): Promise<void> {
  const now = new Date();
  await db
    .insert(viralTopics)
    .values(STARTER_VIRAL_TOPICS.map(t => ({ ...t, source: "starter", createdAt: now })))
    .onDuplicateKeyUpdate({ set: { slug: sql`slug` } });
}

export async function loadTopics(db: Db): Promise<Topic[]> {
  return db
    .select({ slug: viralTopics.slug, label: viralTopics.label, category: viralTopics.category })
    .from(viralTopics)
    .orderBy(viralTopics.category, viralTopics.slug);
}

export function topicListForPrompt(topics: Topic[]): string {
  const byCategory = new Map<string, Topic[]>();
  for (const t of topics) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  return [...byCategory.entries()]
    .map(([category, list]) => `${category}: ${list.map(t => t.slug).join(", ")}`)
    .join("\n");
}

export function anthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? new Anthropic({ apiKey: key }) : null;
}

/* ---------- videos ---------- */

/** Keeps only known slugs, at most 3, no repeats. Pure; exported for tests. */
export function cleanVideoTopics(raw: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (known.has(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= MAX_TOPICS_PER_VIDEO) break;
  }
  return out;
}

/* ---------- creator profiles ---------- */

export type ProfileStrategy = ConfirmedTopicStrategy;

/** Changes whenever the creator's category, niche, pillars or sub-topics change. */
export function strategyHash(p: ProfileStrategy): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const payload = JSON.stringify({
    c: norm(p.category),
    n: norm(p.niche),
    p: p.pillars.map(norm).sort(),
    s: p.subtopics.map(norm).sort(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Validates the AI's profile answer: known slugs, plus at most 2 new topics
 * with a real label and a known category. Pure; exported for tests.
 */
export function cleanProfileMatch(
  raw: unknown,
  known: ReadonlySet<string>
): { topics: string[]; newTopics: Topic[] } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const topics = Array.isArray(obj.topics)
    ? [...new Set(obj.topics.map(t => (typeof t === "string" ? t.trim().toLowerCase() : "")).filter(t => known.has(t)))]
    : [];
  const newTopics: Topic[] = [];
  for (const value of Array.isArray(obj.newTopics) ? obj.newTopics : []) {
    if (newTopics.length >= MAX_NEW_TOPICS_PER_PROFILE) break;
    const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const label = typeof v.label === "string" ? oneLine(v.label, 60) : "";
    const category = typeof v.category === "string" ? v.category.trim().toLowerCase() : "";
    const slug = topicSlug(label);
    if (label.length < 3 || !slug || !VIRAL_TOPIC_CATEGORIES.includes(category)) continue;
    if (known.has(slug) || topics.includes(slug) || newTopics.some(t => t.slug === slug)) continue;
    newTopics.push({ slug, label, category });
  }
  const room = MAX_TOPICS_PER_PROFILE - newTopics.length;
  return { topics: topics.slice(0, Math.max(0, room)), newTopics };
}

async function matchOneProfile(client: Anthropic, topics: Topic[], p: ProfileStrategy) {
  const known = new Set(topics.map(t => t.slug));
  const response = await client.messages.create({
    model: SEMANTIC_POOL_MODEL,
    max_tokens: 600,
    temperature: 0,
    system: [
      "You match a content creator's niche to topics, so we can show them viral videos to remake.",
      `Pick up to ${MAX_TOPICS_PER_PROFILE} topics from the list below (exact slugs) that their pillars and sub-topics are really about.`,
      `Only if a pillar fits NONE of the listed topics, add up to ${MAX_NEW_TOPICS_PER_PROFILE} new topics: a short, general label other creators could share (e.g. "halal food in Dubai"), with one category from: ${VIRAL_TOPIC_CATEGORIES.join(", ")}.`,
      "Return JSON only: {\"topics\":[\"slug\"],\"newTopics\":[{\"label\":\"...\",\"category\":\"...\"}]}",
      "",
      "Topics by category:",
      topicListForPrompt(topics),
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Category: ${oneLine(p.category, 60) || "(none)"}`,
          `Niche: ${oneLine(p.niche, 120) || "(none)"}`,
          `Pillars: ${p.pillars.map(x => oneLine(x, 80)).join("; ") || "(none)"}`,
          `Sub-topics: ${p.subtopics.map(x => oneLine(x, 80)).join("; ") || "(none)"}`,
        ].join("\n"),
      },
    ],
  });
  reportDirectAnthropicUsage(response, "viral_profile_topics");
  const text = response.content.find(b => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text in profile topic response");
  return cleanProfileMatch(parseFirstJsonObject(text.text), known);
}

/** The text a creator's meaning embedding is made from. Pure; exported for tests. */
export function profileEmbeddingText(p: ProfileStrategy): string {
  return [
    p.category && `Category: ${p.category}`,
    p.niche && `Niche: ${p.niche}`,
    p.pillars.length > 0 && `Pillars: ${p.pillars.join("; ")}`,
    p.subtopics.length > 0 && `Sub-topics: ${p.subtopics.join("; ")}`,
  ]
    .filter(Boolean)
    .join(". ");
}

/**
 * Match creator profiles whose strategy is new or changed, up to
 * `maxProfiles` per call (one AI call each).
 */
export async function matchProfileTopics(args: { maxProfiles?: number } = {}): Promise<{
  matched: number;
  newTopics: number;
  skipped?: "db_unavailable" | "migration_missing" | "no_api_key";
}> {
  const totals = { matched: 0, newTopics: 0 };
  const db = await getDb();
  if (!db) return { ...totals, skipped: "db_unavailable" };
  if (!(await isTopicsReady(db))) return { ...totals, skipped: "migration_missing" };
  const client = anthropicClient();
  if (!client) return { ...totals, skipped: "no_api_key" };

  await syncStarterTopics(db);
  let topics = await loadTopics(db);
  const maxProfiles = Math.max(1, Math.min(200, args.maxProfiles ?? 10));

  const strategies = (await listConfirmedTopicStrategies(2_000)).filter(
    p => p.niche || p.pillars.length > 0 || p.subtopics.length > 0
  );
  const runs = await db.select().from(viralProfileTopicRuns);
  const lastHash = new Map(runs.map(r => [r.socialProfileId, r.strategyHash]));
  const due = strategies.filter(p => lastHash.get(p.socialProfileId) !== strategyHash(p)).slice(0, maxProfiles);

  for (const p of due) {
    try {
      const match = await matchOneProfile(client, topics, p);
      const now = new Date();
      if (match.newTopics.length > 0) {
        await db
          .insert(viralTopics)
          .values(match.newTopics.map(t => ({ ...t, source: "user", createdAt: now })))
          .onDuplicateKeyUpdate({ set: { slug: sql`slug` } });
        totals.newTopics += match.newTopics.length;
        topics = await loadTopics(db);
      }
      const slugs = [...match.topics, ...match.newTopics.map(t => t.slug)];
      await db.delete(viralProfileTopics).where(eq(viralProfileTopics.socialProfileId, p.socialProfileId));
      if (slugs.length > 0) {
        await db.insert(viralProfileTopics).values(
          slugs.map(slug => ({ socialProfileId: p.socialProfileId, workspaceId: p.workspaceId, topicSlug: slug, matchedAt: now }))
        );
      }
      const hash = strategyHash(p);
      const [embedding] = (await embedTexts([profileEmbeddingText(p)])) ?? [null];
      const embeddingModel = embedding ? EMBEDDING_MODEL : null;
      await db
        .insert(viralProfileTopicRuns)
        .values({
          socialProfileId: p.socialProfileId,
          workspaceId: p.workspaceId,
          strategyHash: hash,
          embedding,
          embeddingModel,
          matchedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: { strategyHash: hash, workspaceId: p.workspaceId, embedding, embeddingModel, matchedAt: now },
        });
      totals.matched += 1;
    } catch (err) {
      console.warn("[viralLibrary] profile_match_failed", {
        socialProfileId: p.socialProfileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (totals.matched > 0) console.info("[viralLibrary] profile_match_done", totals);
  return totals;
}

/**
 * Add embeddings to matched creator profiles that missed one (e.g. OpenAI
 * was out of quota). Only profiles whose strategy did not change since.
 */
export async function embedMissingProfiles(args: { max?: number } = {}): Promise<number> {
  const db = await getDb();
  if (!db || !(await isTopicsReady(db))) return 0;
  const runs = await db.select().from(viralProfileTopicRuns);
  const missing = new Map(runs.filter(r => !r.embedding).map(r => [r.socialProfileId, r.strategyHash]));
  if (missing.size === 0) return 0;
  const todo = (await listConfirmedTopicStrategies(2_000))
    .filter(p => missing.get(p.socialProfileId) === strategyHash(p))
    .slice(0, Math.max(1, Math.min(200, args.max ?? 50)));
  if (todo.length === 0) return 0;
  const vectors = await embedTexts(todo.map(profileEmbeddingText));
  if (!vectors) return 0;
  for (let i = 0; i < todo.length; i++) {
    await db
      .update(viralProfileTopicRuns)
      .set({ embedding: vectors[i]!, embeddingModel: EMBEDDING_MODEL })
      .where(eq(viralProfileTopicRuns.socialProfileId, todo[i]!.socialProfileId));
  }
  console.info("[viralLibrary] embeddings_backfilled", { profiles: todo.length });
  return todo.length;
}

/** Report: videos per topic and profiles per topic. */
export async function topicCoverage(): Promise<Array<{ slug: string; category: string; videos: number; profiles: number }>> {
  const db = await getDb();
  if (!db || !(await isTopicsReady(db))) return [];
  const [videos, profiles, topics] = await Promise.all([
    db
      .select({ slug: viralVideoTopics.topicSlug, n: sql<number>`count(*)` })
      .from(viralVideoTopics)
      .groupBy(viralVideoTopics.topicSlug),
    db
      .select({ slug: viralProfileTopics.topicSlug, n: sql<number>`count(*)` })
      .from(viralProfileTopics)
      .groupBy(viralProfileTopics.topicSlug),
    loadTopics(db),
  ]);
  const v = new Map(videos.map(r => [r.slug, Number(r.n)]));
  const pr = new Map(profiles.map(r => [r.slug, Number(r.n)]));
  return topics
    .map(t => ({ slug: t.slug, category: t.category, videos: v.get(t.slug) ?? 0, profiles: pr.get(t.slug) ?? 0 }))
    .filter(t => t.videos > 0 || t.profiles > 0)
    .sort((a, b) => b.profiles - a.profiles || b.videos - a.videos);
}
