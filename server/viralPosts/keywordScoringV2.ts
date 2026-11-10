/**
 * Keyword scoring v2 (pure, disabled unless KEYWORD_SCORING=v2 or an
 * experiment arm asks for it). Three separate signals, two lanes.
 *
 * R  relevance 0-1 (gate)
 *    prior by label: relevant 0.85, plausible 0.55, disputed 0.40,
 *    irrelevant 0.10
 *    (+0.05 when TikTok suggested the phrase, capped at 1);
 *    observed on-topic rate o = (passed + 1) / (found + 2);
 *    R = (1 - w) * prior + w * o, with w = found / (found + 8).
 *    Eligible when R >= 0.35. So an irrelevant label blocks a phrase until
 *    real results prove otherwise; plausible phrases stay eligible.
 *
 * D  search-demand evidence 0-1, compared only within the same topic
 *    known Google volume > 0: mid-rank percentile of log10(1 + volume)
 *      among the topic's phrases with known volume > 0;
 *    Google volume 0: 0 (not rejected: relevance and results still count);
 *    unknown: 0.40 + 0.20 * autocompleteDemand/100, i.e. 0.40-0.60;
 *    +0.15 when TikTok suggested the phrase (social-search evidence);
 *    finally clamped to [0, 1].
 *
 * P  observed performance 0-1, from this phrase's own searches
 *    rate x = passed per search (on-topic videos that met the viral rule's
 *    pre-check when searched); m = platform median of x among searched
 *    phrases (at least 0.5);
 *    small-sample shrinkage toward m with 2 pseudo-searches:
 *      x_hat = (passed + 2m) / (searches + 2);
 *    P = x_hat / (x_hat + m)   (0.5 = platform median, bounded below 1).
 *
 * Lanes and scores
 *    explore: never searched, or back from a cooldown;
 *      score = 0.6 R + 0.4 D (minus 0.05 per past failure streak, max 0.15)
 *    exploit: searched at least once, not cooling down;
 *      score = 0.65 P + 0.30 R + 0.05 D
 *    A search of n >= 2 phrases takes max(1, round(0.2 n)) from explore
 *    (20%) and the rest from exploit; a single-phrase pick exploits. Either
 *    lane backfills the other.
 *
 * Unsuccessful searches, cooldown, parking (never permanent retirement)
 *    a search is successful for a phrase when passed > 0;
 *    k = consecutive unsuccessful searches (most recent first);
 *    cooldown after the last search = min(30, 2^k) days (2, 4, 8, 16, 30);
 *    after it, the phrase returns through the explore lane;
 *    parked for 60 days when it has 6+ searches, none successful, and the
 *    first was 21+ days ago; afterwards it returns through explore as well.
 */

export type V2Input = {
  id: number;
  phrase: string;
  demand: number; // 0-100, autocomplete-based (current bank value)
  searches: number;
  found: number;
  passed: number;
  googleVolume: number | null; // null = unknown
  tiktokSuggested: boolean;
  label: "relevant" | "plausible" | "disputed" | "irrelevant";
  /** Most recent first: passed count per search of this phrase (logged searches only). */
  recentPassed: number[];
  lastSearchedAt: Date | null;
  firstSearchedAt: Date | null;
};

export type V2Scored = V2Input & {
  R: number;
  D: number;
  P: number;
  eligible: boolean;
  lane: "explore" | "exploit" | "cooling" | "parked" | "blocked";
  score: number;
  failureStreak: number;
  availableAt: Date | null;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const DAY = 86_400_000;

export const V2 = {
  priorRelevant: 0.85,
  priorPlausible: 0.55,
  priorDisputed: 0.4,
  priorIrrelevant: 0.1,
  tiktokRelevanceBonus: 0.05,
  relevanceEvidence: 8,
  gate: 0.35,
  unknownBase: 0.4,
  unknownSpan: 0.2,
  tiktokDemandBonus: 0.15,
  pseudoSearches: 2,
  minMedian: 0.5,
  exploreShare: 0.2,
  maxCooldownDays: 30,
  parkAfterSearches: 6,
  parkAfterDays: 21,
  parkDays: 60,
} as const;

/** Relevance R (gate input). */
export function relevanceScore(x: Pick<V2Input, "label" | "tiktokSuggested" | "found" | "passed">): number {
  const base =
    x.label === "relevant" ? V2.priorRelevant : x.label === "irrelevant" ? V2.priorIrrelevant : x.label === "disputed" ? V2.priorDisputed : V2.priorPlausible;
  const prior = Math.min(1, base + (x.tiktokSuggested ? V2.tiktokRelevanceBonus : 0));
  const w = x.found / (x.found + V2.relevanceEvidence);
  const observed = (x.passed + 1) / (x.found + 2);
  return clamp01((1 - w) * prior + w * observed);
}

/** Demand D for every phrase of one topic (percentiles are computed within the topic). */
export function demandScores(rows: Array<Pick<V2Input, "googleVolume" | "demand" | "tiktokSuggested">>): number[] {
  const logs = rows.filter(r => r.googleVolume != null && r.googleVolume > 0).map(r => Math.log10(1 + (r.googleVolume as number)));
  const pct = (g: number) => {
    if (logs.length <= 1) return 0.5;
    const below = logs.filter(x => x < g).length;
    const equal = logs.filter(x => x === g).length;
    return (below + (equal - 1) / 2) / (logs.length - 1);
  };
  return rows.map(r => {
    let d: number;
    if (r.googleVolume == null) d = V2.unknownBase + V2.unknownSpan * clamp01(r.demand / 100);
    else if (r.googleVolume <= 0) d = 0;
    else d = pct(Math.log10(1 + r.googleVolume));
    if (r.tiktokSuggested) d += V2.tiktokDemandBonus;
    return clamp01(d);
  });
}

/** Platform median of passed-per-search among searched phrases (at least minMedian). */
export function platformMedian(rows: Array<Pick<V2Input, "searches" | "passed">>): number {
  const xs = rows.filter(r => r.searches > 0).map(r => r.passed / r.searches).sort((a, b) => a - b);
  if (xs.length === 0) return 1;
  return Math.max(V2.minMedian, xs[Math.floor(xs.length / 2)]);
}

/** Performance P, shrunk toward the platform median for small samples. */
export function performanceScore(x: Pick<V2Input, "searches" | "passed">, median: number): number {
  const xHat = (x.passed + V2.pseudoSearches * median) / (x.searches + V2.pseudoSearches);
  return xHat / (xHat + median);
}

export function failureStreak(recentPassed: number[]): number {
  let k = 0;
  for (const p of recentPassed) {
    if (p > 0) break;
    k += 1;
  }
  return k;
}

/** When the phrase may be searched again (null = now). */
export function availableAt(x: Pick<V2Input, "recentPassed" | "lastSearchedAt" | "firstSearchedAt" | "searches" | "passed">, now: Date): { at: Date | null; parked: boolean } {
  if (!x.lastSearchedAt) return { at: null, parked: false };
  const k = failureStreak(x.recentPassed);
  const neverSucceeded = x.passed === 0 && x.recentPassed.every(p => p === 0);
  if (
    neverSucceeded &&
    x.searches >= V2.parkAfterSearches &&
    x.firstSearchedAt &&
    now.getTime() - x.firstSearchedAt.getTime() >= V2.parkAfterDays * DAY
  ) {
    const until = new Date(x.lastSearchedAt.getTime() + V2.parkDays * DAY);
    return { at: until > now ? until : null, parked: until > now };
  }
  if (k === 0) return { at: null, parked: false };
  const until = new Date(x.lastSearchedAt.getTime() + Math.min(V2.maxCooldownDays, 2 ** k) * DAY);
  return { at: until > now ? until : null, parked: false };
}

/** Score every phrase of one topic and platform. */
export function scoreV2(rows: V2Input[], median: number, now = new Date()): V2Scored[] {
  const D = demandScores(rows);
  return rows.map((r, i) => {
    const R = relevanceScore(r);
    const P = r.searches > 0 ? performanceScore(r, median) : 0;
    const k = failureStreak(r.recentPassed);
    const avail = availableAt(r, now);
    const eligible = R >= V2.gate;
    let lane: V2Scored["lane"];
    let score = 0;
    if (!eligible) lane = "blocked";
    else if (avail.parked) lane = "parked";
    else if (avail.at) lane = "cooling";
    else if (r.searches === 0 || k > 0) {
      lane = "explore";
      score = 0.6 * R + 0.4 * D[i] - Math.min(0.15, 0.05 * k);
    } else {
      lane = "exploit";
      score = 0.65 * P + 0.3 * R + 0.05 * D[i];
    }
    return { ...r, R, D: D[i], P, eligible, lane, score, failureStreak: k, availableAt: avail.at };
  });
}

/** Pick n phrases: 20% explore (at least 1 when any), the rest exploit; backfill either way. */
export function pickV2(scored: V2Scored[], n: number): Array<V2Scored & { pickedLane: "explore" | "exploit" }> {
  if (n <= 0) return [];
  const explore = scored.filter(s => s.lane === "explore").sort((a, b) => b.score - a.score);
  const exploit = scored.filter(s => s.lane === "exploit").sort((a, b) => b.score - a.score);
  // 20% for exploration, at least one slot when 2+ phrases are picked; a single-phrase pick exploits (explores only as backfill).
  const exploreSlots = explore.length > 0 && n >= 2 ? Math.max(1, Math.round(n * V2.exploreShare)) : 0;
  const out: Array<V2Scored & { pickedLane: "explore" | "exploit" }> = [
    ...exploit.slice(0, n - Math.min(exploreSlots, n)).map(s => ({ ...s, pickedLane: "exploit" as const })),
    ...explore.slice(0, exploreSlots).map(s => ({ ...s, pickedLane: "explore" as const })),
  ];
  for (const s of [...exploit, ...explore]) {
    if (out.length >= n) break;
    if (!out.some(o => o.id === s.id)) out.push({ ...s, pickedLane: s.lane === "exploit" ? "exploit" : "explore" });
  }
  return out.slice(0, n);
}
