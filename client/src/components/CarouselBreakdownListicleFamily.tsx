import type { CSSProperties, ReactElement } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  breakdownChecklistLines,
  breakdownDataPoint,
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
        fontSize: size === "hero" ? "clamp(3.4rem, 15vw, 4.75rem)" : "1.15rem",
        fontWeight: 700,
        lineHeight: 0.9,
        letterSpacing: "-0.03em",
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
        justifyContent: "flex-end",
        padding: "2.6rem 1.85rem 2.4rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1 }}>
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
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.2em",
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
            fontSize: "clamp(2rem, 8vw, 2.7rem)",
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: "-0.03em",
            maxWidth: "12ch",
          }}
        />
        <div
          style={{
            width: "3.2rem",
            height: "0.18rem",
            margin: "1.2rem 0",
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
            style={{
              margin: 0,
              fontSize: "0.95rem",
              lineHeight: 1.5,
              color: tokens.colors.muted,
              maxWidth: "28ch",
            }}
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
        padding: "2.5rem 1.85rem",
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
            margin: sequence ? "0.85rem 0 0" : 0,
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.7rem, 6.5vw, 2.15rem)",
            fontWeight: 700,
            lineHeight: 1.18,
            maxWidth: "14ch",
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
              margin: "1rem 0 0",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              color: tokens.colors.muted,
              maxWidth: "30ch",
            }}
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
          style={{
            margin: "1.15rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.45rem, 5.6vw, 1.9rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: "16ch",
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
              margin: "0.95rem 0 0",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              color: tokens.colors.muted,
              maxWidth: "30ch",
            }}
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
        padding: "2.1rem 1.5rem 2rem",
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
            margin: "0.7rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.35rem, 5.2vw, 1.7rem)",
            fontWeight: 700,
            lineHeight: 1.18,
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0.6rem",
          alignItems: "stretch",
          margin: "1.4rem 0",
        }}
      >
        <div
          style={{
            border: `1px solid ${tokens.colors.muted}66`,
            borderRadius: "1rem",
            padding: "1rem 0.8rem",
            background: "rgba(255,255,255,0.03)",
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
              fontSize: "1.15rem",
              fontWeight: 700,
              textAlign: "center",
            }}
          />
        </div>
        <div
          style={{
            alignSelf: "center",
            padding: "0.35rem 0.55rem",
            borderRadius: "999px",
            backgroundColor: tokens.colors.accent,
            color: tokens.colors.background,
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          VS
        </div>
        <div
          style={{
            border: `1px solid ${tokens.colors.accent}`,
            borderRadius: "1rem",
            padding: "1rem 0.8rem",
            background: `${tokens.colors.accent}14`,
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
              fontSize: "1.15rem",
              fontWeight: 700,
              textAlign: "center",
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
          style={{
            position: "relative",
            zIndex: 1,
            margin: 0,
            fontSize: "0.88rem",
            lineHeight: 1.45,
            color: tokens.colors.muted,
          }}
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
  const nodes = splitNativeSteps(breakdownRegionCopy(values, "support"));
  const boxes = nodes.length >= 2 ? nodes : [headline, body].filter(Boolean);
  return (
    <div
      style={{
        ...shellStyle(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "2.1rem 1.55rem",
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
            margin: "0.7rem 0 1.2rem",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.3rem, 5vw, 1.65rem)",
            fontWeight: 700,
            lineHeight: 1.18,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {boxes.map((node, index) => (
            <div key={`${node}-${index}`}>
              <div
                style={{
                  border: `1px solid ${tokens.colors.accent}88`,
                  borderRadius: "0.85rem",
                  padding: "0.75rem 0.9rem",
                  background: "rgba(255,255,255,0.03)",
                  fontFamily: tokens.fontFamily.display,
                  fontSize: "0.92rem",
                  fontWeight: 700,
                }}
              >
                {node}
              </div>
              {index < boxes.length - 1 ? (
                <div
                  style={{
                    width: "2px",
                    height: "0.85rem",
                    margin: "0 auto",
                    backgroundColor: tokens.colors.accent,
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
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
        justifyContent: "center",
        padding: "2.1rem 1.55rem",
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
            margin: "0.7rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.3rem, 5vw, 1.65rem)",
            fontWeight: 700,
            lineHeight: 1.18,
          }}
        />
        {showBody ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.88rem",
              lineHeight: 1.45,
              color: tokens.colors.muted,
            }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.7rem",
            marginTop: "1.15rem",
          }}
        >
          {rows.map((row, index) => (
            <div
              key={`${row}-${index}`}
              data-breakdown-check-row={index + 1}
              style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start" }}
            >
              <div
                style={{
                  width: "1.05rem",
                  height: "1.05rem",
                  borderRadius: "0.28rem",
                  border: `1.5px solid ${tokens.colors.accent}`,
                  background: `${tokens.colors.accent}22`,
                  color: tokens.colors.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "0.12rem",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ✓
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.92rem",
                  lineHeight: 1.4,
                  color: tokens.colors.foreground,
                }}
              >
                {row}
              </p>
            </div>
          ))}
        </div>
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
        justifyContent: "center",
        padding: "2.2rem 1.6rem",
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
            margin: "0.7rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.3rem, 5vw, 1.65rem)",
            fontWeight: 700,
            lineHeight: 1.18,
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
              margin: "1.15rem 0 0",
              fontFamily: tokens.fontFamily.display,
              fontSize: "clamp(1.85rem, 7.2vw, 2.45rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              color: tokens.colors.accent,
            }}
          />
        ) : null}
        {body ? (
          <div
            style={{
              marginTop: metric ? "1.05rem" : "1.15rem",
              border: `1px solid ${tokens.colors.accent}66`,
              borderRadius: "1rem",
              padding: "0.95rem 1rem",
              background: `${tokens.colors.accent}12`,
            }}
          >
            <CarouselEditableText
              as="p"
              slotId="body"
              value={body}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{
                margin: 0,
                fontSize: "0.92rem",
                lineHeight: 1.45,
                color: tokens.colors.foreground,
              }}
            />
          </div>
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
            margin: "0.7rem 0 1.25rem",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.3rem, 5vw, 1.65rem)",
            fontWeight: 700,
            lineHeight: 1.18,
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
        padding: "2.5rem 1.75rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: "18rem" }}>
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
            fontSize: "clamp(1.7rem, 6.8vw, 2.2rem)",
            fontWeight: 700,
            lineHeight: 1.15,
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
              margin: "1.1rem 0 0",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              color: tokens.colors.muted,
            }}
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
              marginTop: "1.6rem",
              padding: "0.7rem 1.3rem",
              borderRadius: "999px",
              fontSize: "0.85rem",
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
