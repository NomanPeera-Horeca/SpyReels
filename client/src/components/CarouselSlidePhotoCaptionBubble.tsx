import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  CarouselEditableText,
  pickCarouselSlot,
} from "@/components/CarouselEditableText";

export type CarouselSlidePhotoCaptionBubbleProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  /** Shared cover photo URL (same image on every slide for shareCoverImage templates). */
  imageUrl?: string;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Full-bleed photo with a white rounded caption bubble (top-left).
 * Layout id: "photo_caption_bubble". No decoration layer.
 */
export function CarouselSlidePhotoCaptionBubble({
  tokens,
  values,
  handle,
  className,
  imageUrl,
  editable,
  onSlotChange,
}: CarouselSlidePhotoCaptionBubbleProps) {
  const headline = values.headline ?? "";
  const bodySlot = pickCarouselSlot(values, ["body", "subhead"]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        backgroundColor: tokens.colors.muted,
        backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderRadius: tokens.radiusPx ?? 0,
        width: "100%",
        maxWidth: "22.5rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: "1rem",
          left: "1rem",
          right: "1.5rem",
          maxWidth: "85%",
          backgroundColor: "#FFFFFF",
          color: tokens.colors.foreground,
          borderRadius: "0.85rem",
          padding: "0.85rem 1rem",
          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
          boxSizing: "border-box",
        }}
      >
        {headline ? (
          <CarouselEditableText
            as="h2"
            slotId="headline"
            value={headline}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(0.95rem, 3.8vw, 1.15rem)",
              fontWeight: 600,
              lineHeight: 1.35,
              letterSpacing: "-0.01em",
              color: tokens.colors.foreground,
            }}
          />
        ) : null}
        {bodySlot.value ? (
          <CarouselEditableText
            as="p"
            slotId={bodySlot.slotId}
            value={bodySlot.value}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: headline ? "0.55rem 0 0" : 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(0.85rem, 3.4vw, 1rem)",
              fontWeight: 400,
              lineHeight: 1.4,
              color: tokens.colors.foreground,
            }}
          />
        ) : null}
      </div>

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 1,
            bottom: "0.9rem",
            left: "1rem",
            fontSize: "0.65rem",
            fontFamily: tokens.fontFamily.body,
            color: "#FFFFFF",
            opacity: 0.9,
            letterSpacing: "0.02em",
            textShadow: "0 1px 3px rgba(0,0,0,0.65)",
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
