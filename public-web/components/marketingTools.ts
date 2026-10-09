import type { MarketingToolIconId } from "./MarketingIcons";

/**
 * Shared Marketing / Tool Grid registry.
 * Pages pass title + toolsPage + hiddenToolIds. toolsPage selects order + live descriptions.
 */
export type MarketingToolId =
  | "creators"
  | "finder"
  | "script"
  | "hooks"
  | "broll"
  | "carousel"
  | "tiktok";

export type MarketingToolsPage = "homepage" | "instagram" | "tiktok";

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
  creators: {
    id: "creators",
    title: "Find Creators",
    href: "/?auth=signup&returnTo=%2Fdiscover-creators",
    icon: "creators",
    descriptions: {
      homepage: "Discover creators in your niche.",
      instagram: "Explore more creators in your niche.",
      tiktok: "Explore more creators in your niche",
    },
  },
  finder: {
    id: "finder",
    title: "Viral Reel Finder",
    href: "/features/viral-reel-finder",
    icon: "finder",
    descriptions: {
      homepage: "Spot the Reels worth studying.",
      tiktok: "Research what works on Instagram Reels",
    },
  },
  script: {
    id: "script",
    title: "AI Viral Script Generator",
    href: "/free-tools/ai-script-generator",
    icon: "script",
    descriptions: {
      homepage: "Turn an idea into a viral script.",
      instagram: "Turn a strong Reel idea into a script in your voice.",
      tiktok: "Turn a strong TikTok idea into a script in your voice",
    },
  },
  hooks: {
    id: "hooks",
    title: "Viral Hook Generator",
    href: "/free-tools/viral-hooks",
    icon: "hooks",
    descriptions: {
      homepage: "Find a stronger opening.",
      instagram: "Give your opening a sharper hook.",
      tiktok: "Give the opening a stronger reason to watch",
    },
  },
  broll: {
    id: "broll",
    title: "B-roll Generator",
    href: "/free-tools/broll-generator",
    icon: "broll",
    descriptions: {
      homepage: "Plan what viewers will see.",
      instagram: "Plan the shots that support your script.",
      tiktok: "Plan the shots that support your script",
    },
  },
  carousel: {
    id: "carousel",
    title: "Carousel Generator",
    href: "/?auth=signup&returnTo=%2Fcarousels",
    icon: "carousel",
    descriptions: {
      homepage: "Make your idea swipeable.",
      instagram: "Turn the same idea into a swipeable post.",
      tiktok: "Turn the idea into a swipeable post",
    },
  },
  tiktok: {
    id: "tiktok",
    title: "TikTok Viral Video Finder",
    href: "/free-tools/tiktok-viral-video-finder",
    icon: "finder",
    descriptions: {
      instagram: "Find more ideas on TikTok.",
    },
  },
};

/** Page tool order — matches live lists today. */
export const MARKETING_TOOL_ORDER: Record<MarketingToolsPage, readonly MarketingToolId[]> = {
  homepage: ["creators", "finder", "script", "hooks", "broll", "carousel"],
  instagram: ["script", "hooks", "broll", "creators", "carousel", "tiktok"],
  tiktok: ["script", "hooks", "broll", "finder", "creators", "carousel"],
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
