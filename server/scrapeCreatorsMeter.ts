/**
 * Opt-in meter for paid ScrapeCreators requests.
 *
 * The three integrations (server/instagram.ts, tiktok.ts, youtube.ts) call
 * meterScrapeCreatorsRequest() at the top of their scGet(). When no meter is
 * active (every existing flow today) it returns null and does nothing.
 *
 * Inside withScrapeCreatorsMeter() it counts every real request, including
 * the integrations' own internal retries, and stops requests once the budget
 * is used: scGet returns SCRAPECREATORS_BUDGET_STATUS without calling the
 * provider (same pattern as the creator-discovery call fuse).
 *
 * Uses AsyncLocalStorage so concurrent jobs never share a meter.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { alertOwnerThrottled } from "./monitoring/alerts";

export const SCRAPECREATORS_BUDGET_STATUS = 498;
/** Same convention as discovery and Viral Posts: 1 credit per request. */
export const SCRAPECREATORS_DEFAULT_USD_PER_CREDIT = 0.002;

export type ScrapeCreatorsMeterReport = {
  requests: number;
  blockedByBudget: number;
  byStatus: Record<string, number>;
  budget: number;
  estimatedUsd: number;
};

type MeterState = {
  budget: number;
  requests: number;
  blockedByBudget: number;
  byStatus: Record<string, number>;
};

const storage = new AsyncLocalStorage<MeterState>();

export function scrapeCreatorsUsdPerCredit(): number {
  const fromEnv = Number(process.env.SCRAPECREATORS_USD_PER_CREDIT);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : SCRAPECREATORS_DEFAULT_USD_PER_CREDIT;
}

/**
 * Called by each integration's scGet before the fetch. Returns a response to
 * short-circuit with when the budget is used up, otherwise null.
 */
export function meterScrapeCreatorsRequest(): {
  status: number;
  data: { error: string };
} | null {
  const state = storage.getStore();
  if (!state) return null;
  if (state.requests >= state.budget) {
    state.blockedByBudget++;
    return {
      status: SCRAPECREATORS_BUDGET_STATUS,
      data: { error: "scrapecreators_request_budget" },
    };
  }
  state.requests++;
  return null;
}

// ─── Out-of-credits safety stop ──────────────────────────────────────
// ScrapeCreators answers 402 when the account has no credits left. Background
// work (library fill, pre-research) checks scrapeCreatorsOutOfCredits() and
// pauses instead of recording empty results; the owner gets one alert.

/** How long background work pauses after a 402 before trying again. */
export const SCRAPECREATORS_CREDIT_PAUSE_MS = 30 * 60_000;
let lastOutOfCreditsAt: number | null = null;

/** Remember a provider answer: 402 starts the pause, any success ends it. */
export function noteScrapeCreatorsStatus(status: number, now = Date.now()): void {
  if (status === 402) {
    const first = lastOutOfCreditsAt == null;
    lastOutOfCreditsAt = now;
    if (first) {
      alertOwnerThrottled({
        kind: "scrapecreators_out_of_credits",
        message:
          "ScrapeCreators is out of credits (HTTP 402). Creator research fails and the library fill and pre-research are paused until credits are topped up.",
      });
    }
  } else if (status >= 200 && status < 300) {
    lastOutOfCreditsAt = null;
  }
}

/** True while background work should not spend provider calls. */
export function scrapeCreatorsOutOfCredits(now = Date.now()): boolean {
  return lastOutOfCreditsAt != null && now - lastOutOfCreditsAt < SCRAPECREATORS_CREDIT_PAUSE_MS;
}

/** True when a 402 was seen at or after `since` (ms): that work's results are not real. */
export function scrapeCreatorsOutOfCreditsSince(since: number): boolean {
  return lastOutOfCreditsAt != null && lastOutOfCreditsAt >= since;
}

export function resetScrapeCreatorsCreditStateForTests(): void {
  lastOutOfCreditsAt = null;
}

/** Called by each integration's scGet after the provider answered (or timed out). */
export function meterScrapeCreatorsResponse(status: number): void {
  noteScrapeCreatorsStatus(status);
  const state = storage.getStore();
  if (!state) return;
  const key = String(status);
  state.byStatus[key] = (state.byStatus[key] ?? 0) + 1;
}

export async function withScrapeCreatorsMeter<T>(
  budget: number,
  fn: () => Promise<T>
): Promise<
  | { result: T; report: ScrapeCreatorsMeterReport }
  | { error: unknown; report: ScrapeCreatorsMeterReport }
> {
  const state: MeterState = {
    budget,
    requests: 0,
    blockedByBudget: 0,
    byStatus: {},
  };
  const report = (): ScrapeCreatorsMeterReport => ({
    requests: state.requests,
    blockedByBudget: state.blockedByBudget,
    byStatus: { ...state.byStatus },
    budget,
    estimatedUsd:
      Math.round(state.requests * scrapeCreatorsUsdPerCredit() * 10_000) /
      10_000,
  });
  try {
    const result = await storage.run(state, fn);
    return { result, report: report() };
  } catch (error) {
    return { error, report: report() };
  }
}
