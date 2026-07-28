import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { notebookGridStyle } from "@/components/carouselNotebookGrid";

export type CarouselSlideNotebookCoverProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  imageUrl?: string;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Notebook cover: grid paper, left headline, swipe line, bottom photo, doodle arrow.
 * Layout id: "notebook_cover".
 */
export function CarouselSlideNotebookCover({
  tokens,
  values,
  handle,
  className,
  imageUrl,
}: CarouselSlideNotebookCoverProps) {
  const headline = values.headline ?? "";
  const subhead = values.subhead ?? "";
  const kicker = values.kicker ?? "";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        ...notebookGridStyle(tokens.colors.background, tokens.backgroundPattern),
        color: tokens.colors.foreground,
        borderRadius: tokens.radiusPx ?? 0,
        fontFamily: tokens.fontFamily.body,
        width: "100%",
        maxWidth: "22.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "space-between",
        textAlign: "left",
        padding: "1.75rem 1.5rem 0",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.foreground} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.55rem, 6.5vw, 2.05rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: tokens.colors.foreground,
            maxWidth: "14ch",
          }}
        >
          {headline}
        </h2>
        {subhead ? (
          <p
            style={{
              margin: "0.85rem 0 0",
              fontFamily: tokens.fontFamily.body,
              fontSize: "0.9rem",
              fontWeight: 500,
              color: tokens.colors.foreground,
            }}
          >
            {subhead}
          </p>
        ) : null}
        {kicker ? (
          <p
            style={{
              position: "absolute",
              right: "0.25rem",
              top: "55%",
              margin: 0,
              fontFamily: tokens.fontFamily.body,
              fontSize: "0.75rem",
              fontStyle: "italic",
              color: tokens.colors.muted,
              maxWidth: "7ch",
              textAlign: "right",
            }}
          >
            {kicker}
          </p>
        ) : null}
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "48%",
          marginTop: "1rem",
          backgroundColor: imageUrl ? undefined : tokens.colors.muted,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          borderRadius: "0.5rem 0.5rem 0 0",
        }}
      />

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 2,
            bottom: "0.75rem",
            left: "1.5rem",
            fontSize: "0.65rem",
            fontFamily: tokens.fontFamily.body,
            color: tokens.colors.muted,
            opacity: 0.9,
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
