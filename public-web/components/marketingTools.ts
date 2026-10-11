import type { MarketingToolIconId } from "./MarketingIcons";

/**
 * Shared Marketing / Tool Grid registry.
 * Pages pass title + toolsPage + hiddenToolIds. toolsPage selects order + live descriptions.
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
  /** Live copy per page that shows this tool (exact strings from today). */
  descriptions: Partial<Record<MarketingToolsPage, string>>;
};

const CATALOG: Record<MarketingToolId, CatalogEntry> = {
  finder: {
    id: "finder",
    title: "Viral Reel Finder",
    href: "/features/viral-reel-finder",
    icon: "finder",
    descriptions: {
      homepage: "Spot the Reels worth studying.",
      tiktok: "Research what works on Instagram Reels",
      youtube: "Research what works on Instagram Reels.",
    },
  },
  script: {
    id: "script",
    title: "AI Viral Script Generator",
    href: "/free-tools/ai-script-generator",
    icon: "script",
    descriptions: {
      homepage: "Turn a strong idea into a script in your voice.",
      instagram: "Turn a strong Reel idea into a script in your voice.",
      tiktok: "Turn a strong TikTok idea into a script in your voice",
      youtube: "Turn a strong Shorts idea into a script in your voice.",
    },
  },
  hooks: {
    id: "hooks",
    title: "Viral Hook Generator",
    href: "/free-tools/viral-hooks",
    icon: "hooks",
    descriptions: {
      homepage: "Give your opening a sharper hook.",
      instagram: "Give your opening a sharper hook.",
      tiktok: "Give the opening a stronger reason to watch",
      youtube: "Give the opening a stronger reason to watch.",
    },
  },
  broll: {
    id: "broll",
    title: "B-roll Generator",
    href: "/free-tools/broll-generator",
    icon: "broll",
    descriptions: {
      homepage: "Plan the shots that support your script.",
      instagram: "Plan the shots that support your script.",
      tiktok: "Plan the shots that support your script",
      youtube: "Plan the shots that support your script.",
    },
  },
  carousel: {
    id: "carousel",
    title: "Carousel Generator",
    href: "/?auth=signup&returnTo=%2Fcarousels",
    icon: "carousel",
    descriptions: {
      homepage: "Turn the same idea into a swipeable post.",
      instagram: "Turn the same idea into a swipeable post.",
      tiktok: "Turn the idea into a swipeable post",
      youtube: "Turn the idea into a swipeable post.",
    },
  },
  tiktok: {
    id: "tiktok",
    title: "TikTok Viral Video Finder",
    href: "/free-tools/tiktok-viral-video-finder",
    icon: "finder",
    descriptions: {
      homepage: "Find more ideas on TikTok.",
      instagram: "Find more ideas on TikTok.",
      youtube: "Find more ideas on TikTok.",
    },
  },
  youtube: {
    id: "youtube",
    title: "YouTube Shorts Viral Finder",
    href: "/free-tools/youtube-shorts-viral-finder",
    icon: "finder",
    descriptions: {
      instagram: "Find more ideas on YouTube Shorts.",
      tiktok: "Find more ideas on YouTube Shorts.",
    },
  },
};

/** Page tool order — 6 tools each (Figma Tool Grid locked). */
export const MARKETING_TOOL_ORDER: Record<MarketingToolsPage, readonly MarketingToolId[]> = {
  homepage: ["script", "hooks", "broll", "carousel", "finder", "tiktok"],
  instagram: ["script", "hooks", "broll", "carousel", "tiktok", "youtube"],
  tiktok: ["script", "hooks", "broll", "finder", "carousel", "youtube"],
  youtube: ["script", "hooks", "broll", "finder", "carousel", "tiktok"],
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
      const description = entry.descriptions[toolsPage];
      if (!description) {
        throw new Error(`Missing description for tool "${id}" on page "${toolsPage}"`);
      }
      return {
        id: entry.id,
        title: entry.title,
        href: entry.href,
        icon: entry.icon,
        description,
      };
    });
}
