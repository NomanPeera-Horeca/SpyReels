import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";

export type CarouselSlideHookBoldCenterProps = {
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
 * Single-slide renderer for layoutId "hook_bold_center".
 * Uses template design tokens and slot values only (kicker, headline, subhead).
 */
export function CarouselSlideHookBoldCenter({
  tokens,
  values,
  className,
}: CarouselSlideHookBoldCenterProps) {
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const subhead = values.subhead ?? "";

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
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2.5rem 1.75rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {kicker ? (
        <p
          style={{
            margin: 0,
            marginBottom: "1rem",
            fontFamily: tokens.fontFamily.body,
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
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
    </div>
  );
}
