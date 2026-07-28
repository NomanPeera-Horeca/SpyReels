import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";

export type CarouselSlideCtaBoldCenterProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Single-slide renderer for layoutId "cta_bold_center".
 * Uses template design tokens and slot values only (headline, subhead, cta_label).
 */
export function CarouselSlideCtaBoldCenter({
  tokens,
  values,
  handle,
  className,
}: CarouselSlideCtaBoldCenterProps) {
  const headline = values.headline ?? "";
  const subhead = values.subhead ?? "";
  const ctaLabel = values.cta_label ?? "";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        backgroundColor: tokens.colors.background,
        color: tokens.colors.foreground,
        borderRadius: tokens.radiusPx ?? 0,
        fontFamily: tokens.fontFamily.body,
        width: "100%",
        maxWidth: "22.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2.5rem 1.75rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.75rem, 7vw, 2.35rem)",
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            color: tokens.colors.foreground,
            maxWidth: "16ch",
          }}
        >
          {headline}
        </h2>

        {subhead ? (
          <p
            style={{
              margin: 0,
              marginTop: "1.25rem",
              fontFamily: tokens.fontFamily.body,
              fontSize: "0.95rem",
              fontWeight: 400,
              lineHeight: 1.45,
              color: tokens.colors.muted,
              maxWidth: "28ch",
            }}
          >
            {subhead}
          </p>
        ) : null}

        {ctaLabel ? (
          <span
            style={{
              display: "inline-block",
              marginTop: "1.75rem",
              padding: "0.65rem 1.25rem",
              borderRadius: "999px",
              fontFamily: tokens.fontFamily.body,
              fontSize: "0.85rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              backgroundColor: tokens.colors.accent,
              color: tokens.colors.background,
            }}
          >
            {ctaLabel}
          </span>
        ) : null}
      </div>

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 1,
            bottom: "0.9rem",
            left: "1.75rem",
            fontSize: "0.65rem",
            fontFamily: tokens.fontFamily.body,
            color: tokens.colors.muted,
            opacity: 0.85,
            letterSpacing: "0.02em",
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
