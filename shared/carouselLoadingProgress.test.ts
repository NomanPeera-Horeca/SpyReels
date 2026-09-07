import { describe, expect, it } from "vitest";
import {
  CAROUSEL_CUSTOMER_PROGRESS_STEPS,
  CAROUSEL_LOADING_EARLY_CARD_COUNT,
  normalizePlannedSlideCount,
  resolveCarouselLoadingView,
  shouldOpenEditorFromRemakeStatus,
  shouldResumeCarouselLoading,
  shouldWatchCarouselRemakeStatus,
  type CarouselLoadingSignals,
} from "./carouselLoadingProgress";

function signals(
  overrides: Partial<CarouselLoadingSignals> = {}
): CarouselLoadingSignals {
  return {
    sourceKind: "idea",
    isStartingGeneration: true,
    hasRemakeId: false,
    hasAngles: false,
    remakeStatus: null,
    progressStage: null,
    plannedSlideCount: null,
    slideTitles: [],
    hasImages: false,
    openingEditor: false,
    ...overrides,
  };
}

describe("resolveCarouselLoadingView", () => {
  it("starts on understand with skeleton cards before any remake exists", () => {
    const view = resolveCarouselLoadingView(signals());
    expect(view.stepIndex).toBe(0);
    expect(view.title).toBe("Understanding your idea");
    expect(view.deckMode).toBe("early");
    expect(view.cardCount).toBe(CAROUSEL_LOADING_EARLY_CARD_COUNT);
    expect(view.showPlanLine).toBe(false);
    expect(view.openingEditor).toBe(false);
  });

  it("uses source-specific understand copy for a YouTube URL", () => {
    const view = resolveCarouselLoadingView(signals({ sourceKind: "youtube" }));
    expect(view.title).toBe("Understanding your video");
    expect(view.sourceLine).toBe("Based on a YouTube video");
  });

  it("marks story as active once angles and a remake id exist", () => {
    const view = resolveCarouselLoadingView(
      signals({
        hasAngles: true,
        hasRemakeId: true,
        remakeStatus: "processing",
        plannedSlideCount: 8,
      })
    );
    expect(view.stepIndex).toBe(2);
    expect(view.title).toBe("Building your carousel story");
    expect(view.showPlanLine).toBe(true);
    expect(view.plannedSlideCount).toBe(8);
    expect(view.cardCount).toBe(8);
    expect(view.visibleCardCount).toBe(5);
    expect(view.overflowCount).toBe(3);
    expect(view.deckMode).toBe("planned");
  });

  it("follows persisted remake progress stages without inventing extras", () => {
    expect(
      resolveCarouselLoadingView(
        signals({
          hasAngles: true,
          hasRemakeId: true,
          remakeStatus: "processing",
          progressStage: "writing_copy",
          plannedSlideCount: 6,
        })
      )
    ).toMatchObject({
      stepIndex: 3,
      title: "Writing your slides",
      deckMode: "planned",
    });

    expect(
      resolveCarouselLoadingView(
        signals({
          hasAngles: true,
          hasRemakeId: true,
          remakeStatus: "processing",
          progressStage: "generating_images",
          plannedSlideCount: 6,
        })
      )
    ).toMatchObject({
      stepIndex: 4,
      title: "Creating the visuals",
      deckMode: "visual",
    });

    expect(
      resolveCarouselLoadingView(
        signals({
          hasAngles: true,
          hasRemakeId: true,
          remakeStatus: "processing",
          progressStage: "saving",
          plannedSlideCount: 6,
        })
      )
    ).toMatchObject({
      stepIndex: 5,
      title: "Finishing your carousel",
    });
  });

  it("reveals real titles only when the backend has returned them", () => {
    const view = resolveCarouselLoadingView(
      signals({
        hasAngles: true,
        hasRemakeId: true,
        remakeStatus: "processing",
        progressStage: "writing_copy",
        plannedSlideCount: 6,
        slideTitles: ["Why most restaurants price backwards"],
      })
    );
    expect(view.deckMode).toBe("copy");
  });

  it("shows the editor handoff only after completion is observed", () => {
    const view = resolveCarouselLoadingView(
      signals({
        hasAngles: true,
        hasRemakeId: true,
        remakeStatus: "completed",
        plannedSlideCount: 6,
        openingEditor: true,
      })
    );
    expect(view.stepIndex).toBe(5);
    expect(view.openingEditor).toBe(true);
    expect(view.title).toBe("Opening editor...");
    expect(view.trackPercent).toBe(100);
    expect(CAROUSEL_CUSTOMER_PROGRESS_STEPS).toHaveLength(6);
  });

  it("does not treat zero or invalid planned counts as a plan line", () => {
    expect(normalizePlannedSlideCount(0)).toBeNull();
    expect(normalizePlannedSlideCount(-2)).toBeNull();
    expect(normalizePlannedSlideCount(Number.NaN)).toBeNull();
    const view = resolveCarouselLoadingView(
      signals({
        hasAngles: true,
        hasRemakeId: true,
        remakeStatus: "processing",
        plannedSlideCount: 0,
      })
    );
    expect(view.showPlanLine).toBe(false);
    expect(view.cardCount).toBe(CAROUSEL_LOADING_EARLY_CARD_COUNT);
  });

  it("does not open the editor after cancel even if the remake completed", () => {
    const view = resolveCarouselLoadingView(
      signals({
        remakeStatus: "completed",
        openingEditor: true,
        cancelled: true,
      })
    );
    expect(view.openingEditor).toBe(false);
    expect(view.title).not.toBe("Opening editor...");
    expect(
      shouldOpenEditorFromRemakeStatus({
        status: "completed",
        cancelled: true,
        isPollingRemake: false,
        isOpeningLibrary: false,
        openingEditor: false,
        createStep: "input",
      })
    ).toBe(false);
  });
});

describe("carousel remake status watch", () => {
  it("stops watching after cancel returns to input", () => {
    expect(
      shouldWatchCarouselRemakeStatus({
        remakeId: 18,
        createStep: "input",
        isOpeningLibrary: false,
        openingEditor: false,
      })
    ).toBe(false);
    expect(
      shouldWatchCarouselRemakeStatus({
        remakeId: 18,
        createStep: "progress",
        isOpeningLibrary: false,
        openingEditor: false,
      })
    ).toBe(true);
  });

  it("keeps the editor handoff live while openingEditor is already true", () => {
    expect(
      shouldOpenEditorFromRemakeStatus({
        status: "completed",
        cancelled: false,
        isPollingRemake: false,
        isOpeningLibrary: false,
        openingEditor: true,
        createStep: "progress",
      })
    ).toBe(true);
  });

  it("does not steal the editor from a stale completed cache on input", () => {
    expect(
      shouldOpenEditorFromRemakeStatus({
        status: "completed",
        cancelled: false,
        isPollingRemake: false,
        isOpeningLibrary: false,
        openingEditor: false,
        createStep: "input",
      })
    ).toBe(false);
  });

  it("resumes loading when a processing remake is reopened", () => {
    expect(
      shouldResumeCarouselLoading({
        isOpeningLibrary: true,
        status: "processing",
      })
    ).toBe(true);
    expect(
      shouldResumeCarouselLoading({
        isOpeningLibrary: true,
        status: "completed",
      })
    ).toBe(false);
  });
});
