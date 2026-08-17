import viralHooksPng from "@/assets/related-tools/viral-hooks.png";
import viralReelFinderPng from "@/assets/related-tools/viral-reel-finder.png";
import aiScriptCoachPng from "@/assets/related-tools/ai-script-coach.png";
import tiktokViralVideoFinderPng from "@/assets/related-tools/tiktok-viral-video-finder.png";
import youtubeShortsViralFinderPng from "@/assets/related-tools/youtube-shorts-viral-finder.png";
import brollGeneratorPng from "@/assets/related-tools/broll-generator.png";
import type { RelatedToolItem } from "@/components/RelatedToolsGrid";

/** RelatedToolsGrid thumbs for free-tool / feature cards. */
export const RELATED_TOOL_THUMB_VIRAL_HOOKS = viralHooksPng;
export const RELATED_TOOL_THUMB_VIRAL_FINDER = viralReelFinderPng;
export const RELATED_TOOL_THUMB_AI_COACH = aiScriptCoachPng;
export const RELATED_TOOL_THUMB_TIKTOK_FINDER = tiktokViralVideoFinderPng;
export const RELATED_TOOL_THUMB_YOUTUBE_FINDER = youtubeShortsViralFinderPng;
export const RELATED_TOOL_THUMB_BROLL = brollGeneratorPng;

const INSTAGRAM_FINDER: RelatedToolItem = {
  title: "Instagram Viral Reel Finder",
  href: "/features/viral-reel-finder",
  imageUrl: RELATED_TOOL_THUMB_VIRAL_FINDER,
};

const TIKTOK_FINDER: RelatedToolItem = {
  title: "TikTok Viral Video Finder",
  href: "/free-tools/tiktok-viral-video-finder",
  imageUrl: RELATED_TOOL_THUMB_TIKTOK_FINDER,
};

const YOUTUBE_FINDER: RelatedToolItem = {
  title: "YouTube Shorts Viral Finder",
  href: "/free-tools/youtube-shorts-viral-finder",
  imageUrl: RELATED_TOOL_THUMB_YOUTUBE_FINDER,
};

const BROLL_GENERATOR: RelatedToolItem = {
  title: "B-Roll Generator",
  href: "/free-tools/broll-generator",
  imageUrl: RELATED_TOOL_THUMB_BROLL,
};

const AI_SCRIPT_GENERATOR: RelatedToolItem = {
  title: "AI Script Generator",
  href: "/free-tools/ai-script-generator",
  imageUrl: RELATED_TOOL_THUMB_AI_COACH,
};

export type FinderRelatedPlatform = "instagram" | "tiktok" | "youtube";

/**
 * Related tools for finder LPs: the other platforms + B-roll + script generator.
 * Excludes the page you are already on.
 */
export function getFinderRelatedTools(current: FinderRelatedPlatform): RelatedToolItem[] {
  const finders =
    current === "instagram"
      ? [TIKTOK_FINDER, YOUTUBE_FINDER]
      : current === "tiktok"
        ? [INSTAGRAM_FINDER, YOUTUBE_FINDER]
        : [INSTAGRAM_FINDER, TIKTOK_FINDER];

  return [...finders, BROLL_GENERATOR, AI_SCRIPT_GENERATOR];
}
