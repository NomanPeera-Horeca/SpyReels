import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";

export type CarouselSlideExcuseSplitStackProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  imageUrl?: string;
  imageUrlsBySlot?: Record<string, string>;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

/**
 * Vertical split: top B&W + strikethrough excuse, bottom color + reframe.
 * Layout id: "excuse_split_stack".
 */
export function CarouselSlideExcuseSplitStack({
  tokens,
  values,
  handle,
  className,
  imageUrl,
  imageUrlsBySlot,
}: CarouselSlideExcuseSplitStackProps) {
  const excuse = values.excuse ?? values.headline ?? "";
  const reframe = values.reframe ?? values.body ?? "";
  const topSrc = imageUrlsBySlot?.photo_before ?? imageUrl;
  const bottomSrc = imageUrlsBySlot?.photo_after ?? imageUrl;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        backgroundColor: "#000000",
        color: "#FFFFFF",
        borderRadius: tokens.radiusPx ?? 0,
        width: "100%",
        maxWidth: "22.5rem",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          flex: "1 1 50%",
          minHeight: 0,
          backgroundColor: tokens.colors.muted,
          backgroundImage: topSrc ? `url(${topSrc})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.28)",
          }}
        />
        {excuse ? (
          <p
            style={{
              position: "relative",
              zIndex: 1,
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(1.15rem, 5vw, 1.55rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              color: "#FFFFFF",
              textDecoration: "line-through",
              textDecorationThickness: "3px",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
              maxWidth: "14ch",
            }}
          >
            {excuse}
          </p>
        ) : null}
      </div>

      <div
        style={{
          position: "relative",
          flex: "1 1 50%",
          minHeight: 0,
          backgroundColor: tokens.colors.muted,
          backgroundImage: bottomSrc ? `url(${bottomSrc})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.22)",
          }}
        />
        {reframe ? (
          <p
            style={{
              position: "relative",
              zIndex: 1,
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(1.15rem, 5vw, 1.55rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              color: "#FFFFFF",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
              maxWidth: "14ch",
            }}
          >
            {reframe}
          </p>
        ) : null}
      </div>

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 2,
            bottom: "0.55rem",
            left: "0.7rem",
            fontSize: "0.6rem",
            fontFamily: tokens.fontFamily.body,
            color: "#FFFFFF",
            opacity: 0.85,
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
