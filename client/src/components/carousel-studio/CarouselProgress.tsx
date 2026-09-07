import { CAROUSEL_CUSTOMER_PROGRESS_STEPS } from "@shared/carouselLoadingProgress";

export function CarouselProgress({
  stepIndex,
  trackPercent,
}: {
  stepIndex: number;
  trackPercent: number;
}) {
  return (
    <>
      <div
        className="carousel-workflow"
        role="list"
        aria-label="Carousel creation steps"
      >
        {CAROUSEL_CUSTOMER_PROGRESS_STEPS.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <div
              key={step.id}
              role="listitem"
              className={`carousel-workflow-step${done ? " done" : ""}${
                active ? " active" : ""
              }`}
              aria-current={active ? "step" : undefined}
            >
              <div className="carousel-workflow-label">{step.workflowLabel}</div>
            </div>
          );
        })}
      </div>
      <div className="carousel-track">
        <div
          className="carousel-track-fill"
          style={{ width: `${Math.max(8, Math.min(100, trackPercent))}%` }}
        />
      </div>
    </>
  );
}
