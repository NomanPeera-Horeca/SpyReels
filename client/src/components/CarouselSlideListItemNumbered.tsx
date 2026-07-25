import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";

export type CarouselSlideListItemNumberedProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  className?: string;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Single-slide renderer for layoutId "list_item_numbered".
 * Uses template design tokens and slot values only (kicker, headline, body).
 */
export function CarouselSlideListItemNumbered({
  tokens,
  values,
  className,
}: CarouselSlideListItemNumberedProps) {
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const body = values.body ?? "";

  return (
    <div
      className={className}
      style={{
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        backgroundColor: tokens.colors.background,
        color: tokens.colors.foreground,
        borderRadius: tokens.radiusPx ?? 0,
        fontFamily: tokens.fontFamily.body,
        width: "100%",
        maxWidth: "22.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        textAlign: "left",
        padding: "2.5rem 1.75rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {kicker ? (
        <p
          style={{
            margin: 0,
            marginBottom: "1.25rem",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(3.25rem, 14vw, 4.5rem)",
            fontWeight: 700,
            lineHeight: 0.9,
            letterSpacing: "-0.03em",
            color: tokens.colors.accent,
          }}
        >
          {kicker}
        </p>
      ) : null}

      <h2
        style={{
          margin: 0,
          fontFamily: tokens.fontFamily.display,
          fontSize: "clamp(1.45rem, 5.5vw, 1.85rem)",
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: tokens.colors.foreground,
          maxWidth: "18ch",
        }}
      >
        {headline}
      </h2>

      {body ? (
        <p
          style={{
            margin: 0,
            marginTop: "1rem",
            fontFamily: tokens.fontFamily.body,
            fontSize: "0.95rem",
            fontWeight: 400,
            lineHeight: 1.5,
            color: tokens.colors.muted,
            maxWidth: "32ch",
          }}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
