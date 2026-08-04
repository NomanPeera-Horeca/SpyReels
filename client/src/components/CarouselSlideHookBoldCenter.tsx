import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselSlideHookBoldCenterProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
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
  handle,
  className,
  editable,
  onSlotChange,
}: CarouselSlideHookBoldCenterProps) {
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const subhead = values.subhead ?? "";
  const textAlign = tokens.textAlign ?? "center";
  const isLeft = textAlign === "left";
  const alignItems = isLeft ? "flex-start" : "center";

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
        alignItems,
        justifyContent: "center",
        textAlign,
        padding: isLeft ? "2.75rem 1.85rem" : "2.5rem 1.75rem",
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
          alignItems,
          justifyContent: "center",
          textAlign,
          width: "100%",
        }}
      >
        {kicker ? (
          <CarouselEditableText
            as="p"
            slotId="kicker"
            value={kicker}
            editable={editable}
            onCommit={onSlotChange}
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
          />
        ) : null}

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
            fontSize: isLeft
              ? "clamp(1.85rem, 7.5vw, 2.5rem)"
              : "clamp(1.75rem, 7vw, 2.35rem)",
            fontWeight: 700,
            lineHeight: isLeft ? 1.28 : 1.12,
            letterSpacing: "-0.02em",
            color: tokens.colors.foreground,
            maxWidth: isLeft ? "14ch" : "16ch",
          }}
        />

        {subhead ? (
          <CarouselEditableText
            as="p"
            slotId="subhead"
            value={subhead}
            editable={editable}
            onCommit={onSlotChange}
            multiline
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
          />
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
