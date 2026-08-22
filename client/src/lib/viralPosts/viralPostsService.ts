import { DAILY_VIRAL_POST_IDS, VIRAL_POSTS_SEED } from "./mockData";
import type {
  ExploreAdvancedFilters,
  ExploreQuickFilter,
  RecommendationFeedbackAction,
  SavedPostsFilter,
  ViralPost,
  ViralRemakeAngle,
  ViralRemakePreview,
} from "./types";
import { DEFAULT_EXPLORE_FILTERS } from "./types";

const STORAGE_KEY = "spyreels:viral-posts:v1";

type ViralPostsStore = {
  savedIds: string[];
  remadeIds: string[];
  hiddenCreatorIds: string[];
  dismissedBanner: boolean;
  feedback: Array<{
    postId: string;
    action: RecommendationFeedbackAction;
    at: string;
  }>;
};

function defaultStore(): ViralPostsStore {
  const seedSaved = VIRAL_POSTS_SEED.filter((p) => p.saved).map((p) => p.id);
  const seedRemade = VIRAL_POSTS_SEED.filter((p) => p.remade).map((p) => p.id);
  return {
    savedIds: seedSaved,
    remadeIds: seedRemade,
    hiddenCreatorIds: [],
    dismissedBanner: false,
    feedback: [],
  };
}

function readStore(): ViralPostsStore {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Partial<ViralPostsStore>;
    const base = defaultStore();
    return {
      savedIds: Array.isArray(parsed.savedIds) ? parsed.savedIds : base.savedIds,
      remadeIds: Array.isArray(parsed.remadeIds)
        ? parsed.remadeIds
        : base.remadeIds,
      hiddenCreatorIds: Array.isArray(parsed.hiddenCreatorIds)
        ? parsed.hiddenCreatorIds
        : [],
      dismissedBanner: Boolean(parsed.dismissedBanner),
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return defaultStore();
  }
}

function writeStore(store: ViralPostsStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function delay(ms = 280): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hydratePosts(store: ViralPostsStore): ViralPost[] {
  const hidden = new Set(store.hiddenCreatorIds);
  const saved = new Set(store.savedIds);
  const remade = new Set(store.remadeIds);
  return VIRAL_POSTS_SEED.filter((p) => {
    const creatorKey = p.creatorId || p.creatorName;
    return !hidden.has(creatorKey);
  }).map((p) => ({
    ...p,
    saved: saved.has(p.id),
    remade: remade.has(p.id),
  }));
}

function matchesPostedWithin(
  postedAt: string,
  within: ExploreAdvancedFilters["postedWithin"]
): boolean {
  const ageMs = Date.now() - new Date(postedAt).getTime();
  if (within === "24h") return ageMs <= 24 * 60 * 60 * 1000;
  if (within === "7d") return ageMs <= 7 * 24 * 60 * 60 * 1000;
  return ageMs <= 30 * 24 * 60 * 60 * 1000;
}

function matchesVideoStyle(
  post: ViralPost,
  styles: ExploreAdvancedFilters["videoStyles"]
): boolean {
  const any =
    styles.talkingHead ||
    styles.storytelling ||
    styles.educational ||
    styles.faceless;
  if (!any) return true;
  const style = (post.videoStyle || "").toLowerCase();
  if (styles.talkingHead && /talking|direct-to-camera|whiteboard/.test(style)) {
    return true;
  }
  if (styles.storytelling && /story|confession|listicle/.test(style)) {
    return true;
  }
  if (styles.educational && /explainer|whiteboard|educational/.test(style)) {
    return true;
  }
  if (styles.faceless && /faceless|b-roll|walkthrough|case study/.test(style)) {
    return true;
  }
  return false;
}

function matchesMomentum(
  post: ViralPost,
  momentum: ExploreAdvancedFilters["momentum"]
): boolean {
  const any =
    momentum.breakingOut || momentum.risingFast || momentum.provenFormat;
  if (!any) return true;
  if (momentum.risingFast && post.trendStatus === "rising-fast") return true;
  if (momentum.breakingOut && post.trendStatus === "breaking-out") return true;
  if (momentum.provenFormat && post.trendStatus === "proven-format") return true;
  return false;
}

export async function getDailyViralPosts(): Promise<ViralPost[]> {
  await delay();
  const store = readStore();
  const posts = hydratePosts(store);
  const byId = new Map(posts.map((p) => [p.id, p]));
  return DAILY_VIRAL_POST_IDS.map((id) => byId.get(id)).filter(
    (p): p is ViralPost => Boolean(p)
  );
}

export async function searchViralPosts(args: {
  query?: string;
  quickFilter?: ExploreQuickFilter;
  filters?: ExploreAdvancedFilters;
}): Promise<ViralPost[]> {
  await delay(320);
  const store = readStore();
  const filters = args.filters ?? DEFAULT_EXPLORE_FILTERS;
  const quick = args.quickFilter ?? "all";
  const query = (args.query || "").trim().toLowerCase();

  return hydratePosts(store).filter((post) => {
    if (!filters.platforms.instagram && post.platform === "instagram") {
      return false;
    }
    if (!filters.platforms.tiktok && post.platform === "tiktok") return false;
    if (quick === "rising" && post.trendStatus !== "rising-fast") return false;
    if (quick === "proven" && post.trendStatus !== "proven-format") return false;
    if (!matchesMomentum(post, filters.momentum)) return false;
    if (!matchesVideoStyle(post, filters.videoStyles)) return false;
    if (!matchesPostedWithin(post.postedAt, filters.postedWithin)) return false;
    if (!query) return true;
    const blob = [
      post.hook,
      post.relevanceLabel,
      post.relevanceReason,
      post.contentPillar,
      post.creatorName,
      post.whyItWorks?.hookMechanism,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const token = query.split(/\s+/)[0] || query;
    return blob.includes(token);
  });
}

export async function getSavedViralPosts(
  filter: SavedPostsFilter = "all"
): Promise<ViralPost[]> {
  await delay();
  const store = readStore();
  let list = hydratePosts(store).filter((p) => p.saved);
  if (filter === "remade") list = list.filter((p) => p.remade);
  if (filter === "unused") list = list.filter((p) => !p.remade);
  return list;
}

export async function saveViralPost(postId: string): Promise<ViralPost | null> {
  await delay(120);
  const store = readStore();
  if (!store.savedIds.includes(postId)) {
    store.savedIds = [...store.savedIds, postId];
    writeStore(store);
  }
  return hydratePosts(store).find((p) => p.id === postId) ?? null;
}

export async function removeSavedViralPost(
  postId: string
): Promise<ViralPost | null> {
  await delay(120);
  const store = readStore();
  store.savedIds = store.savedIds.filter((id) => id !== postId);
  writeStore(store);
  const seed = VIRAL_POSTS_SEED.find((p) => p.id === postId);
  if (!seed) return null;
  return {
    ...seed,
    saved: false,
    remade: store.remadeIds.includes(postId),
  };
}

export async function submitRecommendationFeedback(args: {
  postId: string;
  action: RecommendationFeedbackAction;
}): Promise<{ hiddenCreatorId?: string }> {
  await delay(100);
  const store = readStore();
  store.feedback = [
    ...store.feedback,
    { postId: args.postId, action: args.action, at: new Date().toISOString() },
  ];
  let hiddenCreatorId: string | undefined;
  if (args.action === "hide-creator") {
    const post = VIRAL_POSTS_SEED.find((p) => p.id === args.postId);
    const key = post?.creatorId || post?.creatorName;
    if (key && !store.hiddenCreatorIds.includes(key)) {
      store.hiddenCreatorIds = [...store.hiddenCreatorIds, key];
      hiddenCreatorId = key;
    }
  }
  writeStore(store);
  return { hiddenCreatorId };
}

export async function generateViralPostRemake(args: {
  postId: string;
  angle: ViralRemakeAngle;
}): Promise<ViralRemakePreview> {
  await delay(700);
  const post = VIRAL_POSTS_SEED.find((p) => p.id === args.postId);
  const newHook =
    args.angle === "story"
      ? "I learned this after watching restaurant owners spend on finishes before fixing the kitchen flow."
      : args.angle === "contrarian"
        ? "Your menu is not the first thing you should design. Your kitchen flow is."
        : "Stop designing your menu before you understand what your kitchen can actually produce.";

  const script = `[HOOK] ${newHook}

[BODY] Most owners perfect the menu first. But the expensive mistakes usually begin with equipment placement, movement, and production capacity. Map the kitchen path before you spend on finishes. Then build a menu the operation can deliver profitably.

[CTA] Comment KITCHEN and I will send you the free layout checklist.`;

  const caption = `${newHook}

Walk the path before you redesign the menu.

Comment KITCHEN for the checklist.

#restaurants #kitchenops #foodbusiness`;

  return {
    angle: args.angle,
    newHook,
    script,
    caption,
    shotGuidance: [
      "Original script in your voice",
      "Instagram and TikTok captions",
      "Shot guidance and B-roll suggestions",
    ],
    brollSuggestions: [
      post?.contentPillar
        ? `B-roll that supports ${post.contentPillar}`
        : "Kitchen walkthrough B-roll",
      "Close-up of menu or ticket rail",
      "Wide shot of prep line during rush",
    ],
  };
}

export async function markViralPostRemade(postId: string): Promise<void> {
  const store = readStore();
  if (!store.remadeIds.includes(postId)) {
    store.remadeIds = [...store.remadeIds, postId];
  }
  if (!store.savedIds.includes(postId)) {
    store.savedIds = [...store.savedIds, postId];
  }
  writeStore(store);
}

export function getBannerDismissed(): boolean {
  return readStore().dismissedBanner;
}

export function setBannerDismissed(dismissed: boolean): void {
  const store = readStore();
  store.dismissedBanner = dismissed;
  writeStore(store);
}
