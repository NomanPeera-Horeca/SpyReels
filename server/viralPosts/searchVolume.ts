/**
 * Google monthly search volume for keyword-bank phrases (DataForSEO, Google
 * Ads data). Autocomplete tells us a phrase is searched; this tells us how
 * much: "meal prep for beginners" ~ 12,100 searches a month in the US.
 *
 * - One DataForSEO task holds up to 1,000 phrases and costs about $0.09
 *   (live mode), so the whole bank (~20k phrases) is under $2; each phrase is
 *   re-checked after 30 days.
 * - The volume raises a phrase's demand score (never lowers it), so phrases
 *   people search a lot are tried first and shown first on Home.
 * - The number is Google's, labelled as such; it is not TikTok or Instagram
 *   search volume.
 *
 * Stored in viral_keyword_volumes (migration 0113): one row per phrase and
 * source (google, youtube, tiktok, instagram, tiktok_ads), with the provider
 * and the provider's own metric name, so estimates from different platforms
 * are never mixed. This file fills the Google rows.
 *
 * Needs DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (API credentials from the
 * DataForSEO dashboard) and migration drizzle/0113_keyword_volumes.sql.
 * When something is missing it logs why once and does nothing.
 *
 * Monthly cap DATAFORSEO_MONTHLY_USD (default $5), enforced in code: before
 * each request the estimated cost is reserved with one conditional UPDATE
 * (usd + estimate <= cap), so overlapping workers cannot both pass. After
 * the response the reservation is replaced by DataForSEO's reported "cost".
 * Timeouts, network errors and unreadable responses keep the full
 * reservation (treated as charged). At the cap, lookups stop until the next
 * UTC month; saved volumes keep working. Never throws.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { isKeywordsReady } from "./keywords";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const TASK_USD = 0.09;
const MAX_PER_TASK = 1000;
const RECHECK_DAYS = 30;

let tableReady: { ok: boolean; at: number } | null = null;

/** True once migration 0113 created viral_keyword_volumes. Cached for 10 minutes. */
export async function isVolumeReady(db: Db): Promise<boolean> {
  if (tableReady && (tableReady.ok || Date.now() - tableReady.at < 600_000)) return tableReady.ok;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viral_keyword_volumes'`
    )) as unknown as [Array<{ n: number | string }>];
    tableReady = { ok: Number(rows?.[0]?.n ?? 0) === 1, at: Date.now() };
  } catch {
    tableReady = { ok: false, at: Date.now() };
  }
  return tableReady.ok;
}

/** Log a skip reason once per process (until it changes), so a silent no-op is visible. */
let lastSkip: string | null = null;
function noteSkip(reason: string): void {
  if (reason === lastSkip) return;
  lastSkip = reason;
  console.info("[viralLibrary] search_volume_skipped", { reason });
}

export function dataForSeoConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim());
}

function locationCode(): number {
  return Number(process.env.DATAFORSEO_LOCATION_CODE) || 2840; // United States
}

/** Stored location label: "US" for the default, else the DataForSEO location code. */
function locationLabel(): string {
  return locationCode() === 2840 ? "US" : String(locationCode());
}

function monthlyBudgetUsd(): number {
  const n = Number(process.env.DATAFORSEO_MONTHLY_USD);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/** Spend key per month, e.g. "df202611" (fits viral_processing_spend.day). Pure; exported for tests. */
export function volumeMonthKey(d = new Date()): string {
  return `df${d.toISOString().slice(0, 7).replace("-", "")}`;
}

/**
 * Demand 0-100 from monthly searches, on a log scale:
 * 10 -> 30, 100 -> 45, 1k -> 60, 10k -> 75, 100k -> 90, 1M+ -> 100.
 * Pure; exported for tests.
 */
export function volumeDemand(volume: number | null | undefined): number {
  if (volume == null || !Number.isFinite(volume) || volume <= 0) return 0;
  return Math.max(15, Math.min(100, Math.round(15 + 15 * Math.log10(volume))));
}

/** Google Ads accepts up to 80 characters and 10 words. Pure; exported for tests. */
export function acceptedByGoogleAds(phrase: string): boolean {
  const p = phrase.trim();
  return p.length > 0 && p.length <= 80 && p.split(/\s+/).length <= 10 && !/[!@%^()={};~`<>?\\|*]/.test(p);
}

/** {keyword -> monthly searches} from a DataForSEO search_volume response. Pure; exported for tests. */
export function parseSearchVolumes(body: unknown): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const tasks = (body as { tasks?: Array<{ status_code?: number; result?: unknown }> })?.tasks ?? [];
  for (const task of tasks) {
    if (!Array.isArray(task.result)) continue;
    for (const r of task.result as Array<{ keyword?: unknown; search_volume?: unknown }>) {
      if (typeof r.keyword !== "string") continue;
      const v = typeof r.search_volume === "number" ? r.search_volume : null;
      out.set(r.keyword.toLowerCase(), v);
    }
  }
  return out;
}

/** DataForSEO's reported charge for a response ("cost" at the top), or null when absent. Pure; exported for tests. */
export function reportedCost(body: unknown): number | null {
  const c = (body as { cost?: unknown } | null)?.cost;
  return typeof c === "number" && Number.isFinite(c) && c >= 0 ? c : null;
}

/**
 * Add `usd` to this month's spend only if the total stays within `cap`.
 * One conditional UPDATE, so concurrent workers cannot both pass the check.
 * True when reserved.
 */
export async function reserveSpend(db: Db, usd: number, cap: number): Promise<boolean> {
  const key = volumeMonthKey();
  await db.execute(sql`INSERT IGNORE INTO viral_processing_spend (day, usd, videos) VALUES (${key}, 0, 0)`);
  const [res] = (await db.execute(sql`
    UPDATE viral_processing_spend SET usd = usd + ${usd} WHERE day = ${key} AND usd + ${usd} <= ${cap}
  `)) as unknown as [{ affectedRows?: number }];
  return (res?.affectedRows ?? 0) === 1;
}

/** Replace the reserved estimate with the reported cost (and count the phrases). */
async function reconcileSpend(db: Db, reserved: number, actual: number, phrases: number): Promise<void> {
  await db.execute(sql`
    UPDATE viral_processing_spend SET usd = GREATEST(0, usd - ${reserved} + ${actual}), videos = videos + ${phrases}
    WHERE day = ${volumeMonthKey()}
  `);
}


/**
 * Look up Google volume for up to 1,000 phrases that have none yet (or a
 * 30+ day old one), highest demand first. One DataForSEO task per call.
 */
export async function refreshSearchVolumes(): Promise<{
  checked: number;
  withVolume: number;
  costUsd: number;
  skipped?: "not_configured" | "not_ready" | "budget_reached" | "none_due" | "request_failed";
}> {
  const out = { checked: 0, withVolume: 0, costUsd: 0 };
  if (!dataForSeoConfigured()) {
    noteSkip("not_configured: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing");
    return { ...out, skipped: "not_configured" };
  }
  const db = await getDb();
  if (!db || !(await isKeywordsReady(db)) || !(await isVolumeReady(db))) {
    noteSkip("not_ready: run migration 0113 (viral_keyword_volumes)");
    return { ...out, skipped: "not_ready" };
  }
  try {
    const location = locationLabel();
    const [due] = (await db.execute(sql`
      SELECT k.phrase AS phrase, MAX(k.demand) AS demand
      FROM viral_keywords k
      LEFT JOIN viral_keyword_volumes v
        ON v.phrase = k.phrase AND v.source = 'google' AND v.location = ${location}
      WHERE k.retired = 0 AND (v.checkedAt IS NULL OR v.checkedAt < (NOW() - INTERVAL ${RECHECK_DAYS} DAY))
      GROUP BY k.phrase
      ORDER BY MAX(k.demand) DESC
      LIMIT ${MAX_PER_TASK * 2}
    `)) as unknown as [Array<{ phrase: string }>];
    const phrases = [...new Set((due ?? []).map(r => r.phrase).filter(acceptedByGoogleAds))].slice(0, MAX_PER_TASK);
    if (phrases.length === 0) {
      noteSkip("none_due: every phrase checked in the last 30 days");
      return { ...out, skipped: "none_due" };
    }
    // Reserve the estimated cost first, atomically against the monthly cap
    // (two workers cannot both pass), then reconcile with the reported cost.
    if (!(await reserveSpend(db, TASK_USD, monthlyBudgetUsd()))) {
      noteSkip("budget_reached: DATAFORSEO_MONTHLY_USD");
      return { ...out, skipped: "budget_reached" };
    }
    lastSkip = null;

    const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN!.trim()}:${process.env.DATAFORSEO_PASSWORD!.trim()}`).toString("base64");
    let body: unknown = null;
    let status = 0;
    try {
      const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
        body: JSON.stringify([
          {
            keywords: phrases,
            location_code: locationCode(),
            language_code: process.env.DATAFORSEO_LANGUAGE_CODE?.trim() || "en",
          },
        ]),
        signal: AbortSignal.timeout(120_000),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch {
      // Timeout or network error after sending: it may have been charged. Keep the reservation.
    }
    const actual = reportedCost(body);
    if (actual != null) await reconcileSpend(db, TASK_USD, actual, phrases.length);
    out.costUsd = actual ?? TASK_USD;
    if (status !== 200 || body == null) {
      console.warn("[viralLibrary] search_volume_failed", { status, bookedUsd: out.costUsd });
      return { ...out, skipped: "request_failed" };
    }
    const volumes = parseSearchVolumes(body);
    for (const phrase of phrases) {
      const v = volumes.get(phrase.toLowerCase()) ?? null;
      await db.execute(sql`
        INSERT INTO viral_keyword_volumes (phrase, source, location, volume, provider, metric, checkedAt)
        VALUES (${phrase}, 'google', ${location}, ${v}, 'dataforseo', 'google_ads_avg_monthly_searches', NOW())
        ON DUPLICATE KEY UPDATE volume = VALUES(volume), provider = VALUES(provider), metric = VALUES(metric), checkedAt = NOW()
      `);
      const demand = volumeDemand(v);
      if (demand > 0) {
        await db.execute(sql`UPDATE viral_keywords SET demand = GREATEST(demand, ${demand}) WHERE phrase = ${phrase}`);
      }
      out.checked += 1;
      if (v != null && v > 0) out.withVolume += 1;
    }
    console.info("[viralLibrary] search_volume_done", out);
    return out;
  } catch (err) {
    console.warn("[viralLibrary] search_volume_failed", { error: err instanceof Error ? err.message : String(err) });
    return out;
  }
}
