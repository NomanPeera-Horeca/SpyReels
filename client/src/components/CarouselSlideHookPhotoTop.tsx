import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";

export type CarouselSlideHookPhotoTopProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  /** Resolved image URL for this slide's single photo slot, if any. */
  imageUrl?: string;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Single-slide renderer for layoutId "hook_photo_top".
 * Photo fills the top ~55% of the slide; kicker/headline/subhead sit below
 * it on the solid background, same text styling as hook_bold_center.
 */
export function CarouselSlideHookPhotoTop({
  tokens,
  values,
  handle,
  className,
  imageUrl,
}: CarouselSlideHookPhotoTopProps) {
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const subhead = values.subhead ?? "";

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
        justifyContent: "flex-start",
        textAlign: "center",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "55%",
          flexShrink: 0,
          backgroundColor: tokens.colors.muted,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          padding: "1.5rem 1.75rem",
          boxSizing: "border-box",
        }}
      >
        {kicker ? (
          <p
            style={{
              margin: 0,
              marginBottom: "0.75rem",
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
            fontSize: "clamp(1.4rem, 6vw, 1.9rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: tokens.colors.foreground,
            maxWidth: "18ch",
          }}
        >
          {headline}
        </h2>

        {subhead ? (
          <p
            style={{
              margin: 0,
              marginTop: "0.9rem",
              fontFamily: tokens.fontFamily.body,
              fontSize: "0.85rem",
              fontWeight: 400,
              lineHeight: 1.4,
              color: tokens.colors.muted,
              maxWidth: "28ch",
            }}
          >
            {subhead}
          </p>
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
            color: tokens.colors.foreground,
            opacity: 0.85,
            letterSpacing: "0.02em",
            textShadow: "0 1px 3px rgba(0,0,0,0.6)",
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
