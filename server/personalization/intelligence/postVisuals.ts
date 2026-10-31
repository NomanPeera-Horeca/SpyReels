/**
 * The creator's own posts, as citable evidence for Goal, Audience and Pillars.
 *
 * - postIndex: the most viewed posts (or the lookup covers before posts are
 *   fetched), each with a stable reference P1..Pn that suggestions can cite.
 * - loadPostImages: thumbnails of the first few posts, downloaded by the
 *   server, shrunk and sent inline. Provider thumbnail links expire, and an
 *   expired link sent to the model would fail the whole request, so a
 *   thumbnail that cannot be fetched quickly is skipped. Images never fail a step.
 */
import type {
  AnalysisSourceSnapshot,
  ProfileEvidence,
} from "@shared/personalization/model";

export type PostRef = {
  ref: string;
  caption: string | null;
  views: number | null;
  thumbnailUrl: string | null;
};

export type PostImage = { ref: string; dataUrl: string };

export type PostImageLoader = (posts: PostRef[]) => Promise<PostImage[]>;

export const MAX_INDEXED_POSTS = 8;
export const MAX_POST_IMAGES = 4;
const IMAGE_TIMEOUT_MS = 3_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_EDGE_PX = 512;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Most viewed posts first. Before posts are fetched, the lookup covers are used. */
export function postIndex(
  snapshot: AnalysisSourceSnapshot | null,
  profileEvidence: ProfileEvidence | null | undefined
): PostRef[] {
  const posts = snapshot?.posts ?? [];
  // Lookup covers are copied to our own storage; provider links expire. Prefer the copy.
  const savedCover = new Map(
    (profileEvidence?.previewPosts ?? []).map(post => [post.id, post.thumbnailUrl])
  );
  const rows: Omit<PostRef, "ref">[] = posts.length
    ? [...posts]
        .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
        .map(post => ({
          caption: clean(post.caption).slice(0, 220) || null,
          views: post.views,
          thumbnailUrl: savedCover.get(post.postId) ?? post.thumbnailUrl ?? null,
        }))
    : [...(profileEvidence?.previewPosts ?? [])]
        .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
        .map(post => ({ caption: null, views: post.viewCount, thumbnailUrl: post.thumbnailUrl }));
  return rows
    .filter(row => row.caption || row.thumbnailUrl)
    .slice(0, MAX_INDEXED_POSTS)
    .map((row, i) => ({ ref: `P${i + 1}`, ...row }));
}

/** Only public https addresses are fetched. */
export function fetchableImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^[\d.]+$/.test(host) || host.includes(":")) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function loadOne(post: PostRef): Promise<PostImage | null> {
  const url = fetchableImageUrl(post.thumbnailUrl);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp|gif)/i.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    const { default: sharp } = await import("sharp");
    const small = await sharp(bytes)
      .resize(IMAGE_EDGE_PX, IMAGE_EDGE_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { ref: post.ref, dataUrl: `data:image/jpeg;base64,${small.toString("base64")}` };
  } catch {
    return null;
  }
}

/** Thumbnails of the first posts with an image, in parallel. Failures are skipped. */
export const loadPostImages: PostImageLoader = async posts => {
  const withImage = posts.filter(post => fetchableImageUrl(post.thumbnailUrl)).slice(0, MAX_POST_IMAGES);
  const loaded = await Promise.all(withImage.map(loadOne));
  return loaded.filter((image): image is PostImage => image !== null);
};

/**
 * Indexed posts for the prompt, most viewed first. View counts are left out so
 * a suggestion cannot repeat them. Captions stay inside the untrusted block.
 */
export function postIndexPayload(posts: PostRef[], images: PostImage[]) {
  const withImage = new Set(images.map(image => image.ref));
  return posts.map(post => ({
    ref: post.ref,
    caption: post.caption,
    image: withImage.has(post.ref),
  }));
}

/** Posts and thumbnails one generation may use and cite. */
export type PostContext = { posts: PostRef[]; images: PostImage[] };
export const EMPTY_POST_CONTEXT: PostContext = { posts: [], images: [] };

export const POST_EVIDENCE_RULE =
  "Posts P1, P2... in <creator_evidence> are the creator's own posts, most viewed first. Thumbnails of some are attached as images labelled with the same id. Use what the captions and thumbnails show (subject, setting, activity, on-screen text) as evidence. Never describe a detail you cannot read or see.";

export const SOURCES_RULE =
  "sources: the ids (P1, P2...) of the creator's posts, or bio, niche, goal, website or category, that support this item. Cite only what is in the evidence.";

/** Labelled images for callStructured. */
export function postImagesForCall(ctx: PostContext): { label: string; dataUrl: string }[] {
  return ctx.images.map(image => ({ label: `Thumbnail of ${image.ref}:`, dataUrl: image.dataUrl }));
}

/** What a suggestion may cite: indexed posts plus the profile sources that exist. */
export function citableSources(
  evidenceSources: readonly string[],
  ctx: PostContext,
  goal: string
): Set<string> {
  const out = new Set(ctx.posts.map(post => post.ref));
  if (evidenceSources.some(s => s === "bio" || s === "brand_description" || s === "display_name")) out.add("bio");
  for (const s of ["niche", "website", "category"]) if (evidenceSources.includes(s)) out.add(s);
  if (goal.trim()) out.add("goal");
  if (ctx.posts.length === 0 && evidenceSources.includes("captions")) out.add("captions");
  return out;
}

function normalizeSource(source: string): string {
  const s = source.trim();
  return /^p\d+$/i.test(s) ? s.toUpperCase() : s.toLowerCase();
}

/**
 * Soft proof. Items that cite nothing real are dropped only when at least
 * `minKeep` cited items remain; otherwise every item is kept, so a step
 * never ends empty because of this check.
 */
export function keepCited<T>(
  items: { item: T; sources: readonly string[] }[],
  allowed: ReadonlySet<string>,
  minKeep: number
): { kept: T[]; dropped: number } {
  const cited = items.filter(entry => entry.sources.some(s => allowed.has(normalizeSource(s))));
  if (cited.length >= Math.max(1, minKeep)) {
    return { kept: cited.map(entry => entry.item), dropped: items.length - cited.length };
  }
  return { kept: items.map(entry => entry.item), dropped: 0 };
}

/** The posts block for prompts, or null when there are no indexed posts. */
export function postsPromptBlock(ctx: PostContext, block: (payload: unknown) => string): string | null {
  if (ctx.posts.length === 0) return null;
  return block({ kind: "creator_posts", posts: postIndexPayload(ctx.posts, ctx.images) });
}
