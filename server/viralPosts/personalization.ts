import { desc, eq } from "drizzle-orm";
import {
  creatorDiscoverySearches,
  type CollectedReel,
  type ScrapeJob,
} from "../../drizzle/schema";
import {
  normalizeViralPostPlatform,
  viralPostCanonicalKey,
} from "@shared/viralPosts";
import {
  getCollectedReelsByWorkspace,
  getDb,
  getOnboardingState,
  getScrapeJobsByWorkspace,
} from "../db";
import { getPersonalWorkspaceId } from "../personalWorkspace";
import {
  deriveHook,
  extractHashtags,
  inferFormatFromCopy,
  type AdaptedCandidate,
} from "./candidateAdapter";
import { VIRAL_POOL_DEFAULTS } from "./constants";
import { classifyCandidatePillars } from "./pillarClassify";
import {
  ageHoursFromPublished,
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
} from "./scoring";
import {
  loadSimilarCreatorSupply,
  type SimilarFeaturedReelSupply,
} from "./similarCreatorSupply";

export type ViralPersonalizationSignals = {
  /** Explicitly chosen/researched/collected creators: strongest creator affinity. */
  strongCreatorHandles: Set<string>;
  /** Creators surfaced highly in Creator Discovery, but not explicitly chosen. */
  radarCreatorHandles: Set<string>;
  /** Adjacent Featured creators inferred from known niche/creator signals. */
  similarCreatorHandles: Set<string>;
  /** Creative formats inferred from reels the user intentionally collected. */
  preferredFormats: Map<string, number>;
  /** Bounded topical affinity terms from Collected + Creator Discovery context. */
  topicTerms: Map<string, number>;
  /** Exact public posts the user intentionally collected. */
  collectedSourceKeys: Set<string>;
};

export type ViralPersonalizationContext = {
  signals: ViralPersonalizationSignals;
  /** Public reel metadata eligible only for this user's candidate assembly. */
  personalCandidates: AdaptedCandidate[];
  counts: {
    collectedRead: number;
    collectedCandidates: number;
    explicitCreatorHandles: number;
    radarSearchesRead: number;
    radarCreatorsRead: number;
    radarCandidates: number;
    similarNicheSlugs: number;
    similarCreatorsRead: number;
    similarCandidates: number;
  };
};

const MAX_COLLECTED_READ = 30;
const MAX_COLLECTED_CANDIDATES = 12;
const MAX_RADAR_SEARCHES = 3;
const MAX_RADAR_CREATORS_PER_SEARCH = 6;
const MAX_RADAR_CANDIDATES = 12;
const MAX_TOPIC_TERMS = 48;
const MAX_PERSONAL_RELEVANCE_BOOST = 30;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "being",
  "business",
  "could",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "other",
  "reels",
  "really",
  "should",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "video",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = (value || "").trim().toLowerCase().replace(/^@/, "");
  return normalized || null;
}

function normalizePlatform(value: string | null | undefined): AdaptedCandidate["platform"] {
  return normalizeViralPostPlatform(value);
}

export function canonicalCandidateKey(
  candidate: Pick<AdaptedCandidate, "platform" | "sourceId"> | {
    platform?: string | null;
    sourceId: string;
  }
): string {
  return viralPostCanonicalKey(candidate.platform, candidate.sourceId);
}

function createEmptySignals(): ViralPersonalizationSignals {
  return {
    strongCreatorHandles: new Set<string>(),
    radarCreatorHandles: new Set<string>(),
    similarCreatorHandles: new Set<string>(),
    preferredFormats: new Map<string, number>(),
    topicTerms: new Map<string, number>(),
    collectedSourceKeys: new Set<string>(),
  };
}

function addFormat(signals: ViralPersonalizationSignals, value: string | null): void {
  if (!value) return;
  signals.preferredFormats.set(value, (signals.preferredFormats.get(value) ?? 0) + 1);
}

function meaningfulTerms(text: string | null | undefined): string[] {
  if (!text) return [];
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (term) =>
            term.length >= 4 &&
            term.length <= 24 &&
            !STOP_WORDS.has(term) &&
            !/^\d+$/.test(term)
        )
    ),
  ].slice(0, 12);
}

function addTopicTerms(
  signals: ViralPersonalizationSignals,
  text: string | null | undefined,
  weight: number
): void {
  for (const term of meaningfulTerms(text)) {
    signals.topicTerms.set(term, Math.min(6, (signals.topicTerms.get(term) ?? 0) + weight));
  }
  if (signals.topicTerms.size <= MAX_TOPIC_TERMS) return;
  const strongest = [...signals.topicTerms.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TOPIC_TERMS);
  signals.topicTerms.clear();
  for (const [term, termWeight] of strongest) signals.topicTerms.set(term, termWeight);
}

function finitePositive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function adaptPublicMetadata(args: {
  platform: AdaptedCandidate["platform"];
  sourceId: string;
  sourceUrl: string;
  creatorHandle?: string | null;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  creatorFollowers?: number | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  caption?: string | null;
  publishedAt?: Date | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  activePillars: string[];
  fallbackNiche: string;
  relevanceLabel: string;
  relevanceReason: string;
  relevanceHint: number;
  now: Date;
}): AdaptedCandidate {
  const caption = args.caption || "";
  const hook = deriveHook(caption);
  const hashtags = extractHashtags(caption);
  const classification = classifyCandidatePillars({
    caption,
    hook,
    hashtags,
    activePillars: args.activePillars,
    fallbackNiche: args.fallbackNiche,
  });
  const followers = finitePositive(args.creatorFollowers);
  const views = finitePositive(args.views);
  const likes = args.likes != null && Number.isFinite(args.likes) && args.likes >= 0
    ? args.likes
    : null;
  const comments =
    args.comments != null && Number.isFinite(args.comments) && args.comments >= 0
      ? args.comments
      : null;
  const ageHours = ageHoursFromPublished(args.publishedAt ?? null, args.now);
  const reachMultiplier = computeReachMultiplier(views, followers);
  const engagementRate = computeEngagementRate({
    views,
    likes,
    comments,
    shares: null,
    saves: null,
  });
  const viewsPerHour = computeViewsPerHour(views, ageHours);
  const handle = normalizeHandle(args.creatorHandle);

  return {
    platform: args.platform,
    sourceId: args.sourceId,
    sourceUrl: args.sourceUrl,
    creatorId: handle,
    creatorName: args.creatorName?.trim() || handle || `${args.platform} creator`,
    creatorHandle: handle ? `@${handle}` : null,
    creatorAvatarUrl: args.creatorAvatarUrl || null,
    creatorFollowers: followers,
    thumbnailUrl: args.thumbnailUrl || null,
    videoUrl: args.videoUrl || null,
    caption: caption || null,
    transcript: null,
    hashtags,
    publishedAt: args.publishedAt ?? null,
    views,
    likes,
    comments,
    shares: null,
    saves: null,
    reachMultiplier,
    engagementRate,
    viewsPerHour,
    trendStatus: classifyTrendStatus({
      reachMultiplier,
      viewsPerHour,
      ageHours,
      views,
    }),
    relevanceHint: args.relevanceHint,
    contentPillar: classification.primaryPillar,
    pillarConfidence: classification.confidence,
    relevanceLabel: args.relevanceLabel,
    relevanceReason: args.relevanceReason,
    hook,
    format: inferFormatFromCopy({ caption, hook }),
    hashtagKey: hashtags[0] || null,
    rawProviderPayload: { source: "existing_public_metadata" },
  };
}

function collectedCandidate(
  reel: CollectedReel,
  args: { pillars: string[]; niche: string; now: Date }
): AdaptedCandidate | null {
  const sourceId = reel.shortcode?.trim();
  if (!sourceId || reel.status !== "ready") return null;
  const platform = normalizePlatform(reel.platform);
  const publishedAt = reel.postedAt ?? null;
  const maxAgeMs =
    VIRAL_POOL_DEFAULTS.assemblyCandidateMaxAgeHours * 60 * 60 * 1000;
  if (
    publishedAt &&
    !Number.isNaN(publishedAt.getTime()) &&
    args.now.getTime() - publishedAt.getTime() > maxAgeMs
  ) {
    return null;
  }

  return adaptPublicMetadata({
    platform,
    sourceId,
    sourceUrl: reel.reelUrl,
    creatorHandle: reel.ownerUsername,
    creatorName: reel.ownerFullName,
    creatorAvatarUrl: reel.ownerProfilePicUrl,
    creatorFollowers: reel.ownerFollowerCount,
    thumbnailUrl: reel.thumbnailUrl,
    videoUrl: reel.videoUrl,
    caption: reel.caption,
    publishedAt,
    views: reel.viewCount,
    likes: reel.likeCount,
    comments: reel.commentCount,
    activePillars: args.pillars,
    fallbackNiche: args.niche,
    relevanceLabel: "From your Collected reels",
    relevanceReason:
      "You intentionally collected this public post; SpyReels still requires it to pass virality, remakeability, diversity, and quality checks.",
    relevanceHint: 78,
    now: args.now,
  });
}

function radarCandidate(args: {
  creator: NonNullable<
    Awaited<ReturnType<typeof loadRecentRadarSearches>>[number]["resultJson"]
  >["rankedCreators"][number];
  pillars: string[];
  niche: string;
  now: Date;
}): AdaptedCandidate | null {
  const { creator } = args;
  if (!creator.peerKeep) return null;
  const sourceId = creator.bestReel.shortcode?.trim();
  if (!sourceId) return null;
  return adaptPublicMetadata({
    platform: "instagram",
    sourceId,
    sourceUrl:
      creator.bestReel.reelUrl ||
      `https://www.instagram.com/reel/${sourceId}/`,
    creatorHandle: creator.owner.username,
    creatorName: creator.owner.fullName,
    creatorAvatarUrl: creator.owner.profilePicUrl,
    creatorFollowers: creator.owner.followers,
    thumbnailUrl: creator.bestReel.thumbnailUrl,
    videoUrl: null,
    caption: creator.bestReel.caption,
    publishedAt: null,
    views: creator.bestReel.views,
    likes: creator.bestReel.likes,
    comments: creator.bestReel.comments,
    activePillars: args.pillars,
    fallbackNiche: args.niche,
    relevanceLabel: "From Creator Radar",
    relevanceReason: `A peer creator surfaced by your Creator Radar around ${creator.foundViaTopic || creator.foundViaPillar || args.niche}.`,
    relevanceHint: Math.min(90, Math.max(55, creator.bestReel.viralScore || 0)),
    now: args.now,
  });
}

function similarFeaturedCandidate(
  reel: SimilarFeaturedReelSupply,
  args: { pillars: string[]; niche: string; now: Date }
): AdaptedCandidate {
  const remakeHint = reel.remakeabilityScore ?? 55;
  return adaptPublicMetadata({
    platform: "instagram",
    sourceId: reel.sourceId,
    sourceUrl: reel.sourceUrl,
    creatorHandle: reel.creatorHandle,
    creatorName: reel.creatorName,
    creatorAvatarUrl: reel.creatorAvatarUrl,
    creatorFollowers: reel.creatorFollowers,
    thumbnailUrl: reel.thumbnailUrl,
    videoUrl: reel.videoUrl,
    caption: reel.caption,
    publishedAt: reel.publishedAt,
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    activePillars: args.pillars,
    fallbackNiche: args.niche,
    relevanceLabel: "Similar creator",
    relevanceReason: `A strong, remakeable reel from another Featured creator in ${reel.nicheName}.`,
    relevanceHint: Math.min(85, Math.max(55, 55 + remakeHint * 0.25 + (reel.viralFlag ? 8 : 0))),
    now: args.now,
  });
}

async function loadRecentRadarSearches(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      resultJson: creatorDiscoverySearches.resultJson,
      createdAt: creatorDiscoverySearches.createdAt,
    })
    .from(creatorDiscoverySearches)
    .where(eq(creatorDiscoverySearches.userId, userId))
    .orderBy(desc(creatorDiscoverySearches.createdAt))
    .limit(MAX_RADAR_SEARCHES);
}

async function safePersonalSource<T>(args: {
  userId: number;
  source: string;
  fallback: T;
  load: () => Promise<T>;
}): Promise<T> {
  try {
    return await args.load();
  } catch (err) {
    console.warn("[viralPosts.personalization] source_failed", {
      userId: args.userId,
      source: args.source,
      error: err instanceof Error ? err.message : String(err),
    });
    return args.fallback;
  }
}

function addExplicitCreatorSignals(
  signals: ViralPersonalizationSignals,
  onboardingHandles: string[] | null | undefined,
  scrapeJobs: ScrapeJob[]
): void {
  for (const raw of onboardingHandles ?? []) {
    const handle = normalizeHandle(raw);
    if (handle) signals.strongCreatorHandles.add(handle);
  }
  for (const job of scrapeJobs.slice(0, 20)) {
    if (job.status !== "completed" || job.isDemo) continue;
    const handle = normalizeHandle(job.handle);
    if (handle) signals.strongCreatorHandles.add(handle);
  }
}

/**
 * Score-only personalization. It can help a good post win among other good
 * posts, but the +30 cap means personal history cannot replace the existing
 * virality/remakeability signals or bypass Today’s Picks quality floor by itself.
 */
export function personalizationRelevanceBoost(
  candidate: Pick<
    AdaptedCandidate,
    "platform" | "sourceId" | "creatorHandle" | "creatorId" | "format" | "caption" | "hook"
  >,
  signals: ViralPersonalizationSignals
): number {
  let boost = 0;
  const handle = normalizeHandle(candidate.creatorId || candidate.creatorHandle);
  if (handle && signals.strongCreatorHandles.has(handle)) {
    boost += 18;
  } else if (handle && signals.radarCreatorHandles.has(handle)) {
    boost += 7;
  } else if (handle && signals.similarCreatorHandles.has(handle)) {
    boost += 5;
  }

  if (signals.collectedSourceKeys.has(canonicalCandidateKey(candidate))) {
    boost += 8;
  }

  if (candidate.format) {
    const count = signals.preferredFormats.get(candidate.format) ?? 0;
    if (count > 0) boost += Math.min(7, 3 + count * 2);
  }

  const words = new Set(meaningfulTerms(`${candidate.hook || ""} ${candidate.caption || ""}`));
  let topicBoost = 0;
  for (const word of words) {
    const weight = signals.topicTerms.get(word) ?? 0;
    if (weight <= 0) continue;
    topicBoost += Math.min(3, weight);
    if (topicBoost >= 8) break;
  }
  boost += Math.min(8, topicBoost);

  return Math.min(MAX_PERSONAL_RELEVANCE_BOOST, boost);
}

export async function loadViralPersonalizationContext(args: {
  userId: number;
  niche: string;
  pillars: string[];
  now?: Date;
}): Promise<ViralPersonalizationContext> {
  const now = args.now ?? new Date();
  const signals = createEmptySignals();

  const workspaceId = await safePersonalSource<string | null>({
    userId: args.userId,
    source: "workspace",
    fallback: null,
    load: () => getPersonalWorkspaceId(args.userId),
  });
  const [onboarding, collectedAll, scrapeJobs, radarSearches] = await Promise.all([
    safePersonalSource({
      userId: args.userId,
      source: "onboarding",
      fallback: null,
      load: () => getOnboardingState(args.userId),
    }),
    workspaceId == null
      ? Promise.resolve([] as CollectedReel[])
      : safePersonalSource({
          userId: args.userId,
          source: "collected",
          fallback: [] as CollectedReel[],
          load: () => getCollectedReelsByWorkspace(workspaceId),
        }),
    workspaceId == null
      ? Promise.resolve([] as ScrapeJob[])
      : safePersonalSource({
          userId: args.userId,
          source: "scrape_jobs",
          fallback: [] as ScrapeJob[],
          load: () => getScrapeJobsByWorkspace(workspaceId),
        }),
    safePersonalSource({
      userId: args.userId,
      source: "creator_radar",
      fallback: [] as Awaited<ReturnType<typeof loadRecentRadarSearches>>,
      load: () => loadRecentRadarSearches(args.userId),
    }),
  ]);

  addExplicitCreatorSignals(
    signals,
    onboarding?.selectedCreatorHandles ?? null,
    scrapeJobs
  );

  const collected = collectedAll.slice(0, MAX_COLLECTED_READ);
  const collectedCandidates: AdaptedCandidate[] = [];
  for (const reel of collected) {
    if (reel.status !== "ready") continue;
    const handle = normalizeHandle(reel.ownerUsername);
    if (handle) signals.strongCreatorHandles.add(handle);
    const platform = normalizePlatform(reel.platform);
    signals.collectedSourceKeys.add(
      canonicalCandidateKey({ platform, sourceId: reel.shortcode })
    );
    const hook = deriveHook(reel.caption || "");
    addFormat(signals, inferFormatFromCopy({ caption: reel.caption, hook }));
    addTopicTerms(signals, reel.caption, 1);

    if (collectedCandidates.length < MAX_COLLECTED_CANDIDATES) {
      const adapted = collectedCandidate(reel, {
        pillars: args.pillars,
        niche: args.niche,
        now,
      });
      if (adapted) collectedCandidates.push(adapted);
    }
  }

  let radarCreatorsRead = 0;
  const radarCandidates: AdaptedCandidate[] = [];
  const radarNicheNames: string[] = [];
  for (const search of radarSearches) {
    const result = search.resultJson;
    if (!result) continue;
    if (result.routedNiche?.trim()) radarNicheNames.push(result.routedNiche.trim());
    for (const creator of result.rankedCreators.slice(0, MAX_RADAR_CREATORS_PER_SEARCH)) {
      if (!creator.peerKeep) continue;
      radarCreatorsRead += 1;
      const handle = normalizeHandle(creator.owner.username);
      if (handle && !signals.strongCreatorHandles.has(handle)) {
        signals.radarCreatorHandles.add(handle);
      }
      addTopicTerms(signals, creator.foundViaPillar, 2);
      addTopicTerms(signals, creator.foundViaTopic, 3);
      addTopicTerms(signals, creator.bestReel.caption, 1);

      if (radarCandidates.length < MAX_RADAR_CANDIDATES) {
        const adapted = radarCandidate({
          creator,
          pillars: args.pillars,
          niche: args.niche,
          now,
        });
        if (adapted) radarCandidates.push(adapted);
      }
    }
  }

  const classifiedNicheSlugs = scrapeJobs
    .filter(
      (job) =>
        job.status === "completed" &&
        !job.isDemo &&
        Boolean(job.classifiedNicheSlug?.trim())
    )
    .map((job) => job.classifiedNicheSlug!.trim());

  let similarNicheSlugs = 0;
  let similarCreatorsRead = 0;
  const similarCandidates: AdaptedCandidate[] = [];
  try {
    const similar = await loadSimilarCreatorSupply({
      nicheSlugs: [
        ...classifiedNicheSlugs,
        ...(onboarding?.selectedNicheSlugs ?? []),
      ],
      nicheNames: radarNicheNames,
      seedHandles: [...signals.strongCreatorHandles],
      excludeHandles: [
        ...signals.strongCreatorHandles,
        ...signals.radarCreatorHandles,
      ],
      maxAgeHours: VIRAL_POOL_DEFAULTS.assemblyCandidateMaxAgeHours,
      now,
    });
    similarNicheSlugs = similar.nicheSlugs.length;
    similarCreatorsRead = similar.creators.length;

    for (const creator of similar.creators) {
      const handle = normalizeHandle(creator.handle);
      if (
        handle &&
        !signals.strongCreatorHandles.has(handle) &&
        !signals.radarCreatorHandles.has(handle)
      ) {
        signals.similarCreatorHandles.add(handle);
      }
    }
    for (const reel of similar.reels) {
      similarCandidates.push(
        similarFeaturedCandidate(reel, {
          pillars: args.pillars,
          niche: args.niche,
          now,
        })
      );
    }
  } catch (err) {
    console.warn("[viralPosts.personalization] similar_creator_supply_failed", {
      userId: args.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const personalByKey = new Map<string, AdaptedCandidate>();
  for (const candidate of similarCandidates) {
    personalByKey.set(canonicalCandidateKey(candidate), candidate);
  }
  for (const candidate of radarCandidates) {
    personalByKey.set(canonicalCandidateKey(candidate), candidate);
  }
  for (const candidate of collectedCandidates) {
    personalByKey.set(canonicalCandidateKey(candidate), candidate);
  }

  return {
    signals,
    personalCandidates: [...personalByKey.values()],
    counts: {
      collectedRead: collected.length,
      collectedCandidates: collectedCandidates.length,
      explicitCreatorHandles: signals.strongCreatorHandles.size,
      radarSearchesRead: radarSearches.length,
      radarCreatorsRead,
      radarCandidates: radarCandidates.length,
      similarNicheSlugs,
      similarCreatorsRead,
      similarCandidates: similarCandidates.length,
    },
  };
}
