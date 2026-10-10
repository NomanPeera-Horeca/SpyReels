import type { ReactNode } from "react";
import { marketingSharedCopy } from "../lib/marketingSharedCopy";
import {
  MarketingIconBroll,
  MarketingIconCarousel,
  MarketingIconCreators,
  MarketingIconFinder,
  MarketingIconHooks,
  MarketingIconScript,
} from "./MarketingIcons";

export type MegaItem = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  iconClass?: string;
};

export type MegaSection = {
  label: string;
  items: MegaItem[];
};

export type NavMenu = {
  id: string;
  label: string;
  menuClass: string;
  panelLabel: string;
  panelAriaLabel: string;
  panelClass: string;
  /** Product uses sections; others use a flat list. */
  sections?: MegaSection[];
  items?: MegaItem[];
};

const strokeIcon = (node: ReactNode) => node;

export const PRODUCT_SECTIONS: MegaSection[] = [
  {
    label: marketingSharedCopy.headerGroupLabels[0],
    items: [
      {
        href: "/features/viral-reel-finder",
        title: "Viral Reel Finder",
        description: "Spot the Reels worth studying",
        icon: <MarketingIconFinder />,
        iconClass: "icon-finder",
      },
      {
        href: "/free-tools/ai-script-generator",
        title: "AI Viral Script Generator",
        description: "Turn an idea into a viral script",
        icon: <MarketingIconScript />,
        iconClass: "icon-script",
      },
    ],
  },
  {
    label: marketingSharedCopy.headerGroupLabels[1],
    items: [
      {
        href: "/?auth=signup&returnTo=%2Fdiscover-creators",
        title: "Find Creators",
        description: "Discover creators in your niche",
        icon: <MarketingIconCreators />,
        iconClass: "icon-creators",
      },
      {
        href: "/free-tools/viral-hooks",
        title: "Viral Hook Generator",
        description: "Find a stronger opening",
        icon: <MarketingIconHooks />,
        iconClass: "icon-hooks",
      },
      {
        href: "/free-tools/broll-generator",
        title: "B-roll Generator",
        description: "Plan what viewers will see",
        icon: <MarketingIconBroll />,
        iconClass: "icon-broll",
      },
      {
        href: "/?auth=signup&returnTo=%2Fcarousels",
        title: "Carousel Generator",
        description: "Make your idea swipeable",
        icon: <MarketingIconCarousel />,
        iconClass: "icon-carousel",
      },
    ],
  },
  {
    label: marketingSharedCopy.headerGroupLabels[2],
    items: [
      {
        href: "/#telegram-extension",
        title: "Save Reels with Telegram",
        description: "Keep inspiration in your workspace",
        icon: (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.4 3.1 2.8 10.3c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.7c.2.7.1 1 1 .9.7-.1 1-.3 1.4-.7l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9L23 4.4c.3-1.3-.5-1.8-1.6-1.3ZM8.1 12.9l10.9-6.8c.5-.3 1-.1.6.3l-9 8.1-.4 4.1-2.1-5.7Z" />
          </svg>
        ),
        iconClass: "icon-telegram",
      },
      {
        href: "/#ai-extension",
        title: "ChatGPT and Claude",
        description: "Coming soon",
        icon: <span aria-hidden="true">✦</span>,
        iconClass: "icon-ai",
      },
    ],
  },
];

function item(
  href: string,
  title: string,
  description: string,
  icon: ReactNode,
  iconClass?: string
): MegaItem {
  return { href, title, description, icon: strokeIcon(icon), iconClass };
}

export const NAV_MENUS: NavMenu[] = [
  {
    id: "product",
    label: "Product",
    menuClass: "product-menu",
    panelLabel: "SpyReels tools",
    panelAriaLabel: "SpyReels tools",
    panelClass: "product-catalog",
    sections: PRODUCT_SECTIONS,
  },
  {
    id: "platforms",
    label: "Platforms",
    menuClass: "platforms-menu",
    panelLabel: "Works where you post",
    panelAriaLabel: "Platforms",
    panelClass: "nav-panel",
    items: [
      item(
        "/features/viral-reel-finder",
        "Instagram Reels",
        "Research standout Reels and shape your script",
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>,
        "icon-instagram"
      ),
      item(
        "/free-tools/tiktok-viral-video-finder",
        "TikTok",
        "Turn an idea into a TikTok script",
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3v11a4.5 4.5 0 1 1-4.5-4.5"/><path d="M13 3c1 3 3 4.5 6 4.5V11c-2.4 0-4.3-.7-6-2"/></svg>,
        "icon-tiktok"
      ),
      item(
        "/free-tools/youtube-shorts-viral-finder",
        "YouTube Shorts",
        "Build a concise script for Shorts",
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="4"/><path d="m10 8 5 4-5 4V8Z"/></svg>,
        "icon-shorts"
      ),
    ],
  },
  {
    id: "solutions",
    label: "Solutions",
    menuClass: "solutions-menu",
    panelLabel: "Made for your work",
    panelAriaLabel: "Solutions",
    panelClass: "nav-panel",
    items: [
      item("/?auth=signup&returnTo=%2Fresearch", "Creators", "Find the next idea worth filming", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>, "icon-creator"),
      item("/?auth=signup&returnTo=%2Fresearch", "Social managers", "Plan content with more direction", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>, "icon-manager"),
      item("/?auth=signup&returnTo=%2Fresearch", "Agencies", "Study patterns across client niches", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>, "icon-agency"),
      item("/?auth=signup&returnTo=%2Fresearch", "Brands", "Make original work for your audience", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 8-8h9v9l-8 8a2 2 0 0 1-3 0l-6-6a2 2 0 0 1 0-3Z"/><circle cx="16.5" cy="7.5" r="1"/></svg>, "icon-brand"),
    ],
  },
  {
    id: "resources",
    label: "Resources",
    menuClass: "resources-menu",
    panelLabel: "Explore and learn",
    panelAriaLabel: "Resources",
    panelClass: "nav-panel",
    items: [
      item("/blog", "Blog", "Guides for creators and Remake", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h4M8 12h8M8 16h6"/></svg>, "icon-blog"),
      item("/free-tools", "Free tools", "Try the creator tools", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M18.4 5.6l-2.8 2.8m-7.2 7.2-2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg>, "icon-book"),
      item("/#answers", "FAQs", "Answers before you start", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1 1-1.1 1.9M12 17h.01"/></svg>, "icon-help"),
      item("/#responsible-research", "Responsible research", "How SpyReels uses public content", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>, "icon-shield"),
    ],
  },
];

export const LOGIN_HREF = "/?auth=login&returnTo=%2Fresearch";
export const SIGNUP_HREF = "/?auth=signup&returnTo=%2Fresearch";
export const PRICING_HREF = "/pricing";
export const HOME_HREF = "/#top";
export const LOGO_MARK_SRC = "/marketing/0a709293985f.png";
