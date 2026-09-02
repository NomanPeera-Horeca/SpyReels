import type { CSSProperties, ReactElement } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  breakdownChecklistLines,
  breakdownDataPoint,
  breakdownDiagramNodes,
  breakdownRegionCopy,
  breakdownSequenceLabel,
  resolveBreakdownListicleRenderTreatment,
  splitNativeSteps,
  type BreakdownListicleTreatment,
} from "@shared/carouselBreakdownFamily";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselBreakdownListicleFamilyProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  imageUrl?: string;
  className?: string;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
  composition?: {
    family?: string;
    archetype?: string;
    treatment?: string;
    semanticRole?: string;
    listItemIndex?: number | null;
  };
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

type TreatmentProps = CarouselBreakdownListicleFamilyProps & {
  treatment: BreakdownListicleTreatment;
  sequence: string | null;
};

function shellStyle(tokens: CarouselDesignTokens): CSSProperties {
  return {
    position: "relative",
    aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
    backgroundColor: tokens.colors.background,
    color: tokens.colors.foreground,
    borderRadius: tokens.radiusPx ?? 0,
    fontFamily: tokens.fontFamily.body,
    width: "100%",
    maxWidth: "22.5rem",
    boxSizing: "border-box",
    overflow: "hidden",
  };
}

function wash(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

function recessedCard(tokens: CarouselDesignTokens): CSSProperties {
  return {
    background: wash(tokens.colors.foreground, 0.045),
    border: `1px solid ${wash(tokens.colors.foreground, 0.1)}`,
    borderRadius: "0.95rem",
  };
}

function accentCard(tokens: CarouselDesignTokens, strong = false): CSSProperties {
  return {
    background: wash(tokens.colors.accent, strong ? 0.2 : 0.12),
    border: `1px solid ${wash(tokens.colors.accent, strong ? 0.85 : 0.55)}`,
    borderRadius: "0.95rem",
  };
}

function bodySlideHeadlineStyle(
  tokens: CarouselDesignTokens,
  extra?: CSSProperties
): CSSProperties {
  return {
    margin: 0,
    fontFamily: tokens.fontFamily.display,
    fontSize: "clamp(1.38rem, 5.3vw, 1.7rem)",
    fontWeight: 700,
    lineHeight: 1.16,
    letterSpacing: "-0.03em",
    ...extra,
  };
}

function bodyCopyStyle(
  tokens: CarouselDesignTokens,
  extra?: CSSProperties
): CSSProperties {
  return {
    margin: 0,
    fontSize: "0.86rem",
    lineHeight: 1.48,
    color: tokens.colors.muted,
    ...extra,
  };
}

function AccentRail({ tokens }: { tokens: CarouselDesignTokens }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: "0.28rem",
        backgroundColor: tokens.colors.accent,
        zIndex: 1,
      }}
    />
  );
}

function HandleMark({
  handle,
  tokens,
}: {
  handle?: string;
  tokens: CarouselDesignTokens;
}) {
  if (!handle) return null;
  return (
    <span
      style={{
        position: "absolute",
        zIndex: 2,
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
  );
}

function SequenceMark({
  sequence,
  tokens,
  size = "hero",
}: {
  sequence: string | null;
  tokens: CarouselDesignTokens;
  size?: "hero" | "small";
}) {
  if (!sequence) return null;
  return (
    <CarouselEditableText
      as="p"
      slotId="kicker"
      value={sequence}
      style={{
        margin: 0,
        fontFamily: tokens.fontFamily.display,
        fontSize: size === "hero" ? "clamp(3.4rem, 15vw, 4.75rem)" : "1.02rem",
        fontWeight: 700,
        lineHeight: 0.9,
        letterSpacing: size === "hero" ? "-0.03em" : "0.04em",
        color: tokens.colors.accent,
      }}
    />
  );
}

function StrongCoverTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
}: TreatmentProps) {
  const kicker = breakdownRegionCopy(values, "kicker");
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2.05rem 1.65rem 2.1rem 1.85rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <AccentRail tokens={tokens} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {kicker ? (
          <CarouselEditableText
            as="p"
            slotId="kicker"
            value={kicker}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              display: "inline-block",
              margin: 0,
              padding: "0.38rem 0.7rem",
              borderRadius: "999px",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              backgroundColor: tokens.colors.accent,
              color: tokens.colors.background,
            }}
          />
        ) : null}
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
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
            fontSize: "clamp(2.35rem, 9.6vw, 3.05rem)",
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: "-0.04em",
            maxWidth: "13ch",
          }}
        />
        <div
          style={{
            width: "2.6rem",
            height: "0.26rem",
            margin: "1.15rem 0 1rem",
            backgroundColor: tokens.colors.accent,
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
            style={bodyCopyStyle(tokens, {
              fontSize: "0.9rem",
              lineHeight: 1.5,
              maxWidth: "30ch",
            })}
          />
        ) : null}
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function TextFocusTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "2.25rem 1.7rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodySlideHeadlineStyle(tokens, {
            margin: sequence ? "0.8rem 0 0" : 0,
            fontSize: "clamp(1.7rem, 6.6vw, 2.15rem)",
            maxWidth: "13ch",
          })}
        />
        {body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={bodyCopyStyle(tokens, {
              margin: "1.05rem 0 0",
              fontSize: "0.9rem",
              maxWidth: "30ch",
            })}
          />
        ) : null}
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function NumberFocusTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "2.4rem 1.75rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="hero" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodySlideHeadlineStyle(tokens, {
            margin: "1.05rem 0 0",
            fontSize: "clamp(1.45rem, 5.6vw, 1.9rem)",
            maxWidth: "16ch",
          })}
        />
        {body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={bodyCopyStyle(tokens, {
              margin: "0.95rem 0 0",
              fontSize: "0.9rem",
              maxWidth: "30ch",
            })}
          />
        ) : null}
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function TextVisualSplitTreatment({
  tokens,
  values,
  handle,
  imageUrl,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const kicker = breakdownRegionCopy(values, "kicker");
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "grid",
        gridTemplateColumns: "1fr 0.92fr",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "1.8rem 1.2rem 1.8rem 1.5rem",
        }}
      >
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        {!sequence && kicker ? (
          <CarouselEditableText
            as="p"
            slotId="kicker"
            value={kicker}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              margin: 0,
              marginBottom: "0.7rem",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
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
            margin: sequence ? "0.7rem 0 0" : 0,
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.2rem, 4.8vw, 1.55rem)",
            fontWeight: 700,
            lineHeight: 1.18,
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
              margin: "0.75rem 0 0",
              fontSize: "0.78rem",
              lineHeight: 1.45,
              color: tokens.colors.muted,
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          margin: "1.1rem 1.1rem 1.1rem 0",
          borderRadius: "1.1rem",
          overflow: "hidden",
          border: `1px solid ${tokens.colors.accent}55`,
          backgroundColor: tokens.colors.muted,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function ComparisonSplitTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const left = breakdownRegionCopy(values, "left") || "This";
  const right = breakdownRegionCopy(values, "right") || "That";
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2.05rem 1.45rem 1.95rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodySlideHeadlineStyle(tokens, { margin: "0.65rem 0 0" })}
        />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0.45rem",
          alignItems: "stretch",
          margin: "1.2rem 0",
          flex: 1,
          minHeight: "8.2rem",
        }}
      >
        <div
          style={{
            ...recessedCard(tokens),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.15rem 0.7rem",
          }}
        >
          <CarouselEditableText
            as="p"
            slotId="left"
            value={left}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "1.05rem",
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              letterSpacing: "-0.02em",
            }}
          />
        </div>
        <div
          style={{
            alignSelf: "center",
            width: "2rem",
            height: "2rem",
            borderRadius: "999px",
            backgroundColor: tokens.colors.accent,
            color: tokens.colors.background,
            fontSize: "0.62rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          VS
        </div>
        <div
          style={{
            ...accentCard(tokens, true),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.15rem 0.7rem",
          }}
        >
          <CarouselEditableText
            as="p"
            slotId="right"
            value={right}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "1.05rem",
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              letterSpacing: "-0.02em",
            }}
          />
        </div>
      </div>
      {body ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={body}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodyCopyStyle(tokens, { position: "relative", zIndex: 1 })}
        />
      ) : null}
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function DiagramFocusTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const support = breakdownRegionCopy(values, "support");
  const supportSteps = splitNativeSteps(support);
  const nodes =
    supportSteps.length === 1 && body
      ? [supportSteps[0]!, body]
      : breakdownDiagramNodes(values);
  const showBody = supportSteps.length >= 2 && Boolean(body);
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2.05rem 1.45rem 1.95rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodySlideHeadlineStyle(tokens, { margin: "0.65rem 0 0" })}
        />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          margin: "1.15rem 0 0",
          flex: 1,
          justifyContent: "center",
        }}
      >
        {nodes.map((node, index) => (
          <div
            key={`${node}-${index}`}
            style={{ display: "flex", gap: "0.75rem", alignItems: "stretch" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "1.55rem",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "1.55rem",
                  height: "1.55rem",
                  borderRadius: "999px",
                  backgroundColor: tokens.colors.accent,
                  color: tokens.colors.background,
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              {index < nodes.length - 1 ? (
                <div
                  style={{
                    width: "2px",
                    flex: 1,
                    minHeight: "0.85rem",
                    backgroundColor: wash(tokens.colors.accent, 0.7),
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                ...(index === 0 ? accentCard(tokens) : recessedCard(tokens)),
                flex: 1,
                padding: "0.85rem 0.9rem",
                marginBottom: index < nodes.length - 1 ? "0.7rem" : 0,
                fontSize: "0.86rem",
                lineHeight: 1.42,
                fontWeight: 600,
              }}
            >
              {node}
            </div>
          </div>
        ))}
      </div>
      {showBody ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={body}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodyCopyStyle(tokens, {
            position: "relative",
            zIndex: 1,
            marginTop: "1rem",
          })}
        />
      ) : null}
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function ChecklistStackTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const support = breakdownRegionCopy(values, "support");
  const rows = breakdownChecklistLines(values);
  const showBody = Boolean(support) && Boolean(body);
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2.05rem 1.45rem 1.95rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodySlideHeadlineStyle(tokens, { margin: "0.65rem 0 0" })}
        />
        {showBody ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={bodyCopyStyle(tokens, { margin: "0.7rem 0 0" })}
          />
        ) : null}
      </div>
      <div
        style={{
          ...recessedCard(tokens),
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: "1.15rem",
          overflow: "hidden",
        }}
      >
        {rows.map((row, index) => (
          <div
            key={`${row}-${index}`}
            data-breakdown-check-row={index + 1}
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "flex-start",
              padding: "0.92rem 0.95rem",
              borderTop:
                index === 0 ? "none" : `1px solid ${wash(tokens.colors.foreground, 0.08)}`,
            }}
          >
            <div
              style={{
                width: "1.2rem",
                height: "1.2rem",
                borderRadius: "0.32rem",
                backgroundColor: tokens.colors.accent,
                color: tokens.colors.background,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "0.05rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ✓
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                lineHeight: 1.38,
                fontWeight: 600,
                color: tokens.colors.foreground,
              }}
            >
              {row}
            </p>
          </div>
        ))}
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function DataFocusTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const metric = breakdownDataPoint(values);
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2.05rem 1.45rem 1.95rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodySlideHeadlineStyle(tokens, { margin: "0.65rem 0 0" })}
        />
      </div>
      <div
        style={{
          ...accentCard(tokens, true),
          position: "relative",
          zIndex: 1,
          marginTop: "1.15rem",
          padding: "1.05rem 1rem 1.1rem",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            width: "2.1rem",
            height: "0.22rem",
            marginBottom: "0.75rem",
            backgroundColor: tokens.colors.accent,
            borderRadius: "999px",
          }}
        />
        {metric ? (
          <CarouselEditableText
            as="p"
            slotId="support"
            value={metric}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(1.12rem, 4.6vw, 1.38rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.22,
              color: tokens.colors.accent,
            }}
          />
        ) : null}
        {body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={bodyCopyStyle(tokens, {
              margin: metric ? "0.85rem 0 0" : 0,
              color: tokens.colors.foreground,
            })}
          />
        ) : null}
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function TimelineFlowTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const steps = splitNativeSteps(breakdownRegionCopy(values, "support"));
  const points = steps.length >= 2 ? steps : [body].filter(Boolean);
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "2.1rem 1.6rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SequenceMark sequence={sequence} tokens={tokens} size="small" />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            margin: "0.65rem 0 1.2rem",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.38rem, 5.3vw, 1.7rem)",
            fontWeight: 700,
            lineHeight: 1.16,
            letterSpacing: "-0.03em",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.95rem" }}>
          {points.map((step, index) => (
            <div
              key={`${step}-${index}`}
              style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "0.9rem",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "0.72rem",
                    height: "0.72rem",
                    borderRadius: "999px",
                    backgroundColor: tokens.colors.accent,
                    marginTop: "0.2rem",
                  }}
                />
                {index < points.length - 1 ? (
                  <div
                    style={{
                      width: "2px",
                      flex: 1,
                      minHeight: "1.15rem",
                      backgroundColor: `${tokens.colors.accent}99`,
                      marginTop: "0.2rem",
                    }}
                  />
                ) : null}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.92rem",
                  lineHeight: 1.4,
                  color: tokens.colors.foreground,
                }}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

function ClosingFocusTreatment({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
}: TreatmentProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const cta = breakdownRegionCopy(values, "cta");
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2.15rem 1.45rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "19rem",
          ...recessedCard(tokens),
          padding: "1.7rem 1.2rem 1.55rem",
        }}
      >
        <div
          aria-hidden
          style={{
            width: "2.2rem",
            height: "0.22rem",
            margin: "0 auto 1.15rem",
            backgroundColor: tokens.colors.accent,
            borderRadius: "999px",
          }}
        />
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
            fontSize: "clamp(1.75rem, 6.8vw, 2.2rem)",
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: "-0.03em",
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
            style={bodyCopyStyle(tokens, { margin: "0.95rem 0 0" })}
          />
        ) : null}
        {cta ? (
          <CarouselEditableText
            as="span"
            slotId="cta_label"
            value={cta}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              display: "inline-block",
              marginTop: "1.35rem",
              padding: "0.78rem 1.45rem",
              borderRadius: "999px",
              fontSize: "0.86rem",
              fontWeight: 700,
              backgroundColor: tokens.colors.accent,
              color: tokens.colors.background,
            }}
          />
        ) : null}
      </div>
      <HandleMark handle={handle} tokens={tokens} />
    </div>
  );
}

const TREATMENT_RENDERERS: Record<
  BreakdownListicleTreatment,
  (props: TreatmentProps) => ReactElement
> = {
  strong_cover: StrongCoverTreatment,
  text_focus: TextFocusTreatment,
  text_visual_split: TextVisualSplitTreatment,
  number_focus: NumberFocusTreatment,
  comparison_split: ComparisonSplitTreatment,
  diagram_focus: DiagramFocusTreatment,
  timeline_flow: TimelineFlowTreatment,
  checklist_stack: ChecklistStackTreatment,
  data_focus: DataFocusTreatment,
  closing_focus: ClosingFocusTreatment,
};

/**
 * One family. Visual Director chooses the archetype. This picks geometry.
 */
export function CarouselBreakdownListicleFamily(
  props: CarouselBreakdownListicleFamilyProps
) {
  const treatment = resolveBreakdownListicleRenderTreatment({
    archetype: props.composition?.archetype ?? props.composition?.treatment ?? "",
    semanticRole: props.composition?.semanticRole ?? "",
    imageUrl: props.imageUrl,
    listItemIndex: props.composition?.listItemIndex ?? null,
  });
  const sequence = breakdownSequenceLabel(
    props.composition?.listItemIndex ?? null
  );
  const Renderer = TREATMENT_RENDERERS[treatment] ?? TextFocusTreatment;

  return (
    <div
      className={props.className}
      data-breakdown-family="breakdown_listicle"
      data-breakdown-archetype={props.composition?.archetype ?? ""}
      data-breakdown-treatment={treatment}
      data-breakdown-role={props.composition?.semanticRole ?? ""}
      data-breakdown-sequence={sequence ?? ""}
    >
      <Renderer {...props} treatment={treatment} sequence={sequence} />
    </div>
  );
}
