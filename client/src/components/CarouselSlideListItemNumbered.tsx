import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselSlideListItemNumberedProps = {
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
 * Single-slide renderer for layoutId "list_item_numbered".
 * Uses template design tokens and slot values only (kicker, headline, body).
 */
export function CarouselSlideListItemNumbered({
  tokens,
  values,
  handle,
  className,
  editable,
  onSlotChange,
}: CarouselSlideListItemNumberedProps) {
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const body = values.body ?? "";

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
        alignItems: "flex-start",
        justifyContent: "center",
        textAlign: "left",
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
          alignItems: "flex-start",
          justifyContent: "center",
          textAlign: "left",
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
              marginBottom: "1.25rem",
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(3.25rem, 14vw, 4.5rem)",
              fontWeight: 700,
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
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
            fontSize: "clamp(1.45rem, 5.5vw, 1.85rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: tokens.colors.foreground,
            maxWidth: "18ch",
          }}
        />

        {body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
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
