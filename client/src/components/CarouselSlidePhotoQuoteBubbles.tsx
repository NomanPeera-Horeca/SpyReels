import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  CarouselEditableText,
  pickCarouselSlot,
} from "@/components/CarouselEditableText";

export type CarouselSlidePhotoQuoteBubblesProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  imageUrl?: string;
  imageUrlsBySlot?: Record<string, string>;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Full-bleed photo with two centered white quote/CTA bubbles.
 * Layout id: "photo_quote_bubbles".
 */
export function CarouselSlidePhotoQuoteBubbles({
  tokens,
  values,
  handle,
  className,
  imageUrl,
  imageUrlsBySlot,
  editable,
  onSlotChange,
}: CarouselSlidePhotoQuoteBubblesProps) {
  const quoteSlot = pickCarouselSlot(values, ["quote", "headline"]);
  const ctaSlot = pickCarouselSlot(values, ["cta_label", "body"]);
  const src = imageUrlsBySlot?.photo ?? imageUrl;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        backgroundColor: tokens.colors.muted,
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderRadius: tokens.radiusPx ?? 0,
        width: "100%",
        maxWidth: "22.5rem",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.18)",
        }}
      />

      {quoteSlot.value ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            backgroundColor: "#FFFFFF",
            color: "#111111",
            borderRadius: "0.65rem",
            padding: "0.85rem 1rem",
            maxWidth: "92%",
            boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
            boxSizing: "border-box",
          }}
        >
          <CarouselEditableText
            as="p"
            slotId={quoteSlot.slotId}
            value={quoteSlot.value}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(0.95rem, 3.8vw, 1.15rem)",
              fontWeight: 700,
              lineHeight: 1.35,
              textAlign: "center",
              color: "#111111",
            }}
          />
        </div>
      ) : null}

      {ctaSlot.value ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            backgroundColor: "#FFFFFF",
            color: "#111111",
            borderRadius: "0.65rem",
            padding: "0.55rem 0.9rem",
            maxWidth: "92%",
            boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
            boxSizing: "border-box",
          }}
        >
          <CarouselEditableText
            as="p"
            slotId={ctaSlot.slotId}
            value={ctaSlot.value}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(0.85rem, 3.4vw, 1rem)",
              fontWeight: 700,
              lineHeight: 1.3,
              textAlign: "center",
              color: "#111111",
            }}
          />
        </div>
      ) : null}

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 2,
            bottom: "0.9rem",
            left: "1rem",
            fontSize: "0.65rem",
            fontFamily: tokens.fontFamily.body,
            color: "#FFFFFF",
            opacity: 0.9,
            textShadow: "0 1px 3px rgba(0,0,0,0.65)",
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
