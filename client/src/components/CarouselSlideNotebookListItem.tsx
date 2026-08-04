import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { notebookGridStyle } from "@/components/carouselNotebookGrid";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselSlideNotebookListItemProps = {
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
 * Notebook tip slide: grid paper, yellow highlighter on numbered headline, serif body.
 * Layout id: "notebook_list_item". No decoration (arrow stays on cover only).
 */
export function CarouselSlideNotebookListItem({
  tokens,
  values,
  handle,
  className,
  editable,
  onSlotChange,
}: CarouselSlideNotebookListItemProps) {
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const body = values.body ?? "";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
        ...notebookGridStyle(tokens.colors.background, tokens.backgroundPattern),
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
        padding: "2.25rem 1.65rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
        {(kicker || headline) ? (
          <h2
            style={{
              margin: 0,
              display: "inline",
              fontFamily: tokens.fontFamily.body,
              fontSize: "clamp(1.15rem, 4.8vw, 1.45rem)",
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: "-0.015em",
              color: tokens.colors.foreground,
              backgroundColor: tokens.colors.accent,
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              padding: "0.12em 0.28em",
              borderRadius: "0.15rem",
            }}
          >
            {kicker ? (
              <>
                <CarouselEditableText
                  as="span"
                  slotId="kicker"
                  value={kicker}
                  editable={editable}
                  onCommit={onSlotChange}
                  style={{ display: "inline" }}
                />
                {". "}
              </>
            ) : null}
            <CarouselEditableText
              as="span"
              slotId="headline"
              value={headline}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{ display: "inline" }}
            />
          </h2>
        ) : null}

        {body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: "1.35rem 0 0",
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(0.95rem, 3.8vw, 1.1rem)",
              fontWeight: 400,
              lineHeight: 1.45,
              color: tokens.colors.foreground,
              maxWidth: "28ch",
              whiteSpace: "pre-line",
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
            left: "1.65rem",
            fontSize: "0.65rem",
            fontFamily: tokens.fontFamily.body,
            color: tokens.colors.muted,
            opacity: 0.85,
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
