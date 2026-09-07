/**
 * Translate real carousel generation signals into customer-facing loading UI.
 * Does not invent stages or simulate time. Callers must pass observed state only.
 */
import type { CarouselDetectedSourceKind } from "./carouselSourceDetector";

export const CAROUSEL_CUSTOMER_PROGRESS_STEPS = [
  { id: "understand", workflowLabel: "Understand" },
  { id: "angle", workflowLabel: "Angle" },
  { id: "story", workflowLabel: "Story" },
  { id: "write", workflowLabel: "Write" },
  { id: "visuals", workflowLabel: "Visuals" },
  { id: "finish", workflowLabel: "Finish" },
] as const;

export type CarouselCustomerProgressStepId =
  (typeof CAROUSEL_CUSTOMER_PROGRESS_STEPS)[number]["id"];

export type CarouselLoadingDeckMode = "early" | "planned" | "copy" | "visual";

export const CAROUSEL_EDITOR_HANDOFF_MS = 400;
export const CAROUSEL_LOADING_EARLY_CARD_COUNT = 3;
export const CAROUSEL_LOADING_VISIBLE_CARD_MAX = 5;

export type CarouselLoadingSignals = {
  sourceKind: CarouselDetectedSourceKind;
  /** generateFromInput / generateCarousel is in flight. */
  isStartingGeneration: boolean;
  hasRemakeId: boolean;
  hasAngles: boolean;
  remakeStatus: string | null | undefined;
  progressStage: string | null | undefined;
  plannedSlideCount: number | null;
  slideTitles: string[];
  hasImages: boolean;
  openingEditor: boolean;
  cancelled?: boolean;
};

export function normalizePlannedSlideCount(
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const count = Math.floor(value);
  return count > 0 ? count : null;
}

export function shouldWatchCarouselRemakeStatus(args: {
  remakeId: number | null;
  createStep: string;
  isOpeningLibrary: boolean;
  openingEditor: boolean;
}): boolean {
  if (args.remakeId == null) return false;
  return (
    args.createStep === "progress" ||
    args.createStep === "editor" ||
    args.isOpeningLibrary ||
    args.openingEditor
  );
}

export function shouldOpenEditorFromRemakeStatus(args: {
  status: string | null | undefined;
  cancelled: boolean;
  isPollingRemake: boolean;
  isOpeningLibrary: boolean;
  openingEditor: boolean;
  createStep: string;
}): boolean {
  if (args.cancelled) return false;
  if (args.status !== "completed") return false;
  return (
    args.isPollingRemake ||
    args.isOpeningLibrary ||
    args.openingEditor ||
    args.createStep === "progress"
  );
}

export function shouldResumeCarouselLoading(args: {
  isOpeningLibrary: boolean;
  status: string | null | undefined;
}): boolean {
  return (
    args.isOpeningLibrary &&
    (args.status === "processing" || args.status === "pending")
  );
}

export type CarouselLoadingView = {
  stepIndex: number;
  stepCountLabel: string;
  title: string;
  sub: string;
  sourceLine: string;
  plannedSlideCount: number | null;
  showPlanLine: boolean;
  deckMode: CarouselLoadingDeckMode;
  cardCount: number;
  visibleCardCount: number;
  overflowCount: number;
  trackPercent: number;
  openingEditor: boolean;
};

function understandCopy(kind: CarouselDetectedSourceKind): {
  title: string;
  sub: string;
} {
  if (kind === "youtube") {
    return {
      title: "Understanding your video",
      sub: "Reading the source and identifying the strongest material to work with.",
    };
  }
  if (kind === "article") {
    return {
      title: "Reading your article",
      sub: "Reading the source and identifying the strongest material to work with.",
    };
  }
  if (kind === "instagram" || kind === "linkedin" || kind === "carousel") {
    return {
      title: "Understanding the post",
      sub: "Reading the source and identifying the strongest material to work with.",
    };
  }
  return {
    title: "Understanding your idea",
    sub: "Reading what you gave us and identifying what matters most.",
  };
}

function sourceLine(kind: CarouselDetectedSourceKind): string {
  if (kind === "youtube") return "Based on a YouTube video";
  if (kind === "article") return "Based on an article";
  if (kind === "instagram") return "Based on an Instagram post";
  if (kind === "linkedin") return "Based on a LinkedIn post";
  if (kind === "carousel") return "Based on an existing carousel";
  return "Based on your idea";
}

function stepCopy(
  stepIndex: number,
  kind: CarouselDetectedSourceKind
): { title: string; sub: string } {
  if (stepIndex <= 0) return understandCopy(kind);
  if (stepIndex === 1) {
    return {
      title: "Finding the strongest angle",
      sub: "Comparing possible directions and choosing the one most likely to keep people swiping.",
    };
  }
  if (stepIndex === 2) {
    return {
      title: "Building your carousel story",
      sub: "Deciding the slide count, structure, pacing, and visual direction.",
    };
  }
  if (stepIndex === 3) {
    return {
      title: "Writing your slides",
      sub: "Writing the hook, slide copy, transitions, and closing for the planned structure.",
    };
  }
  if (stepIndex === 4) {
    return {
      title: "Creating the visuals",
      sub: "Preparing image prompts, creating or selecting visuals, and placing them into the slides.",
    };
  }
  return {
    title: "Finishing your carousel",
    sub: "Saving the final slide structure, copy, and visuals.",
  };
}

/**
 * Map observed remake / mutation state onto the six customer stages.
 * Angle becomes done only after briefs exist. Copy/visual cards stay
 * skeletal until real titles or images are present.
 */
export function resolveCarouselLoadingView(
  signals: CarouselLoadingSignals
): CarouselLoadingView {
  let stepIndex = 0;

  if (
    !signals.cancelled &&
    (signals.openingEditor || signals.remakeStatus === "completed")
  ) {
    stepIndex = 5;
  } else if (signals.progressStage === "saving") {
    stepIndex = 5;
  } else if (signals.progressStage === "generating_images") {
    stepIndex = 4;
  } else if (signals.progressStage === "writing_copy") {
    stepIndex = 3;
  } else if (signals.hasAngles && signals.hasRemakeId) {
    stepIndex = 2;
  } else if (signals.hasAngles) {
    stepIndex = 1;
  } else {
    stepIndex = 0;
  }

  const planned = normalizePlannedSlideCount(signals.plannedSlideCount);
  const showPlanLine = stepIndex >= 2 && planned != null;
  const hasCopy = signals.slideTitles.some((title) => title.trim().length > 0);

  let deckMode: CarouselLoadingDeckMode = "early";
  if (stepIndex >= 4 || signals.hasImages) {
    deckMode = "visual";
  } else if (stepIndex >= 3 && hasCopy) {
    deckMode = "copy";
  } else if (stepIndex >= 2) {
    deckMode = "planned";
  } else if (signals.isStartingGeneration) {
    deckMode = "early";
  }

  const cardCount =
    deckMode === "early" || planned == null
      ? CAROUSEL_LOADING_EARLY_CARD_COUNT
      : planned;
  const visibleCardCount = Math.min(cardCount, CAROUSEL_LOADING_VISIBLE_CARD_MAX);
  const overflowCount = Math.max(0, cardCount - visibleCardCount);
  const openingEditor =
    !signals.cancelled &&
    (signals.openingEditor || signals.remakeStatus === "completed");
  const copy = openingEditor
    ? {
        title: "Opening editor...",
        sub: "Your carousel is ready. Taking you to the editor.",
      }
    : stepCopy(stepIndex, signals.sourceKind);

  const trackPercent = openingEditor
    ? 100
    : Math.round(((stepIndex + 1) / CAROUSEL_CUSTOMER_PROGRESS_STEPS.length) * 100);

  return {
    stepIndex,
    stepCountLabel: `Step ${stepIndex + 1} of ${CAROUSEL_CUSTOMER_PROGRESS_STEPS.length}`,
    title: copy.title,
    sub: copy.sub,
    sourceLine: sourceLine(signals.sourceKind),
    plannedSlideCount: planned,
    showPlanLine,
    deckMode,
    cardCount,
    visibleCardCount,
    overflowCount,
    trackPercent,
    openingEditor,
  };
}
