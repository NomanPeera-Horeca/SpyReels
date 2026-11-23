/**
 * Simplified sidebar (Figma page "18 — Sidebar + Creator Research", approved
 * 2026-11-23). Shown only when the server switch SIDEBAR_V2_MODE puts the user
 * on it; everyone else keeps today's sidebar.
 *
 *   [ Ask Agent · Beta ]
 *   Home
 *   Find ideas:  Viral Videos · Creator Research · Saved
 *   Make videos: My Plan · My Scripts
 *   ...
 *   Settings
 *   Account (name + niche)
 *
 * Pages that left the menu stay reachable from inside other pages (Creator
 * Radar from Creator Research, Collected Reels from Saved, Paste Script from
 * My Scripts, Billing from Settings), so no link breaks. Dashboard is dropped
 * from the menu (its page still works by URL).
 */
import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  CalendarDays,
  Clapperboard,
  FileText,
  Flame,
  Home as HomeIcon,
  Images,
  Search,
  TrendingUp,
} from "lucide-react";

export type SidebarV2Item = { icon: LucideIcon; label: string; path: string; badge?: "new" };
export type SidebarV2Section = { id: string; label: string; items: SidebarV2Item[] };

export const ASK_AGENT_PATH = "/studio";
export const SETTINGS_PATH = "/settings";

/** Menu groups, in order. Admin-only tools (not polished yet) are added for admins. Pure. */
export function buildSidebarV2Sections(opts: { homeV2: boolean; showUnpolishedTools: boolean }): SidebarV2Section[] {
  const sections: SidebarV2Section[] = [];
  if (opts.homeV2) sections.push({ id: "home", label: "", items: [{ icon: HomeIcon, label: "Home", path: "/" }] });
  sections.push({
    id: "find",
    label: "Find ideas",
    items: [
      { icon: Flame, label: "Viral Videos", path: "/viral-posts" },
      { icon: Search, label: "Creator Research", path: "/research" },
      { icon: Bookmark, label: "Saved", path: "/saved" },
      ...(opts.showUnpolishedTools
        ? [{ icon: TrendingUp, label: "My Virality Report", path: "/my-virality-report" }]
        : []),
    ],
  });
  sections.push({
    id: "make",
    label: "Make videos",
    items: [
      { icon: CalendarDays, label: "My Plan", path: "/plan" },
      { icon: FileText, label: "My Scripts", path: "/scripts" },
      ...(opts.showUnpolishedTools
        ? [
            { icon: Images, label: "Carousels", path: "/carousels", badge: "new" as const },
            { icon: Clapperboard, label: "B-Roll Library", path: "/broll-library", badge: "new" as const },
          ]
        : []),
    ],
  });
  return sections;
}

/**
 * Which item is lit for a page. Pages folded into an item light that item:
 * Creator Radar -> Creator Research, Collected Reels -> Saved, Paste Script and
 * script details -> My Scripts, Billing -> Settings. Pure.
 */
export function isSidebarV2Active(location: string, path: string, homeV2: boolean): boolean {
  const is = (p: string) => location === p || location.startsWith(`${p}/`);
  switch (path) {
    case "/":
      return location === "/";
    case "/research":
      return is("/research") || is("/history") || (!homeV2 && location === "/");
    case "/saved":
      return is("/saved") || is("/collected");
    case "/scripts":
      return is("/scripts") || is("/paste");
    case "/carousels":
      return is("/carousels") || is("/carousel-library");
    case SETTINGS_PATH:
      return is("/settings") || is("/billing") || is("/workspace/settings");
    case ASK_AGENT_PATH:
      return is("/studio");
    default:
      return is(path);
  }
}

/** One short line under the name: the niche, else nothing. Pure. */
export function accountSubtitle(nicheLabel: string | null | undefined): string | null {
  const n = (nicheLabel ?? "").trim();
  return n && n.toLowerCase() !== "your niche" ? n : null;
}
