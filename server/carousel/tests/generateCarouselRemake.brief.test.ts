import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { buildCarouselRemakePrompt } from "../generateCarouselRemake";
import type { CarouselSlideSpec } from "@shared/carouselTemplates";

const slides: CarouselSlideSpec[] = [
  {
    id: "slide_01",
    role: "hook",
    viralWhy: "Stop the scroll",
    layoutId: "hook_bold_center",
    slots: [
      {
        id: "headline",
        role: "headline",
        label: "Headline",
        budget: { min: 8, max: 60 },
        defaultText: "Headline here",
      },
    ],
  },
];

function sampleBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: 2,
    isLegacy: false,
    id: "brief_2",
    kicker: "Diagnostic",
    title: "Cash is a system",
    description: "Show why cash runs out before profit.",
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "diagnostic",
    hook: "Profit on paper, empty in the bank.",
    corePromise: "See the cash leaks before they compound.",
    centralInsight: "Cash timing is the silent killer.",
    keyPoints: [
      {
        title: "Timing",
        explanation: "Money leaves before it arrives.",
        purpose: "Name the real problem.",
      },
      {
        title: "Receivables",
        explanation: "Unpaid invoices hide as profit.",
        purpose: "Show a leak.",
      },
      {
        title: "Inventory",
        explanation: "Stock can trap cash.",
        purpose: "Show a second leak.",
      },
      {
        title: "Check",
        explanation: "A weekly cash calendar prevents surprises.",
        purpose: "Give a next step.",
      },
    ],
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective: "Open on the profit vs cash gap.",
        recommendedVisual: "text",
      },
      {
        position: 2,
        role: "problem",
        objective: "Name the timing trap.",
        recommendedVisual: "diagram",
      },
      {
        position: 3,
        role: "insight",
        objective: "Show receivables as fake profit.",
        recommendedVisual: "comparison",
      },
      {
        position: 4,
        role: "example",
        objective: "Walk a one-week cash miss.",
        recommendedVisual: "timeline",
      },
      {
        position: 5,
        role: "takeaway",
        objective: "Give a weekly cash check.",
        recommendedVisual: "checklist",
      },
      {
        position: 6,
        role: "cta",
        objective: "Ask them to save the calendar.",
        recommendedVisual: "text",
      },
    ],
    layoutFamily: "breakdown",
    visualDirection: "Simple numbered breakdown cards.",
    imageDirection: "Neutral desk photos.",
    claimRisk: "medium",
    researchMode: "claim_verification",
    evidenceRequirements: ["Verify cash-cycle claims"],
    prohibitedClaims: ["Guaranteed profit in 30 days"],
    ctaDirection: "Download the cash calendar",
    scores: scoreCarouselCreativeBrief({
      relevance: 90,
      usefulness: 88,
      specificity: 80,
      visualPotential: 70,
      factualSafety: 86,
      originality: 60,
    }),
    confidence: 0.8,
  };
}

describe("generateCarouselRemake creative brief handoff", () => {
  it("keeps the structured brief separate from sourceContent", () => {
    const source = "Make me a carousel about why small businesses run out of cash.";
    const prompt = buildCarouselRemakePrompt(
      "Photo story",
      "Photo-led carousel",
      slides,
      "infer from source",
      new Map(),
      source,
      sampleBrief()
    );

    expect(prompt).toContain("A. ORIGINAL SOURCE MATERIAL");
    expect(prompt).toContain(source);
    expect(prompt).toContain("B. APPROVED CREATIVE BRIEF");
    expect(prompt).toContain(CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE);
    expect(prompt).toContain("Guaranteed profit in 30 days");
    expect(prompt).toContain("Download the cash calendar");
    expect(prompt).toContain('instead of defaulting to "Follow for more"');
    expect(prompt).toContain("Outline position N maps to the Nth slide exactly");
    expect(prompt).toContain("Slide slide_01 (position 1, layout role: hook)");
    expect(prompt).toContain("Many owners may have more than one");
    expect(prompt).not.toContain("Chosen carousel angle (follow this direction):");
  });

  it("does not prepend angleDirection when a creativeBrief option exists", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const remake = readFileSync(join(here, "../generateCarouselRemake.ts"), "utf8");
    expect(remake).toContain("creativeBrief?: CarouselCreativeBrief");
    expect(remake).toContain("if (!creativeBrief && angleDirection)");
    expect(remake).toContain("CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE");
  });
});
