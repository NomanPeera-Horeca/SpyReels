/** Test/dev fixtures only. Production Viral Posts uses the live API (Phase 3A). */
import type { ViralPost } from "@shared/viralPosts";

export const VIRAL_POSTS_SEED: ViralPost[] = [];

export const DAILY_VIRAL_POST_IDS: string[] = [];

export const EXPLORE_SUGGESTED_SEARCHES = [
  { label: "Menu engineering", query: "menu engineering mistakes for restaurants" },
  { label: "Labor cost", query: "restaurant labor cost tips for owners" },
  { label: "Kitchen buildouts", query: "kitchen buildout mistakes for restaurants" },
  { label: "Restaurant marketing", query: "restaurant marketing Reels that convert" },
  { label: "Leadership", query: "hospitality leadership advice for restaurant owners" },
] as const;
