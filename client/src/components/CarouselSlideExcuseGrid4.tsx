import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";

export type CarouselSlideExcuseGrid4Props = {
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

const CELLS = [
  { slotId: "photo_tl", textId: "excuse_tl" },
  { slotId: "photo_tr", textId: "excuse_tr" },
  { slotId: "photo_bl", textId: "excuse_bl" },
  { slotId: "photo_br", textId: "excuse_br" },
] as const;

/**
 * 2x2 photo grid cover with strikethrough excuse text on each cell.
 * Layout id: "excuse_grid_4".
 */
export function CarouselSlideExcuseGrid4({
  tokens,
  values,
  handle,
  className,
  imageUrl,
  imageUrlsBySlot,
}: CarouselSlideExcuseGrid4Props) {
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
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: "2px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {CELLS.map((cell) => {
        const src = imageUrlsBySlot?.[cell.slotId] ?? imageUrl;
        const text = values[cell.textId] ?? "";
        return (
          <div
            key={cell.slotId}
            style={{
              position: "relative",
              backgroundColor: tokens.colors.muted,
              backgroundImage: src ? `url(${src})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.55rem",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.45))",
              }}
            />
            {text ? (
              <p
                style={{
                  position: "relative",
                  zIndex: 1,
                  margin: 0,
                  fontFamily: tokens.fontFamily.display,
                  fontSize: "clamp(0.72rem, 3.2vw, 0.95rem)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  textAlign: "center",
                  color: "#FFFFFF",
                  textDecoration: "line-through",
                  textDecorationThickness: "2px",
                  textShadow: "0 1px 4px rgba(0,0,0,0.85)",
                  maxWidth: "12ch",
                }}
              >
                {text}
              </p>
            ) : null}
          </div>
        );
      })}

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 2,
            bottom: "0.45rem",
            left: "0.55rem",
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
