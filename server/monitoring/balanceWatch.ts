/**
 * Low-balance warnings: email the owner when a provider has about a day of
 * credit left, before it runs out (running out is alerted separately, where
 * the provider refuses a call).
 *
 * Only providers with a balance API are watched:
 * - ScrapeCreators: GET /v1/credit-balance (credits);
 * - Deepgram: GET /v1/projects/{id}/balances (US dollars).
 * Claude and OpenAI have no balance API: use auto-reload in their consoles.
 *
 * Runs hourly in the queue worker. The first reading of each UTC day is kept
 * in viral_processing_spend ("bs"/"bd" + day) so the daily burn can be
 * measured; days left = balance / average daily burn over the last 7 days.
 * Until 2 days are recorded, fixed floors apply instead. An unreadable or
 * unexpected answer is logged and skipped, never alerted. Never throws.
 */
import { and, desc, gte, like } from "drizzle-orm";
import { viralProcessingSpend } from "../../drizzle/viralLibrarySchema";
import { getDb } from "../db";
import { dailyCounterKey } from "../viralPosts/dailyCounter";
import { alertOwnerThrottled } from "./alerts";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type WatchedProvider = "scrapecreators" | "deepgram";

/** Warn when fewer than this many days are left (BALANCE_WARN_DAYS, default 1.5). */
export function warnDays(): number {
  const n = Number(process.env.BALANCE_WARN_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 1.5;
}

/** Before 2 days of history: warn below these. */
export const FALLBACK_FLOOR: Record<WatchedProvider, number> = { scrapecreators: 3_000, deepgram: 3 };

const UNIT: Record<WatchedProvider, string> = { scrapecreators: "credits", deepgram: "USD" };

/** The first number found under any of these keys (one level deep, or in a list). Pure; exported for tests. */
export function pickNumber(body: unknown, keys: string[]): number | null {
  if (body == null || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = pickNumber(v, keys);
      if (inner != null) return inner;
    }
  }
  return null;
}

/** Deepgram's balances list: the sum of "amount". Pure; exported for tests. */
export function deepgramBalanceFrom(body: unknown): number | null {
  const list = (body as { balances?: Array<{ amount?: unknown }> } | null)?.balances;
  if (!Array.isArray(list) || list.length === 0) return null;
  let total = 0;
  for (const b of list) {
    const n = Number(b?.amount);
    if (!Number.isFinite(n)) return null;
    total += n;
  }
  return total;
}

/**
 * Average daily use from first-of-day readings, newest first. Increases
 * (top-ups) are skipped. Null until two readings exist. Pure; exported for tests.
 */
export function dailyBurn(readingsNewestFirst: number[]): number | null {
  const drops: number[] = [];
  for (let i = 0; i + 1 < readingsNewestFirst.length; i++) {
    const used = readingsNewestFirst[i + 1] - readingsNewestFirst[i];
    if (used > 0) drops.push(used);
  }
  if (drops.length === 0) return null;
  return drops.reduce((a, b) => a + b, 0) / drops.length;
}

/** Should we warn, and with how many days left (null when estimated from the floor). Pure; exported for tests. */
export function lowBalanceVerdict(
  provider: WatchedProvider,
  balance: number,
  burnPerDay: number | null,
  warnBelowDays = 1.5
): { warn: boolean; daysLeft: number | null } {
  if (burnPerDay != null && burnPerDay > 0) {
    const daysLeft = balance / burnPerDay;
    return { warn: daysLeft < warnBelowDays, daysLeft };
  }
  return { warn: balance < FALLBACK_FLOOR[provider], daysLeft: null };
}

async function readScrapeCreators(): Promise<number | null> {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch("https://api.scrapecreators.com/v1/credit-balance", {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn("[balanceWatch] scrapecreators_unreadable", { status: res.status });
    return null;
  }
  const body = await res.json();
  const n = pickNumber(body, ["creditCount", "credit_count", "credits", "creditsRemaining", "credits_remaining", "balance"]);
  if (n == null) console.warn("[balanceWatch] scrapecreators_unexpected", { keys: Object.keys(body ?? {}) });
  return n;
}

async function readDeepgram(): Promise<number | null> {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return null;
  const headers = { Authorization: `Token ${key}` };
  let projectId = process.env.DEEPGRAM_PROJECT_ID?.trim();
  if (!projectId) {
    const res = await fetch("https://api.deepgram.com/v1/projects", { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn("[balanceWatch] deepgram_projects_unreadable", { status: res.status });
      return null;
    }
    const body = (await res.json()) as { projects?: Array<{ project_id?: string }> };
    projectId = body.projects?.[0]?.project_id;
    if (!projectId) return null;
  }
  const res = await fetch(`https://api.deepgram.com/v1/projects/${encodeURIComponent(projectId)}/balances`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn("[balanceWatch] deepgram_unreadable", { status: res.status });
    return null;
  }
  const body = await res.json();
  const n = deepgramBalanceFrom(body);
  if (n == null) console.warn("[balanceWatch] deepgram_unexpected", { keys: Object.keys(body ?? {}) });
  return n;
}

const PREFIX: Record<WatchedProvider, string> = { scrapecreators: "bs", deepgram: "bd" };

/** Keep the first reading of the day; return this provider's readings, newest first. */
async function recordAndHistory(db: Db, provider: WatchedProvider, balance: number): Promise<number[]> {
  const prefix = PREFIX[provider];
  const key = dailyCounterKey(prefix);
  // Credits fit the int column; dollars go in the decimal one.
  await db
    .insert(viralProcessingSpend)
    .values(
      provider === "scrapecreators"
        ? { day: key, usd: "0.0000", videos: Math.round(balance) }
        : { day: key, usd: balance.toFixed(4), videos: 0 }
    )
    .onDuplicateKeyUpdate({ set: { day: key } }); // keep the day's first reading
  const since = dailyCounterKey(prefix, new Date(Date.now() - 8 * 86_400_000));
  const rows = await db
    .select()
    .from(viralProcessingSpend)
    .where(and(like(viralProcessingSpend.day, `${prefix}%`), gte(viralProcessingSpend.day, since)))
    .orderBy(desc(viralProcessingSpend.day))
    .limit(8);
  const history = rows.map(r => (provider === "scrapecreators" ? r.videos : Number(r.usd)));
  // Today's stored value is the day's first reading; use the live balance as "now".
  return [balance, ...history.slice(1)];
}

function warningText(provider: WatchedProvider, balance: number, daysLeft: number | null): string {
  const name = provider === "scrapecreators" ? "ScrapeCreators" : "Deepgram";
  const amount = provider === "scrapecreators" ? `${Math.round(balance).toLocaleString("en-US")} credits` : `$${balance.toFixed(2)}`;
  const when =
    daysLeft != null
      ? `At the current pace that is about ${daysLeft < 1 ? `${Math.max(1, Math.round(daysLeft * 24))} hours` : `${daysLeft.toFixed(1)} days`} left.`
      : "That is below the safety floor.";
  return `${name} balance is low: ${amount} left. ${when} Top up now so SpyReels keeps working.`;
}

export async function checkProviderBalances(): Promise<Array<{ provider: WatchedProvider; balance: number | null; warned: boolean }>> {
  const out: Array<{ provider: WatchedProvider; balance: number | null; warned: boolean }> = [];
  const db = await getDb();
  const readers: Array<[WatchedProvider, () => Promise<number | null>]> = [
    ["scrapecreators", readScrapeCreators],
    ["deepgram", readDeepgram],
  ];
  for (const [provider, read] of readers) {
    let balance: number | null = null;
    try {
      balance = await read();
    } catch (err) {
      console.warn("[balanceWatch] read_failed", { provider, error: err instanceof Error ? err.message : String(err) });
    }
    if (balance == null) {
      out.push({ provider, balance: null, warned: false });
      continue;
    }
    let history: number[] = [balance];
    try {
      if (db) history = await recordAndHistory(db, provider, balance);
    } catch (err) {
      console.warn("[balanceWatch] history_failed", { provider, error: err instanceof Error ? err.message : String(err) });
    }
    const verdict = lowBalanceVerdict(provider, balance, dailyBurn(history), warnDays());
    console.info("[balanceWatch] balance", { provider, balance, unit: UNIT[provider], daysLeft: verdict.daysLeft });
    if (verdict.warn) {
      alertOwnerThrottled({ kind: `${provider}_low_balance`, message: warningText(provider, balance, verdict.daysLeft) });
    }
    out.push({ provider, balance, warned: verdict.warn });
  }
  return out;
}
