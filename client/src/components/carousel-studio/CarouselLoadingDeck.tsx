import type { CarouselLoadingDeckMode } from "@shared/carouselLoadingProgress";

export function CarouselLoadingDeck({
  visibleCardCount,
  overflowCount,
  mode,
  titles,
}: {
  visibleCardCount: number;
  overflowCount: number;
  mode: CarouselLoadingDeckMode;
  titles: string[];
}) {
  return (
    <div className="carousel-deck-stage" aria-hidden="true">
      <div className="carousel-deck">
        {Array.from({ length: visibleCardCount }, (_, index) => {
          const title = titles[index]?.trim() || "";
          const showCopy = (mode === "copy" || mode === "visual") && title;
          return (
            <article
              key={index}
              className={`carousel-slide-card show${showCopy ? " copy-ready" : ""}${
                mode === "visual" ? " visual-ready" : ""
              }`}
            >
              <div className="carousel-slide-num">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="carousel-slide-visual" />
              <div className="carousel-slide-skeleton">
                <div className="carousel-skel-line" />
                <div className="carousel-skel-line short" />
                <div className="carousel-skel-line tiny" />
              </div>
              {showCopy ? (
                <div className="carousel-slide-copy">{title}</div>
              ) : null}
            </article>
          );
        })}
        {overflowCount > 0 ? (
          <div className="carousel-more-card show">
            <strong>+{overflowCount}</strong>
            <span>more</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
