import type { CarouselDetectedSourceKind } from "@shared/carouselSourceDetector";
import { resolveCarouselLoadingView } from "@shared/carouselLoadingProgress";
import { CarouselLoadingDeck } from "./CarouselLoadingDeck";
import { CarouselProgress } from "./CarouselProgress";
import "./carouselStudioCreate.css";

export function CarouselLoading({
  sourceKind,
  isStartingGeneration,
  hasRemakeId,
  hasAngles,
  remakeStatus,
  progressStage,
  plannedSlideCount,
  slideTitles,
  hasImages,
  openingEditor,
  cancelled = false,
  onCancel,
}: {
  sourceKind: CarouselDetectedSourceKind;
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
  onCancel?: () => void;
}) {
  const view = resolveCarouselLoadingView({
    sourceKind,
    isStartingGeneration,
    hasRemakeId,
    hasAngles,
    remakeStatus,
    progressStage,
    plannedSlideCount,
    slideTitles,
    hasImages,
    openingEditor,
    cancelled,
  });

  return (
    <div
      className="carousel-loading-page"
      role="status"
      aria-live="polite"
      aria-busy={!view.openingEditor}
    >
      <h2 className="carousel-loading-title">Creating your carousel</h2>
      <div className="carousel-loading-source">
        <span className="carousel-source-dot" />
        <span>{view.sourceLine}</span>
      </div>
      <div className="carousel-step-count">{view.stepCountLabel}</div>
      <div className="carousel-stage-title">{view.title}</div>
      <p className="carousel-stage-sub">{view.sub}</p>
      {view.showPlanLine && view.plannedSlideCount != null ? (
        <div className="carousel-plan-line">
          <strong>{view.plannedSlideCount} slides</strong> planned
        </div>
      ) : null}

      <CarouselLoadingDeck
        visibleCardCount={view.visibleCardCount}
        overflowCount={view.overflowCount}
        mode={view.deckMode}
        titles={slideTitles}
      />

      <CarouselProgress
        stepIndex={view.stepIndex}
        trackPercent={view.trackPercent}
      />

      {view.openingEditor ? (
        <div className="carousel-opening">Opening editor...</div>
      ) : onCancel ? (
        <button type="button" className="carousel-cancel" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </div>
  );
}
