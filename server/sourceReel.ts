import type { Reel } from "../drizzle/schema";

/** Instagram-style hashtags from caption text (reels table has no hashtags column). */
export function extractHashtagsFromCaption(
  caption: string | null | undefined
): string[] {
  if (!caption) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  const re = /#([\w]+(?:\.[\w]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(caption)) !== null) {
    const tag = match[1];
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

export type SourceReelPayload = {
  id: number;
  shortcode: string;
  ownerHandle: string;
  caption: string | null;
  hashtags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  postedAt: Date;
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

export function toSourceReel(reel: Reel): SourceReelPayload {
  const caption = reel.caption ?? null;
  return {
    id: reel.id,
    shortcode: reel.shortcode,
    ownerHandle: reel.ownerUsername ?? "",
    caption,
    hashtags: extractHashtagsFromCaption(caption),
    viewCount: reel.viewCount,
    likeCount: reel.likeCount,
    commentCount: reel.commentCount,
    postedAt: reel.postedAt,
    thumbnailUrl: reel.thumbnailUrl,
    videoUrl: reel.videoUrl,
  };
}
