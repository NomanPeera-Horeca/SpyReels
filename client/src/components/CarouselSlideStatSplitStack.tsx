import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";

export type CarouselSlideStatSplitStackProps = {
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
 * Vertical 50/50 color split: top "The average..." stat, bottom punchy "Not Y".
 * Layout id: "stat_split_stack".
 */
export function CarouselSlideStatSplitStack({
  tokens,
  values,
  handle,
  className,
  imageUrl,
  imageUrlsBySlot,
}: CarouselSlideStatSplitStackProps) {
  const average = values.setup ?? values.average ?? values.headline ?? "";
  const notLine = values.echo ?? values.not_line ?? values.body ?? "";
  const topSrc = imageUrlsBySlot?.photo_top ?? imageUrl;
  const bottomSrc = imageUrlsBySlot?.photo_bottom ?? imageUrl;

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
        {average ? (
          <p
            style={{
              position: "relative",
              zIndex: 1,
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(1.05rem, 4.6vw, 1.4rem)",
              fontWeight: 700,
              lineHeight: 1.25,
              textAlign: "center",
              color: "#FFFFFF",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
              maxWidth: "16ch",
            }}
          >
            {average}
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
        {notLine ? (
          <p
            style={{
              position: "relative",
              zIndex: 1,
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(1.2rem, 5.2vw, 1.65rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              color: "#FFFFFF",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
              maxWidth: "12ch",
            }}
          >
            {notLine}
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
