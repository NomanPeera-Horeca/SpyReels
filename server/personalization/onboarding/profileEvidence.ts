/**
 * Public facts from the lookup the customer just saw.
 * This is not a social profile row and it does not fetch the website.
 */
import type { ProfileEvidence, ProfilePreviewPost, SocialPlatform } from "@shared/personalization/model";
import type { PublicProfilePost, PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { verbatimCta } from "../intelligence/evidence";

const MAX_CAPTIONS = 6;
const MAX_CAPTION_CHARS = 280;
const MAX_PREVIEW_POSTS = 6;

export function publicWebsiteUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function profileEvidenceFromPreview(preview: PublicProfilePreview): ProfileEvidence {
  const fromPosts = preview.recentPosts
    .map(post => (post.caption ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const captions = [...new Set([...(preview.lookupCaptions ?? []), ...fromPosts])]
    .map(caption => caption.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_CAPTIONS)
    .map(caption => caption.slice(0, MAX_CAPTION_CHARS));
  return {
    username: preview.handle,
    displayName: preview.displayName,
    bio: preview.bio,
    category: preview.category,
    cta: verbatimCta(preview.bio),
    websiteUrl: publicWebsiteUrl(preview.externalUrl),
    captions,
    previewPosts: persistedPreviewPosts(preview),
  };
}

/** Cover images from the lookup, kept so a refresh can paint the phone grid. */
export function persistedPreviewPosts(preview: PublicProfilePreview): ProfilePreviewPost[] {
  const posts: ProfilePreviewPost[] = [];
  for (const post of preview.recentPosts) {
    if (posts.length >= MAX_PREVIEW_POSTS) break;
    const id = post.id.trim().slice(0, 64);
    const thumbnailUrl = publicWebsiteUrl(post.thumbnailUrl);
    if (!id || !thumbnailUrl) continue;
    posts.push({
      id,
      thumbnailUrl,
      viewCount: typeof post.viewCount === "number" && Number.isFinite(post.viewCount) ? post.viewCount : null,
      ...(post.isPinned ? { isPinned: true } : {}),
    });
  }
  return posts;
}

/** Restores phone tiles from a saved lookup. Drops rows that have no image. */
export function previewPostsFromEvidence(evidence: ProfileEvidence | null | undefined): PublicProfilePost[] {
  const posts = evidence?.previewPosts ?? [];
  const out: PublicProfilePost[] = [];
  for (const post of posts) {
    if (out.length >= MAX_PREVIEW_POSTS) break;
    const id = typeof post?.id === "string" ? post.id.trim() : "";
    const thumbnailUrl = publicWebsiteUrl(post?.thumbnailUrl);
    if (!id || !thumbnailUrl) continue;
    const views = post.viewCount;
    out.push({
      id,
      thumbnailUrl,
      viewCount: typeof views === "number" && Number.isFinite(views) ? views : null,
      ...(post.isPinned ? { isPinned: true } : {}),
    });
  }
  return out;
}

export type ProfileEvidenceIdentity = {
  platform: SocialPlatform;
  handle: string;
  followerCount: number | null;
};
