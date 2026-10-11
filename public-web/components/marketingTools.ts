import type { MarketingToolIconId } from "./MarketingIcons";

/**
 * Shared Marketing / Tool Grid registry.
 * One description per tool everywhere (Script Generator may swap the platform word).
 * Find Creators removed (Figma Tool Grid locked responsive pass).
 */
export type MarketingToolId =
  | "finder"
  | "script"
  | "hooks"
  | "broll"
  | "carousel"
  | "tiktok"
  | "youtube";

export type MarketingToolsPage = "homepage" | "instagram" | "tiktok" | "youtube";

export type MarketingTool = {
  id: MarketingToolId;
  title: string;
  description: string;
  href: string;
  icon: MarketingToolIconId;
};

type CatalogEntry = {
  id: MarketingToolId;
  title: string;
  href: string;
  icon: MarketingToolIconId;
  /** Canonical description (always ends with a period). */
  description: string;
};

const CATALOG: Record<MarketingToolId, CatalogEntry> = {
  finder: {
    id: "finder",
    title: "Viral Reel Finder",
    href: "/features/viral-reel-finder",
    icon: "finder",
    description: "Spot the Reels worth studying.",
  },
  script: {
    id: "script",
    title: "AI Viral Script Generator",
    href: "/free-tools/ai-script-generator",
    icon: "script",
    description: "Turn a strong idea into a script in your voice.",
  },
  hooks: {
    id: "hooks",
    title: "Viral Hook Generator",
    href: "/free-tools/viral-hooks",
    icon: "hooks",
    description: "Give your opening a sharper hook.",
  },
  broll: {
    id: "broll",
    title: "B-roll Generator",
    href: "/free-tools/broll-generator",
    icon: "broll",
    description: "Plan the shots that support your script.",
  },
  carousel: {
    id: "carousel",
    title: "Carousel Generator",
    href: "/?auth=signup&returnTo=%2Fcarousels",
    icon: "carousel",
    description: "Turn the same idea into a swipeable post.",
  },
  tiktok: {
    id: "tiktok",
    title: "TikTok Viral Video Finder",
    href: "/free-tools/tiktok-viral-video-finder",
    icon: "finder",
    description: "Find more ideas on TikTok.",
  },
  youtube: {
    id: "youtube",
    title: "YouTube Shorts Viral Finder",
    href: "/free-tools/youtube-shorts-viral-finder",
    icon: "finder",
    description: "Find more ideas on YouTube Shorts.",
  },
};

/** Script Generator: only the platform word changes by page. */
const SCRIPT_DESCRIPTION: Record<MarketingToolsPage, string> = {
  homepage: "Turn a strong idea into a script in your voice.",
  instagram: "Turn a strong Reel idea into a script in your voice.",
  tiktok: "Turn a strong TikTok idea into a script in your voice.",
  youtube: "Turn a strong Shorts idea into a script in your voice.",
};

/**
 * Same order on every page: Script, Hooks, B-roll, Carousel, then the two other finders.
 * Current-page finder is omitted (the two other finders fill slots 5–6).
 */
export const MARKETING_TOOL_ORDER: Record<MarketingToolsPage, readonly MarketingToolId[]> = {
  homepage: ["script", "hooks", "broll", "carousel", "finder", "tiktok"],
  instagram: ["script", "hooks", "broll", "carousel", "tiktok", "youtube"],
  tiktok: ["script", "hooks", "broll", "carousel", "finder", "youtube"],
  youtube: ["script", "hooks", "broll", "carousel", "finder", "tiktok"],
};

export function resolveMarketingTools(
  toolsPage: MarketingToolsPage,
  hiddenToolIds: readonly MarketingToolId[] = [],
): MarketingTool[] {
  const hidden = new Set(hiddenToolIds);
  return MARKETING_TOOL_ORDER[toolsPage]
    .filter((id) => !hidden.has(id))
    .map((id) => {
      const entry = CATALOG[id];
      const description = id === "script" ? SCRIPT_DESCRIPTION[toolsPage] : entry.description;
      return {
        id: entry.id,
        title: entry.title,
        href: entry.href,
        icon: entry.icon,
        description,
      };
    });
}
