/**
 * Public facts from the lookup the customer just saw.
 * This is not a social profile row and it does not fetch the website.
 */
import type { ProfileEvidence, SocialPlatform } from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { verbatimCta } from "../intelligence/evidence";

const MAX_CAPTIONS = 6;
const MAX_CAPTION_CHARS = 280;

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
  };
}

export type ProfileEvidenceIdentity = {
  platform: SocialPlatform;
  handle: string;
  followerCount: number | null;
};
