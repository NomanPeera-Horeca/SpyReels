/**
 * Viral library topics (step B).
 *
 * - The approved starter list (shared/viralTopics.ts) is synced into
 *   viral_topics.
 * - Every viral or rising library video gets 1-3 topics, picked by AI only
 *   from that list (it cannot invent one). Each video is read once.
 * - Every creator profile's confirmed niche, pillars and sub-topics are
 *   matched to topics. When nothing fits a pillar, AI may add up to 2 new
 *   topics, so the list grows with real creators. A changed strategy is
 *   matched again.
 *
 * Safe before migration 0109 (skips quietly). Bounded per call. Never throws
 * into the caller. Uses the same Haiku model and usage reporting as the
 * existing semantic pool check. No provider (ScrapeCreators) calls.
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { viralPostCandidates } from "../../drizzle/schema";
import {
  viralLibraryStatus,
  viralProfileTopicRuns,
  viralProfileTopics,
  viralTopics,
  viralVideoTagRuns,
  viralVideoTopics,
} from "../../drizzle/viralLibrarySchema";
import { STARTER_VIRAL_TOPICS, topicSlug, VIRAL_TOPIC_CATEGORIES } from "../../shared/viralTopics";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";
import { getDb } from "../db";
import {
  listConfirmedTopicStrategies,
  type ConfirmedTopicStrategy,
} from "../personalization/home/topicStrategies";
import { SEMANTIC_POOL_MODEL } from "./semanticPoolRelevance";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Topic = { slug: string; label: string; category: string };

const TOPIC_TABLES = [
  "viral_topics",
  "viral_video_topics",
  "viral_video_tag_runs",
  "viral_profile_topics",
  "viral_profile_topic_runs",
];
const VIDEO_BATCH = 20;
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

function stripCodeFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function oneLine(text: string | null | undefined, max: number): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function syncStarterTopics(db: Db): Promise<void> {
  const now = new Date();
  await db
    .insert(viralTopics)
    .values(STARTER_VIRAL_TOPICS.map(t => ({ ...t, source: "starter", createdAt: now })))
    .onDuplicateKeyUpdate({ set: { slug: sql`slug` } });
}

async function loadTopics(db: Db): Promise<Topic[]> {
  return db
    .select({ slug: viralTopics.slug, label: viralTopics.label, category: viralTopics.category })
    .from(viralTopics)
    .orderBy(viralTopics.category, viralTopics.slug);
}

function topicListForPrompt(topics: Topic[]): string {
  const byCategory = new Map<string, Topic[]>();
  for (const t of topics) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  return [...byCategory.entries()]
    .map(([category, list]) => `${category}: ${list.map(t => t.slug).join(", ")}`)
    .join("\n");
}

function anthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? new Anthropic({ apiKey: key }) : null;
}

/* ---------- videos ---------- */

export type VideoForTagging = { id: number; platform: string; creator: string; caption: string };

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

async function tagBatch(
  client: Anthropic,
  topics: Topic[],
  videos: VideoForTagging[]
): Promise<Map<number, string[]>> {
  const known = new Set(topics.map(t => t.slug));
  const lines = videos
    .map(v => `- id: ${v.id}\n  platform: ${v.platform}\n  creator: ${v.creator}\n  caption: ${v.caption || "(none)"}`)
    .join("\n");
  const response = await client.messages.create({
    model: SEMANTIC_POOL_MODEL,
    max_tokens: 1500,
    temperature: 0,
    system: [
      "You label short-form social videos with topics so creators can find viral ideas in their niche.",
      "Pick 1 to 3 topics per video, ONLY from the list below (use the exact slug).",
      "Pick a topic only when the video is clearly about it. If none fits, return an empty list.",
      "Return JSON only: {\"videos\":[{\"id\":123,\"topics\":[\"slug\"]}]}",
      "",
      "Topics by category:",
      topicListForPrompt(topics),
    ].join("\n"),
    messages: [{ role: "user", content: `Videos:\n${lines}\n\nReturn JSON for every id.` }],
  });
  reportDirectAnthropicUsage(response, "viral_library_topics");
  const text = response.content.find(b => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text in topic tagging response");
  const parsed = JSON.parse(stripCodeFences(text.text)) as { videos?: Array<{ id?: unknown; topics?: unknown }> };
  const out = new Map<number, string[]>();
  for (const row of parsed.videos ?? []) {
    const id = Number(row.id);
    if (Number.isInteger(id)) out.set(id, cleanVideoTopics(row.topics, known));
  }
  return out;
}

/**
 * Tag up to `maxVideos` viral or rising library videos that were never read,
 * newest first. Returns how many were read and how many got a topic.
 */
export async function tagLibraryVideos(args: { maxVideos?: number } = {}): Promise<{
  read: number;
  tagged: number;
  aiCalls: number;
  skipped?: "db_unavailable" | "migration_missing" | "no_api_key";
}> {
  const totals = { read: 0, tagged: 0, aiCalls: 0 };
  const db = await getDb();
  if (!db) return { ...totals, skipped: "db_unavailable" };
  if (!(await isTopicsReady(db))) return { ...totals, skipped: "migration_missing" };
  const client = anthropicClient();
  if (!client) return { ...totals, skipped: "no_api_key" };

  await syncStarterTopics(db);
  const topics = await loadTopics(db);
  const maxVideos = Math.max(1, Math.min(500, args.maxVideos ?? 60));

  const rows = await db
    .select({
      id: viralPostCandidates.id,
      platform: viralPostCandidates.platform,
      creatorHandle: viralPostCandidates.creatorHandle,
      creatorName: viralPostCandidates.creatorName,
      caption: viralPostCandidates.caption,
    })
    .from(viralLibraryStatus)
    .innerJoin(viralPostCandidates, eq(viralPostCandidates.id, viralLibraryStatus.candidateId))
    .leftJoin(viralVideoTagRuns, eq(viralVideoTagRuns.candidateId, viralLibraryStatus.candidateId))
    .where(and(inArray(viralLibraryStatus.status, ["viral", "rising"]), isNull(viralVideoTagRuns.candidateId)))
    .orderBy(desc(viralLibraryStatus.candidateId))
    .limit(maxVideos);

  const videos: VideoForTagging[] = rows.map(r => ({
    id: r.id,
    platform: r.platform,
    creator: oneLine(r.creatorHandle || r.creatorName, 60),
    caption: oneLine(r.caption, 400),
  }));

  for (let i = 0; i < videos.length; i += VIDEO_BATCH) {
    const batch = videos.slice(i, i + VIDEO_BATCH);
    let result: Map<number, string[]>;
    try {
      result = await tagBatch(client, topics, batch);
      totals.aiCalls += 1;
    } catch (err) {
      console.warn("[viralLibrary] tag_batch_failed", {
        videos: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
      continue; // leave them untagged; the next run tries again
    }
    const now = new Date();
    const links = batch.flatMap(v => (result.get(v.id) ?? []).map(slug => ({ candidateId: v.id, topicSlug: slug, taggedAt: now })));
    if (links.length > 0) {
      await db.insert(viralVideoTopics).values(links).onDuplicateKeyUpdate({ set: { taggedAt: now } });
    }
    await db
      .insert(viralVideoTagRuns)
      .values(batch.map(v => ({ candidateId: v.id, topicCount: result.get(v.id)?.length ?? 0, taggedAt: now })))
      .onDuplicateKeyUpdate({ set: { topicCount: sql`VALUES(topicCount)`, taggedAt: now } });
    totals.read += batch.length;
    totals.tagged += batch.filter(v => (result.get(v.id)?.length ?? 0) > 0).length;
  }
  if (totals.read > 0) console.info("[viralLibrary] tag_done", totals);
  return totals;
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
  return cleanProfileMatch(JSON.parse(stripCodeFences(text.text)), known);
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
      await db
        .insert(viralProfileTopicRuns)
        .values({ socialProfileId: p.socialProfileId, workspaceId: p.workspaceId, strategyHash: hash, matchedAt: now })
        .onDuplicateKeyUpdate({ set: { strategyHash: hash, workspaceId: p.workspaceId, matchedAt: now } });
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
