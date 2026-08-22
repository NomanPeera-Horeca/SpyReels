/**
 * Viral Posts client helpers.
 * Live data goes through tRPC (`trpc.viralPosts.*`) from the page.
 * Remake generation stays mocked until Phase 3B.
 */
import type { ViralRemakeAngle, ViralRemakePreview } from "./types";

/** Phase 3A: remake script generation remains simulated. */
export async function generateViralPostRemakeMock(args: {
  angle: ViralRemakeAngle;
  hook?: string | null;
}): Promise<ViralRemakePreview> {
  await new Promise((r) => setTimeout(r, 700));
  const base =
    args.hook?.trim() ||
    "Stop designing your menu before you understand what your kitchen can actually produce.";
  const newHook =
    args.angle === "story"
      ? "I learned this after watching owners spend on finishes before fixing kitchen flow."
      : args.angle === "contrarian"
        ? "Your menu is not the first thing you should design. Your kitchen flow is."
        : base.slice(0, 140);

  const script = `[HOOK] ${newHook}

[BODY] Most owners perfect the offer first. But expensive mistakes often begin with capacity, placement, and flow. Map the path before you spend on finishes. Then build an offer the operation can deliver profitably.

[CTA] Comment READY and I will send you the free checklist.`;

  const caption = `${newHook}

Walk the path before you redesign the offer.

Comment READY for the checklist.`;

  return {
    angle: args.angle,
    newHook,
    script,
    caption,
    shotGuidance: [
      "Original script in your voice",
      "Instagram-ready captions",
      "Shot guidance and B-roll suggestions",
    ],
    brollSuggestions: [
      "Walkthrough B-roll of the workspace",
      "Close-up of the key prop or screen",
      "Wide shot during peak activity",
    ],
  };
}

export const EXPLORE_SUGGESTED_SEARCHES = [
  { label: "Menu engineering", query: "menu engineering mistakes for restaurants" },
  { label: "Labor cost", query: "restaurant labor cost tips for owners" },
  { label: "Kitchen buildouts", query: "kitchen buildout mistakes for restaurants" },
  { label: "Restaurant marketing", query: "restaurant marketing Reels that convert" },
  { label: "Leadership", query: "hospitality leadership advice for restaurant owners" },
] as const;
