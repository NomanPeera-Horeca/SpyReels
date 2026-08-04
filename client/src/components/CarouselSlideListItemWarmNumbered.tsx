import { useId, useRef, useState, type KeyboardEvent } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselSlideListItemWarmNumberedProps = {
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

function parseCalloutLines(raw: string): string[] {
  return raw
    .split(/\n|•|;/)
    .map((line) => line.replace(/^[-*✓✔]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Warm editorial numbered tip slide with kraft grain, underline accent,
 * optional checkmark callout, and decoration layer (e.g. arrow).
 * Layout id: "list_item_warm_numbered".
 */
export function CarouselSlideListItemWarmNumbered({
  tokens,
  values,
  handle,
  className,
  editable,
  onSlotChange,
}: CarouselSlideListItemWarmNumberedProps) {
  const grainId = `warm-kraft-grain-${useId().replace(/:/g, "")}`;
  const kicker = values.kicker ?? "";
  const headline = values.headline ?? "";
  const body = values.body ?? "";
  const calloutRaw = values.callout ?? "";
  const calloutLines = parseCalloutLines(calloutRaw);
  const [editingCallout, setEditingCallout] = useState(false);
  const calloutRef = useRef<HTMLDivElement | null>(null);
  const skipCalloutCommitRef = useRef(false);

  function commitCallout() {
    const raw = (calloutRef.current?.innerText ?? calloutRaw).replace(/\u00a0/g, " ");
    const next = raw.replace(/^\n+/, "").replace(/\n+$/, "");
    setEditingCallout(false);
    if (next !== calloutRaw) {
      onSlotChange?.("callout", next);
    }
  }

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
        padding: "2.35rem 1.7rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Kraft / paper grain: warm base already on backgroundColor + SVG noise */}
      <svg
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.07,
        }}
      >
        <defs>
          <filter id={grainId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${grainId})`} />
      </svg>

      <CarouselDecorationLayer type="arrow" color={tokens.colors.foreground} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          width: "100%",
        }}
      >
        {(kicker || headline) ? (
          <div style={{ marginBottom: "1.1rem", maxWidth: "100%" }}>
            <h2
              style={{
                margin: 0,
                fontFamily: tokens.fontFamily.display,
                fontSize: "clamp(1.35rem, 5.2vw, 1.75rem)",
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
                color: tokens.colors.foreground,
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
                    style={{ marginRight: "0.35rem" }}
                  />
                  {"."}
                  {" "}
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
            <svg
              width="72"
              height="10"
              viewBox="0 0 72 10"
              style={{ display: "block", marginTop: "0.35rem" }}
              aria-hidden
            >
              <path
                d="M 2 6 Q 18 2, 36 7 T 70 5"
                fill="none"
                stroke={tokens.colors.accent}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
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
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(0.92rem, 3.6vw, 1.05rem)",
              fontWeight: 400,
              lineHeight: 1.45,
              color: tokens.colors.foreground,
              maxWidth: "30ch",
            }}
          />
        ) : null}

        {calloutLines.length > 0 || (editable && calloutRaw) ? (
          <div
            style={{
              marginTop: "1.35rem",
              width: "100%",
              maxWidth: "100%",
              backgroundColor: "rgba(255,255,255,0.72)",
              border: `1px solid ${tokens.colors.muted}`,
              borderRadius: "0.45rem",
              padding: "0.75rem 0.85rem",
              boxSizing: "border-box",
              cursor: editable ? "text" : undefined,
            }}
            title={editable ? "Click to edit" : undefined}
            onClick={
              editable && !editingCallout
                ? () => {
                    setEditingCallout(true);
                    requestAnimationFrame(() => {
                      const el = calloutRef.current;
                      if (!el) return;
                      el.innerText = calloutRaw;
                      el.focus();
                    });
                  }
                : undefined
            }
          >
            {editable && editingCallout ? (
              <div
                ref={calloutRef}
                contentEditable
                suppressContentEditableWarning
                data-carousel-editing="true"
                data-carousel-slot-id="callout"
                style={{
                  margin: 0,
                  fontFamily: tokens.fontFamily.body,
                  fontSize: "0.8rem",
                  lineHeight: 1.35,
                  color: tokens.colors.foreground,
                  whiteSpace: "pre-wrap",
                  outline: "1px dashed rgba(232,165,75,0.85)",
                  outlineOffset: "2px",
                  caretColor: "currentColor",
                }}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => {
                  if (skipCalloutCommitRef.current) {
                    skipCalloutCommitRef.current = false;
                    setEditingCallout(false);
                    return;
                  }
                  commitCallout();
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    skipCalloutCommitRef.current = true;
                    setEditingCallout(false);
                    (e.currentTarget as HTMLElement).blur();
                  }
                }}
              />
            ) : (
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                }}
              >
                {calloutLines.map((line) => (
                  <li
                    key={line}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.45rem",
                      fontFamily: tokens.fontFamily.body,
                      fontSize: "0.8rem",
                      lineHeight: 1.35,
                      color: tokens.colors.foreground,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        color: tokens.colors.accent,
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: "0.05rem",
                      }}
                    >
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {handle ? (
        <span
          style={{
            position: "absolute",
            zIndex: 1,
            bottom: "0.9rem",
            left: "1.7rem",
            fontSize: "0.65rem",
            fontFamily: tokens.fontFamily.body,
            color: tokens.colors.muted,
            opacity: 0.9,
          }}
        >
          {handle}
        </span>
      ) : null}
    </div>
  );
}
