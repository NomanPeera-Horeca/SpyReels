/**
 * Fixture-driven Breakdown/Listicle slice for Remake 67.
 * Planning IR is real. Visual Director decisions are mocked so the
 * eight slides use varied treatments. Pixels still come from the family.
 */

import {
  compilePlanningIRToBaselineCompositionIR,
  validateCarouselCompositionIR,
  type CarouselCompositionIR,
  type CarouselCompositionSlide,
} from "./carouselCompositionIR";
import {
  compileCreativeBriefToPlanningIR,
  type CarouselPlanningIR,
} from "./carouselPlanningIR";
import {
  CASH_DRAINS_REMAKE_67_CORRECTED_VALUES,
  OPEN_CASH_FLOW_USER_PROMPT,
  cashDrainsRemake67CorrectedBrief,
} from "../server/carousel/tests/fixtures/cashDrainsRemake67";
import {
  applyPlanningSequenceToCopy,
  buildBreakdownListicleSlides,
} from "./carouselBreakdownFamily";
import {
  CAROUSEL_TEMPLATES_BY_ID,
  type CarouselImageUrlMap,
  type CarouselSlideSpec,
  type CarouselSlotValues,
} from "./carouselTemplates";
import { CAROUSEL_STUDIO_TEMPLATE_ID } from "./carouselStudio";

export const CASH_DRAINS_BREAKDOWN_SLICE_TITLE =
  "The 6 Silent Cash Drains Killing Small Businesses";

export function cashDrainsBreakdownPlanningIR(): CarouselPlanningIR {
  return compileCreativeBriefToPlanningIR({
    brief: cashDrainsRemake67CorrectedBrief(),
    sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
  });
}

function withArchetype(
  slide: CarouselCompositionSlide,
  archetype: CarouselCompositionSlide["archetype"]
): CarouselCompositionSlide {
  if (archetype === "text_focus" || archetype === "number_focus") {
    return {
      ...slide,
      archetype,
      visualRegions: [],
      emphasis: slide.semanticRole === "cover" ? "headline" : slide.emphasis,
    };
  }
  if (archetype === "text_visual_split") {
    return {
      ...slide,
      archetype,
      emphasis: "visual",
      visualRegions: [{ role: "supporting", kind: "photo", placement: "right" }],
    };
  }
  if (archetype === "comparison_split") {
    return {
      ...slide,
      archetype,
      emphasis: "comparison",
      visualRegions: [{ role: "primary", kind: "comparison", placement: "split" }],
    };
  }
  if (archetype === "diagram_focus") {
    return {
      ...slide,
      archetype,
      visualRegions: [{ role: "primary", kind: "diagram", placement: "center" }],
    };
  }
  if (archetype === "timeline_flow") {
    return {
      ...slide,
      archetype,
      visualRegions: [{ role: "primary", kind: "timeline", placement: "center" }],
    };
  }
  if (archetype === "closing_focus") {
    return {
      ...slide,
      archetype: "closing_focus",
      emphasis: "cta",
      visualRegions: [],
    };
  }
  return slide;
}

/** Mocked Visual Director choices for the 8-slide cash-drains proof. */
export function cashDrainsVariedCompositionIR(
  planningIR: CarouselPlanningIR
): CarouselCompositionIR {
  const baseline = compilePlanningIRToBaselineCompositionIR(planningIR);
  const archetypes: Array<CarouselCompositionSlide["archetype"]> = [
    "text_focus",
    "comparison_split",
    "number_focus",
    "diagram_focus",
    "timeline_flow",
    "text_visual_split",
    "number_focus",
    "closing_focus",
  ];
  const compositionIR: CarouselCompositionIR = {
    ...baseline,
    slides: baseline.slides.map((slide, index) =>
      withArchetype(slide, archetypes[index] ?? slide.archetype)
    ),
  };
  const issues = validateCarouselCompositionIR(compositionIR, planningIR);
  if (issues.length > 0) {
    throw new Error(`Cash drains fixture Composition IR invalid: ${issues.join("; ")}`);
  }
  return compositionIR;
}

export function cashDrainsBreakdownSliceValues(): Record<string, CarouselSlotValues> {
  return {
    slide_01: {
      kicker: "CASH FLOW",
      headline: "Profitable on paper, empty at the bank",
      body: "The gap is usually a drain you can name, not a sales problem.",
    },
    slide_02: {
      kicker: "01",
      headline: "Paper profit is not spendable cash",
      body: "A strong P and L can still hide a dry checking account.",
      left: "Profit",
      right: "Cash",
      support: "On paper vs in the bank",
    },
    slide_03: {
      kicker: "02",
      headline: "Slow invoicing delays the deposit",
      body: "Work can be done while payment is still weeks away.",
    },
    slide_04: {
      kicker: "03",
      headline: "Dead stock traps working capital",
      body: "Unsold goods lock cash on the shelf instead of in the bank.",
      support: "Buy stock\nSits unsold\nCash stays trapped",
    },
    slide_05: {
      kicker: "04",
      headline: "You pay out faster than you collect",
      body: "Mismatched terms create a float problem owners rarely name.",
      support: "Invoice sent\nCustomer pays\nSuppliers get paid first",
    },
    slide_06: {
      kicker: "05",
      headline: "No reserve turns a slow week into a crisis",
      body: "A quiet month becomes urgent when there is no buffer.",
    },
    slide_07: {
      kicker: "06",
      headline: "Tax season arrives as a lump-sum shock",
      body: "Money that was never set aside still comes due.",
    },
    slide_08: {
      headline: "Which drain is hitting you now?",
      body: "Name it, comment it, and keep this list nearby.",
      cta_label: "Comment your drain",
    },
  };
}

export function cashDrainsBreakdownSliceImageUrls(): CarouselImageUrlMap {
  return {
    slide_06:
      "https://images.pexels.com/photos/590022/pexels-photo-590022.jpeg?auto=compress&cs=tinysrgb&w=800",
  };
}

export function buildCashDrainsBreakdownSlice(): {
  planningIR: CarouselPlanningIR;
  compositionIR: CarouselCompositionIR;
  slides: CarouselSlideSpec[];
  values: Record<string, CarouselSlotValues>;
  imageUrls: CarouselImageUrlMap;
} {
  const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID);
  if (!template) {
    throw new Error("Studio template photo_story_test is missing");
  }
  const planningIR = cashDrainsBreakdownPlanningIR();
  const compositionIR = cashDrainsVariedCompositionIR(planningIR);
  const slides = buildBreakdownListicleSlides({
    template,
    planningIR,
    compositionIR,
  });
  const values = applyPlanningSequenceToCopy(
    slides,
    cashDrainsBreakdownSliceValues()
  );
  return {
    planningIR,
    compositionIR,
    slides,
    values,
    imageUrls: cashDrainsBreakdownSliceImageUrls(),
  };
}

export const CASH_DRAINS_CORRECTED_COPY_VALUES =
  CASH_DRAINS_REMAKE_67_CORRECTED_VALUES;
