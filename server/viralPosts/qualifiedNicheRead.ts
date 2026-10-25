/**
 * Read-only niche evidence for onboarding and Home.
 *
 * Uses pools and featured supply Viral Posts already stored. It does not
 * discover posts, refresh pools, score a feed, or change Home ranking.
 * Home ranking stays in indexedHomeSelection. Call this when a feature needs
 * the same qualified supply without assembling Today's Picks.
 */
import { deriveHook, inferFormat } from "./candidateAdapter";
import { buildPoolKey } from "./constants";
import { passesIndexedViralQualification } from "./indexedQualification";
import {
  chooseIndexedHomeSpecs,
  indexedHomePoolSpecChoices,
  remainingIndexedNichePools,
} from "./browseService";
import {
  findExistingPools,
  listPoolsForNiche,
  loadPoolCandidatesForAssembly,
  type ViralPoolEnsureSpec,
} from "./poolRepository";
import {
  isAnyViralPostsPlatformEnabled,
  isViralPostsInstagramEnabled,
  isViralPostsLive,
  isViralPostsTiktokEnabled,
  isViralPostsYoutubeEnabled,
} from "./featureFlag";
import {
  loadSimilarCreatorSupply,
  type SimilarCreatorSupplyResult,
} from "./similarCreatorSupply";

export const NICHE_READ_TIMEOUT_MS = 1_200;
const MAX_EXAMPLES = 8;
const MAX_PER_CREATOR = 2;

export type QualifiedNicheExample = {
  platform: "instagram" | "tiktok" | "youtube";
  sourceId: string;
  creatorHandle: string | null;
  /** First line of the caption. Not a predicted result. */
  hook: string | null;
  format: string | null;
  caption: string | null;
  /** Provider view count. Null when the row has none. Never an estimate. */
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  niche: string | null;
  pillar: string | null;
  qualification: "indexed_pool" | "similar_featured";
};

export type PromptNicheExample = { hook: string; format: string | null };

type SourceRow = {
  platform: string;
  sourceId: string;
  creatorHandle: string | null;
  caption: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  creatorFollowers: number | null;
  publishedAt: string | null;
  niche: string | null;
  pillar: string | null;
  qualification: QualifiedNicheExample["qualification"];
};

export type QualifiedNicheReadDeps = {
  choices: typeof indexedHomePoolSpecChoices;
  choose: typeof chooseIndexedHomeSpecs;
  findPools: (specs: ViralPoolEnsureSpec[]) => Promise<Array<{ id: number; poolKey: string }>>;
  loadCandidates: typeof loadPoolCandidatesForAssembly;
  /** Other existing pools for the niche. Omitted in tests that do not widen. */
  listNichePools?: (niche: string) => Promise<Array<{ id: number; poolKey: string }>>;
  /** Same gate as the Viral Posts router. Omitted only by tests that inject rows. */
  accessAllowed?: () => boolean;
  loadSimilar: (args: {
    nicheNames: string[];
    excludeHandles: string[];
    maxAgeHours: number;
  }) => Promise<SimilarCreatorSupplyResult>;
};

/** Same switch the Viral Posts router uses before it will read the catalog. */
export function viralPostsCatalogReadable(): boolean {
  return isViralPostsLive && isAnyViralPostsPlatformEnabled;
}

const defaultDeps: QualifiedNicheReadDeps = {
  choices: indexedHomePoolSpecChoices,
  choose: chooseIndexedHomeSpecs,
  findPools: findExistingPools,
  loadCandidates: loadPoolCandidatesForAssembly,
  accessAllowed: viralPostsCatalogReadable,
  listNichePools: async niche => {
    const platforms = [
      isViralPostsInstagramEnabled ? "instagram" : "",
      isViralPostsTiktokEnabled ? "tiktok" : "",
      isViralPostsYoutubeEnabled ? "youtube" : "",
    ].filter(platform => platform.length > 0);
    const rows = await listPoolsForNiche(niche, platforms);
    return rows.map(row => ({ id: row.id, poolKey: row.poolKey }));
  },
  loadSimilar: args =>
    loadSimilarCreatorSupply({
      nicheNames: args.nicheNames,
      excludeHandles: args.excludeHandles,
      maxAgeHours: args.maxAgeHours,
    }),
};

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^@/, "");
}

function asPlatform(value: string): QualifiedNicheExample["platform"] {
  if (value === "tiktok" || value === "youtube") return value;
  return "instagram";
}

/**
 * Keep rows that already pass the Viral Posts qualification gate.
 * Order by observed views only to choose a small sample. Nothing is written back.
 */
export function selectQualifiedNicheExamples(input: {
  rows: SourceRow[];
  excludeHandles?: string[];
  limit?: number;
}): QualifiedNicheExample[] {
  const excluded = new Set(
    (input.excludeHandles ?? []).map(normalizeHandle).filter(Boolean)
  );
  const seen = new Set<string>();
  const qualified: SourceRow[] = [];
  for (const row of input.rows) {
    if (!row.sourceId.trim()) continue;
    if (
      !passesIndexedViralQualification({
        platform: row.platform,
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        creatorFollowers: row.creatorFollowers,
      })
    ) {
      continue;
    }
    const handle = normalizeHandle(row.creatorHandle);
    if (handle && excluded.has(handle)) continue;
    const key = `${asPlatform(row.platform)}:${row.sourceId.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    qualified.push(row);
  }
  qualified.sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || a.sourceId.localeCompare(b.sourceId));
  const perCreator = new Map<string, number>();
  const limit = Math.min(Math.max(input.limit ?? MAX_EXAMPLES, 0), MAX_EXAMPLES);
  const out: QualifiedNicheExample[] = [];
  for (const row of qualified) {
    const creatorKey = normalizeHandle(row.creatorHandle) || row.sourceId;
    const count = perCreator.get(creatorKey) ?? 0;
    if (count >= MAX_PER_CREATOR) continue;
    const caption = (row.caption ?? "").replace(/\s+/g, " ").trim();
    perCreator.set(creatorKey, count + 1);
    out.push({
      platform: asPlatform(row.platform),
      sourceId: row.sourceId.trim(),
      creatorHandle: row.creatorHandle,
      hook: caption ? deriveHook(caption) : null,
      format: inferFormat(caption),
      caption: caption ? caption.slice(0, 180) : null,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      publishedAt: row.publishedAt,
      niche: row.niche,
      pillar: row.pillar,
      qualification: row.qualification,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Hooks and formats only. Digits are removed so a view count cannot enter a prompt. */
export function toPromptNicheExamples(rows: QualifiedNicheExample[]): PromptNicheExample[] {
  const out: PromptNicheExample[] = [];
  for (const row of rows) {
    const hook = (row.hook ?? "")
      .replace(/\d[\d,.]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (hook.length < 8) continue;
    out.push({ hook: hook.slice(0, 140), format: row.format });
  }
  return out;
}

export function readWithin<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

export async function readQualifiedNicheExamples(
  args: {
    nicheText: string;
    pillarTitles: string[];
    excludeHandles?: string[];
  },
  deps: QualifiedNicheReadDeps = defaultDeps
): Promise<QualifiedNicheExample[]> {
  if (deps.accessAllowed && !deps.accessAllowed()) return [];
  const nicheText = args.nicheText.trim();
  if (!nicheText) return [];
  const choices = deps.choices({
    nicheText,
    confirmedPillars: args.pillarTitles.filter(title => title.trim()).slice(0, 6),
  });
  const specs = [...choices.confirmedSpecs, ...choices.fallbackSpecs];
  const pools = specs.length ? await deps.findPools(specs) : [];
  const existingKeys = new Set(pools.map(pool => pool.poolKey));
  const chosen = deps.choose({
    confirmedSpecs: choices.confirmedSpecs,
    fallbackSpecs: choices.fallbackSpecs,
    existingKeys,
  });
  const chosenKeys = new Set(
    chosen.specs.map(spec =>
      buildPoolKey({ platform: spec.platform, niche: spec.niche, pillar: spec.pillar })
    )
  );
  const poolIds = pools.filter(pool => chosenKeys.has(pool.poolKey)).map(pool => pool.id);
  const loaded = poolIds.length
    ? await deps.loadCandidates({ poolIds, limit: 40 })
    : [];
  const fromPools: SourceRow[] = loaded.map(row => ({
    platform: row.candidate.platform,
    sourceId: row.candidate.sourceId,
    creatorHandle: row.candidate.creatorHandle,
    caption: row.candidate.caption,
    views: row.candidate.views,
    likes: row.candidate.likes,
    comments: row.candidate.comments,
    creatorFollowers: row.candidate.creatorFollowers,
    publishedAt: row.candidate.publishedAt ? row.candidate.publishedAt.toISOString() : null,
    niche: choices.niche,
    pillar: row.primaryPillar,
    qualification: "indexed_pool",
  }));
  let examples = selectQualifiedNicheExamples({
    rows: fromPools,
    excludeHandles: args.excludeHandles,
  });
  if (examples.length < 3 && deps.listNichePools) {
    const nichePools = await deps.listNichePools(choices.niche);
    const widerIds = remainingIndexedNichePools(chosenKeys, nichePools)
      .map(pool => pool.id)
      .filter(id => !poolIds.includes(id));
    if (widerIds.length > 0) {
      const more = await deps.loadCandidates({ poolIds: widerIds, limit: 40 });
      for (const row of more) {
        fromPools.push({
          platform: row.candidate.platform,
          sourceId: row.candidate.sourceId,
          creatorHandle: row.candidate.creatorHandle,
          caption: row.candidate.caption,
          views: row.candidate.views,
          likes: row.candidate.likes,
          comments: row.candidate.comments,
          creatorFollowers: row.candidate.creatorFollowers,
          publishedAt: row.candidate.publishedAt ? row.candidate.publishedAt.toISOString() : null,
          niche: choices.niche,
          pillar: row.primaryPillar,
          qualification: "indexed_pool",
        });
      }
      examples = selectQualifiedNicheExamples({
        rows: fromPools,
        excludeHandles: args.excludeHandles,
      });
    }
  }
  if (examples.length < 3) {
    const similar = await deps.loadSimilar({
      nicheNames: [choices.niche],
      excludeHandles: args.excludeHandles ?? [],
      maxAgeHours: 90 * 24,
    });
    const extra: SourceRow[] = similar.reels.map(reel => ({
      platform: "instagram",
      sourceId: reel.sourceId,
      creatorHandle: reel.creatorHandle,
      caption: reel.caption,
      views: reel.views,
      likes: reel.likes,
      comments: reel.comments,
      creatorFollowers: reel.creatorFollowers,
      publishedAt: reel.publishedAt ? reel.publishedAt.toISOString() : null,
      niche: reel.nicheName,
      pillar: null,
      qualification: "similar_featured",
    }));
    examples = selectQualifiedNicheExamples({
      rows: [...fromPools, ...extra],
      excludeHandles: args.excludeHandles,
    });
  }
  return examples;
}

/** Bounded read for prompts. Empty on timeout or failure. Never throws. */
export async function loadPromptNicheExamples(input: {
  nicheText: string;
  pillarTitles: string[];
  excludeHandles?: string[];
  timeoutMs?: number;
}): Promise<PromptNicheExample[]> {
  try {
    const rows = await readWithin(
      readQualifiedNicheExamples(input),
      input.timeoutMs ?? NICHE_READ_TIMEOUT_MS,
      []
    );
    return toPromptNicheExamples(rows);
  } catch {
    return [];
  }
}
