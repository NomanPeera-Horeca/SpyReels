import type { CSSProperties } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  resolveComparisonRenderTreatment,
  resolveComparisonSideLabels,
  resolveComparisonTradeoffDensity,
  type ComparisonComposition,
  type ComparisonTreatment,
} from "@shared/carouselComparisonFamily";
import {
  COMPARISON_PREMIUM_DESIGN_FOUNDATION as DESIGN,
  resolveComparisonPremiumVariant,
  type ComparisonPremiumVariant,
} from "@shared/carouselComparisonPremiumDesignSystem";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselComparisonPremiumFamilyProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  imageUrl?: string;
  imageUrlsBySlot?: Record<string, string>;
  className?: string;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
  composition?: unknown;
};

type ComparisonProps = CarouselComparisonPremiumFamilyProps & {
  composition: ComparisonComposition;
  treatment: ComparisonTreatment;
  variant: ComparisonPremiumVariant;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

function wash(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

function shell(tokens: CarouselDesignTokens): CSSProperties {
  return {
    position: "relative",
    width: "100%",
    maxWidth: "22.5rem",
    aspectRatio: ASPECT_RATIO_CSS[tokens.aspectRatio],
    boxSizing: "border-box",
    overflow: "hidden",
    borderRadius: tokens.radiusPx ?? 0,
    background: tokens.colors.background,
    color: tokens.colors.foreground,
    fontFamily: tokens.fontFamily.body,
  };
}

function headlineStyle(tokens: CarouselDesignTokens): CSSProperties {
  return {
    margin: 0,
    fontFamily: tokens.fontFamily.display,
    fontSize: "clamp(1.55rem, 6.2vw, 2.05rem)",
    fontWeight: 760,
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
    overflowWrap: "normal",
    wordBreak: "normal",
    hyphens: "none",
  };
}

function bodyStyle(tokens: CarouselDesignTokens): CSSProperties {
  return {
    margin: 0,
    fontSize: DESIGN.typography.comparisonBody,
    lineHeight: 1.48,
    color: tokens.colors.muted,
  };
}

function imageStyle(imageUrl: string): CSSProperties {
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
  };
}

function headline(values: CarouselSlotValues): string {
  return values.headline?.trim() || values.title?.trim() || "";
}

function body(values: CarouselSlotValues): string {
  return (
    values.body?.trim() ||
    values.subhead?.trim() ||
    values.support?.trim() ||
    ""
  );
}

function kicker(values: CarouselSlotValues): string {
  return values.kicker?.trim() || "";
}

function cta(values: CarouselSlotValues): string {
  return values.cta_label?.trim() || values.cta?.trim() || "";
}

function leftCopy(values: CarouselSlotValues): string {
  return values.left?.trim() || "";
}

function rightCopy(values: CarouselSlotValues): string {
  return values.right?.trim() || "";
}

function supportCopy(values: CarouselSlotValues): string {
  return values.support?.trim() || values.subhead?.trim() || "";
}

function secondaryImage(
  imageUrl?: string,
  imageUrlsBySlot?: Record<string, string>
): string {
  const fromSlot =
    imageUrlsBySlot?.photo_b?.trim() ||
    imageUrlsBySlot?.right?.trim() ||
    "";
  if (fromSlot) return fromSlot;
  return imageUrl?.trim() || "";
}

function dimensionLines(text: string): string[] {
  return text
    .split(/\n|•|;/)
    .map((line) => line.replace(/^\s*[-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function Handle({
  handle,
  tokens,
  light = false,
}: {
  handle?: string;
  tokens: CarouselDesignTokens;
  light?: boolean;
}) {
  if (!handle) return null;
  return (
    <span
      style={{
        position: "absolute",
        zIndex: 8,
        left: DESIGN.spacing.edge,
        bottom: "0.85rem",
        fontSize: "0.62rem",
        fontWeight: 620,
        letterSpacing: "0.035em",
        color: light ? "rgba(255,255,255,0.76)" : tokens.colors.muted,
      }}
    >
      {handle}
    </span>
  );
}

function SideLabel({
  value,
  tokens,
  accent = false,
  light = false,
  align = "left",
}: {
  value: string | null;
  tokens: CarouselDesignTokens;
  accent?: boolean;
  light?: boolean;
  align?: "left" | "right";
}) {
  if (!value) return null;
  return (
    <p
      style={{
        margin: "0 0 0.4rem",
        fontSize: DESIGN.typography.sideLabel,
        letterSpacing: "0.14em",
        fontWeight: 760,
        textTransform: "uppercase",
        textAlign: align,
        color: light
          ? "rgba(255,255,255,0.72)"
          : accent
            ? tokens.colors.accent
            : tokens.colors.muted,
      }}
    >
      {value}
    </p>
  );
}

function Eyebrow({
  value,
  tokens,
  editable,
  onSlotChange,
  light = false,
}: {
  value: string;
  tokens: CarouselDesignTokens;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
  light?: boolean;
}) {
  if (!value) return null;
  return (
    <CarouselEditableText
      as="p"
      slotId="kicker"
      value={value}
      editable={editable}
      onCommit={onSlotChange}
      style={{
        margin: 0,
        fontSize: DESIGN.typography.eyebrow,
        fontWeight: 760,
        letterSpacing: "0.16em",
        lineHeight: 1.2,
        textTransform: "uppercase",
        color: light ? "rgba(255,255,255,0.82)" : tokens.colors.accent,
      }}
    />
  );
}

function ContrastCover({
  tokens,
  values,
  imageUrl,
  imageUrlsBySlot,
  editable,
  onSlotChange,
  handle,
  variant,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const photoB = secondaryImage(undefined, imageUrlsBySlot);
  const withImage = Boolean(imageUrl?.trim()) && variant !== "cover_type";

  if (withImage && variant === "cover_split") {
    return (
      <div style={shell(tokens)}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <div aria-hidden style={imageStyle(imageUrl!)} />
          <div
            aria-hidden
            style={{
              ...(photoB ? imageStyle(photoB) : { background: tokens.colors.foreground }),
              filter: photoB ? "saturate(0.82)" : undefined,
            }}
          />
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,10,16,0.18) 12%, rgba(8,10,16,0.42) 46%, rgba(8,10,16,0.92) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: 0,
            right: 0,
            bottom: 0,
            padding: "1.8rem 1.45rem 2.15rem",
          }}
        >
          <Eyebrow
            value={k}
            tokens={tokens}
            editable={editable}
            onSlotChange={onSlotChange}
            light
          />
          <CarouselEditableText
            as="h2"
            slotId="headline"
            value={h}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...headlineStyle(tokens),
              marginTop: "0.7rem",
              maxWidth: "14ch",
              fontSize: "clamp(1.85rem, 7.4vw, 2.45rem)",
              color: "#fff",
            }}
          />
          {left || right ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.85rem",
                marginTop: "1rem",
                color: "rgba(255,255,255,0.82)",
                fontSize: "0.72rem",
                fontWeight: 650,
                letterSpacing: "0.02em",
              }}
            >
              <CarouselEditableText
                as="p"
                slotId="left"
                value={left}
                editable={editable}
                onCommit={onSlotChange}
                multiline
                style={{ margin: 0 }}
              />
              <CarouselEditableText
                as="p"
                slotId="right"
                value={right}
                editable={editable}
                onCommit={onSlotChange}
                multiline
                style={{ margin: 0, textAlign: "right" }}
              />
            </div>
          ) : b ? (
            <CarouselEditableText
              as="p"
              slotId="body"
              value={b}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{
                margin: "0.85rem 0 0",
                maxWidth: "30ch",
                fontSize: "0.82rem",
                color: "rgba(255,255,255,0.76)",
              }}
            />
          ) : null}
        </div>
        <Handle handle={handle} tokens={tokens} light />
      </div>
    );
  }

  if (withImage) {
    return (
      <div style={{ ...shell(tokens), ...imageStyle(imageUrl!) }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,10,16,0.08) 20%, rgba(8,10,16,0.88) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: 0,
            right: 0,
            bottom: 0,
            padding: "1.9rem 1.5rem 2.2rem",
          }}
        >
          <Eyebrow
            value={k}
            tokens={tokens}
            editable={editable}
            onSlotChange={onSlotChange}
            light
          />
          <CarouselEditableText
            as="h2"
            slotId="headline"
            value={h}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...headlineStyle(tokens),
              marginTop: k ? "0.7rem" : 0,
              maxWidth: "13ch",
              fontSize: "clamp(2rem, 8vw, 2.6rem)",
              color: "#fff",
            }}
          />
        </div>
        <Handle handle={handle} tokens={tokens} light />
      </div>
    );
  }

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "2rem 1.55rem 2.25rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "1.35rem",
          left: "1.35rem",
          right: "1.35rem",
          height: "1px",
          background: wash(tokens.colors.foreground, 0.16),
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>
        <Eyebrow
          value={k}
          tokens={tokens}
          editable={editable}
          onSlotChange={onSlotChange}
        />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            ...headlineStyle(tokens),
            marginTop: "0.8rem",
            maxWidth: "12ch",
            fontSize: "clamp(2.1rem, 8.6vw, 2.85rem)",
          }}
        />
        {(left || right) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gap: "0.7rem",
              alignItems: "center",
              marginTop: "1.15rem",
            }}
          >
            <CarouselEditableText
              as="p"
              slotId="left"
              value={left}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{ ...bodyStyle(tokens), color: tokens.colors.foreground }}
            />
            <span
              style={{
                fontSize: DESIGN.typography.sideLabel,
                letterSpacing: "0.16em",
                fontWeight: 760,
                color: tokens.colors.accent,
              }}
            >
              VS
            </span>
            <CarouselEditableText
              as="p"
              slotId="right"
              value={right}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{
                ...bodyStyle(tokens),
                color: tokens.colors.foreground,
                textAlign: "right",
              }}
            />
          </div>
        )}
        {b && !left && !right ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "1rem", maxWidth: "30ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function SideBySide({
  tokens,
  values,
  imageUrl,
  imageUrlsBySlot,
  editable,
  onSlotChange,
  handle,
  variant,
  composition,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const labels = resolveComparisonSideLabels({
    treatment: "side_by_side",
    sequence: composition.sequence,
  });
  const photoB = secondaryImage(undefined, imageUrlsBySlot);
  const ruled = variant === "columns_rule";

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.45rem 1.25rem 1.85rem",
      }}
    >
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          fontSize: "clamp(1.35rem, 5.4vw, 1.7rem)",
          maxWidth: "18ch",
        }}
      />
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          marginTop: "1rem",
          minHeight: 0,
          borderTop: `1px solid ${wash(tokens.colors.foreground, 0.14)}`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "0.95rem 0.85rem 0.7rem 0",
            borderRight: ruled
              ? `1px solid ${wash(tokens.colors.foreground, 0.16)}`
              : undefined,
          }}
        >
          {imageUrl ? (
            <div
              aria-hidden
              style={{
                ...imageStyle(imageUrl),
                height: "6.4rem",
                marginBottom: "0.75rem",
                borderRadius: ruled ? 0 : DESIGN.radius.compact,
              }}
            />
          ) : null}
          <SideLabel value={labels.left} tokens={tokens} />
          <CarouselEditableText
            as="p"
            slotId="left"
            value={left}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "1.02rem",
              fontWeight: 740,
              lineHeight: 1.18,
              letterSpacing: "-0.03em",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "0.95rem 0 0.7rem 0.85rem",
          }}
        >
          {photoB ? (
            <div
              aria-hidden
              style={{
                ...imageStyle(photoB),
                height: "6.4rem",
                marginBottom: "0.75rem",
                borderRadius: ruled ? 0 : DESIGN.radius.compact,
              }}
            />
          ) : null}
          <SideLabel value={labels.right} tokens={tokens} accent />
          <CarouselEditableText
            as="p"
            slotId="right"
            value={right}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: "1.02rem",
              fontWeight: 740,
              lineHeight: 1.18,
              letterSpacing: "-0.03em",
            }}
          />
        </div>
      </div>
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.75rem" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function AsymmetricComparison({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  variant,
  composition,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const labels = resolveComparisonSideLabels({
    treatment: "asymmetric_comparison",
    sequence: composition.sequence,
  });
  const rightDominant = variant === "right_dominant";
  const dominant = rightDominant ? right || h : left || h;
  const secondary = rightDominant ? left : right;
  const dominantSlot = rightDominant ? "right" : "left";
  const secondarySlot = rightDominant ? "left" : "right";
  const dominantLabel = rightDominant ? labels.right : labels.left;
  const secondaryLabel = rightDominant ? labels.left : labels.right;

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: imageUrl ? "flex-start" : "center",
        padding: "1.55rem 1.35rem 1.9rem",
      }}
    >
      {imageUrl ? (
        <div
          aria-hidden
          style={{
            ...imageStyle(imageUrl),
            height: "7.4rem",
            borderRadius: DESIGN.radius.media,
            marginBottom: "1rem",
          }}
        />
      ) : null}
      <SideLabel value={dominantLabel} tokens={tokens} accent />
      <CarouselEditableText
        as="h2"
        slotId={dominantSlot === "left" && !left ? "headline" : dominantSlot}
        value={dominant}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          marginTop: "0.55rem",
          fontSize: "clamp(1.7rem, 6.8vw, 2.2rem)",
          maxWidth: "14ch",
        }}
      />
      {secondary ? (
        <div
          style={{
            marginTop: "1.15rem",
            paddingTop: "0.9rem",
            borderTop: `1px solid ${wash(tokens.colors.foreground, 0.12)}`,
          }}
        >
          <SideLabel value={secondaryLabel} tokens={tokens} />
          <CarouselEditableText
            as="p"
            slotId={secondarySlot}
            value={secondary}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontSize: "0.92rem",
              lineHeight: 1.35,
              color: tokens.colors.muted,
            }}
          />
        </div>
      ) : null}
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.9rem", maxWidth: "32ch" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function WrongVsRight({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
  composition,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const labels = resolveComparisonSideLabels({
    treatment: "wrong_vs_right",
    sequence: composition.sequence,
  });
  const stacked = variant === "stacked_contrast";

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1.3rem 1.9rem",
      }}
    >
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          fontSize: "clamp(1.4rem, 5.6vw, 1.8rem)",
          maxWidth: "16ch",
        }}
      />
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateRows: stacked ? "0.82fr 1.18fr" : "1fr 1fr",
          gap: stacked ? "0.55rem" : "0.7rem",
          marginTop: "1rem",
        }}
      >
        <div
          style={{
            padding: stacked ? "0.85rem 0.2rem 0.7rem" : "0.95rem 0.15rem",
            borderTop: `1px solid ${wash(tokens.colors.foreground, 0.12)}`,
            opacity: 0.78,
          }}
        >
          <SideLabel value={labels.left} tokens={tokens} />
          <CarouselEditableText
            as="p"
            slotId="left"
            value={left}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: stacked ? "1.05rem" : "1.12rem",
              fontWeight: 680,
              lineHeight: 1.2,
            }}
          />
        </div>
        <div
          style={{
            padding: "1rem 0.15rem 0.7rem",
            background: wash(tokens.colors.foreground, 0.045),
          }}
        >
          <SideLabel value={labels.right} tokens={tokens} accent />
          <CarouselEditableText
            as="p"
            slotId="right"
            value={right}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: stacked ? "1.28rem" : "1.18rem",
              fontWeight: 760,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
            }}
          />
        </div>
      </div>
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.7rem" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function BeforeAfter({
  tokens,
  values,
  imageUrl,
  imageUrlsBySlot,
  editable,
  onSlotChange,
  handle,
  variant,
}: ComparisonProps) {
  const h = headline(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const labels = resolveComparisonSideLabels({ treatment: "before_after" });
  const photoB = secondaryImage(undefined, imageUrlsBySlot);
  const stacked = variant === "before_after_stack";

  return (
    <div style={shell(tokens)}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: stacked ? "1fr" : "1fr 1fr",
          gridTemplateRows: stacked ? "1fr 1fr" : "1fr",
        }}
      >
        <div
          aria-hidden
          style={{
            ...(imageUrl ? imageStyle(imageUrl) : { background: wash(tokens.colors.foreground, 0.08) }),
          }}
        />
        <div
          aria-hidden
          style={{
            ...(photoB ? imageStyle(photoB) : { background: tokens.colors.foreground }),
          }}
        />
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: stacked
            ? "linear-gradient(180deg, rgba(8,10,16,0.18) 0%, rgba(8,10,16,0.08) 42%, rgba(8,10,16,0.9) 100%)"
            : "linear-gradient(180deg, rgba(8,10,16,0.1) 20%, rgba(8,10,16,0.88) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: 0,
          right: 0,
          bottom: 0,
          padding: "1.55rem 1.35rem 2.1rem",
        }}
      >
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            ...headlineStyle(tokens),
            color: "#fff",
            maxWidth: "15ch",
            fontSize: "clamp(1.55rem, 6.4vw, 2rem)",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.8rem",
            marginTop: "0.9rem",
            color: "rgba(255,255,255,0.84)",
            fontSize: "0.74rem",
            fontWeight: 640,
          }}
        >
          <div>
            <SideLabel value={labels.left} tokens={tokens} light />
            {left ? (
              <CarouselEditableText
                as="p"
                slotId="left"
                value={left}
                editable={editable}
                onCommit={onSlotChange}
                multiline
                style={{ margin: 0 }}
              />
            ) : null}
          </div>
          <div>
            <SideLabel
              value={labels.right}
              tokens={tokens}
              light
              accent
              align="right"
            />
            {right ? (
              <CarouselEditableText
                as="p"
                slotId="right"
                value={right}
                editable={editable}
                onCommit={onSlotChange}
                multiline
                style={{ margin: 0, textAlign: "right" }}
              />
            ) : null}
          </div>
        </div>
      </div>
      <Handle handle={handle} tokens={tokens} light />
    </div>
  );
}

function TradeoffMatrix({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: ComparisonProps) {
  const h = headline(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const support = supportCopy(values);
  const lines = dimensionLines(support || body(values));
  const density = resolveComparisonTradeoffDensity(
    lines.length > 0 ? lines.length : left && right ? 1 : 0
  );
  const editorial = variant === "matrix_editorial";
  const statementLine = lines[0] || "";

  return (
    <div
      data-comparison-tradeoff-density={density}
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: density === "matrix" ? "flex-start" : "center",
        padding: "1.5rem 1.3rem 1.9rem",
      }}
    >
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          fontSize:
            density === "statement"
              ? "clamp(1.55rem, 6.2vw, 2rem)"
              : "clamp(1.4rem, 5.6vw, 1.82rem)",
          maxWidth: density === "statement" ? "14ch" : "16ch",
        }}
      />
      {(left || right) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.8rem",
            marginTop: density === "statement" ? "1.15rem" : "0.95rem",
          }}
        >
          <CarouselEditableText
            as="p"
            slotId="left"
            value={left}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily:
                density === "statement" ? tokens.fontFamily.display : undefined,
              fontSize:
                density === "statement"
                  ? "1.05rem"
                  : DESIGN.typography.sideLabel,
              letterSpacing: density === "statement" ? "-0.03em" : "0.12em",
              textTransform: density === "statement" ? "none" : "uppercase",
              fontWeight: 740,
              lineHeight: 1.2,
              color: tokens.colors.muted,
            }}
          />
          <CarouselEditableText
            as="p"
            slotId="right"
            value={right}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily:
                density === "statement" ? tokens.fontFamily.display : undefined,
              fontSize:
                density === "statement"
                  ? "1.05rem"
                  : DESIGN.typography.sideLabel,
              letterSpacing: density === "statement" ? "-0.03em" : "0.12em",
              textTransform: density === "statement" ? "none" : "uppercase",
              fontWeight: 740,
              lineHeight: 1.2,
              color: tokens.colors.accent,
              textAlign: "right",
            }}
          />
        </div>
      )}
      {density === "statement" && statementLine ? (
        <CarouselEditableText
          as="p"
          slotId={support ? "support" : "body"}
          value={statementLine}
          editable={editable}
          selectOnly
          onCommit={onSlotChange}
          style={{
            margin: "1.2rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "clamp(1.55rem, 6vw, 1.95rem)",
            fontWeight: 760,
            letterSpacing: "-0.035em",
            lineHeight: 1.12,
            maxWidth: "16ch",
          }}
        />
      ) : null}
      {density !== "statement"
        ? lines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              style={{
                marginTop: index === 0 ? "0.95rem" : 0,
                padding: editorial ? "0.72rem 0" : "0.62rem 0",
                borderTop: `1px solid ${wash(tokens.colors.foreground, 0.1)}`,
              }}
            >
              <CarouselEditableText
                as="p"
                slotId={support ? "support" : "body"}
                value={line}
                editable={editable}
                selectOnly
                onCommit={onSlotChange}
                style={{
                  margin: 0,
                  fontFamily: tokens.fontFamily.display,
                  fontSize:
                    density === "pair"
                      ? "1.18rem"
                      : editorial
                        ? "1.05rem"
                        : "0.95rem",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.18,
                }}
              />
            </div>
          ))
        : null}
      {support && lines.length === 0 ? (
        <CarouselEditableText
          as="p"
          slotId="support"
          value={support}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            margin: "1.2rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "1.05rem",
            fontWeight: 700,
            lineHeight: 1.18,
          }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function ComparisonScore({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const support = supportCopy(values);
  const editorial = variant === "score_editorial";

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: editorial ? "flex-start" : "flex-end",
        padding: "1.7rem 1.4rem 2rem",
      }}
    >
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          fontSize: editorial
            ? "clamp(1.4rem, 5.6vw, 1.8rem)"
            : "clamp(1.55rem, 6.4vw, 2.05rem)",
          maxWidth: "14ch",
        }}
      />
      {editorial && b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.95rem", maxWidth: "32ch" }}
        />
      ) : null}
      {!editorial && support ? (
        <CarouselEditableText
          as="p"
          slotId="support"
          value={support}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            margin: "0.85rem 0 0",
            fontFamily: tokens.fontFamily.display,
            fontSize: "1.85rem",
            fontWeight: 760,
            letterSpacing: "-0.045em",
            color: tokens.colors.accent,
          }}
        />
      ) : null}
      {(left || right) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginTop: editorial ? "1.05rem" : "1.2rem",
            paddingTop: "0.95rem",
            borderTop: `1px solid ${wash(tokens.colors.foreground, 0.14)}`,
          }}
        >
          <CarouselEditableText
            as="p"
            slotId="left"
            value={left}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.4 }}
          />
          <CarouselEditableText
            as="p"
            slotId="right"
            value={right}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontSize: "0.86rem",
              lineHeight: 1.4,
              fontWeight: 700,
            }}
          />
        </div>
      )}
      {editorial && support ? (
        <CarouselEditableText
          as="p"
          slotId="support"
          value={support}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.85rem" }}
        />
      ) : null}
      {!editorial && b && b !== support ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.9rem" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function MythReality({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: ComparisonProps) {
  const h = headline(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
  const labels = resolveComparisonSideLabels({ treatment: "myth_reality" });
  const realityFirst = variant === "reality_first";
  const myth = left || h;
  const reality = right || body(values);

  return (
    <div style={shell(tokens)}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateRows: realityFirst ? "1.15fr 0.85fr" : "0.82fr 1.18fr",
        }}
      >
        <div
          style={{
            padding: "1.55rem 1.35rem 1rem",
            background: realityFirst
              ? tokens.colors.foreground
              : wash(tokens.colors.foreground, 0.05),
            color: realityFirst ? tokens.colors.background : tokens.colors.muted,
          }}
        >
          <p
            style={{
              margin: "0 0 0.45rem",
              fontSize: DESIGN.typography.sideLabel,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              opacity: 0.72,
            }}
          >
            {realityFirst ? labels.right : labels.left}
          </p>
          <CarouselEditableText
            as="p"
            slotId={realityFirst ? "right" : "left"}
            value={realityFirst ? reality : myth}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: realityFirst ? "1.55rem" : "1.12rem",
              fontWeight: 760,
              lineHeight: 1.12,
              letterSpacing: "-0.035em",
            }}
          />
        </div>
        <div
          style={{
            padding: "1.15rem 1.35rem 1.9rem",
            background: realityFirst
              ? tokens.colors.background
              : tokens.colors.foreground,
            color: realityFirst ? tokens.colors.foreground : tokens.colors.background,
          }}
        >
          <p
            style={{
              margin: "0 0 0.45rem",
              fontSize: DESIGN.typography.sideLabel,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            {realityFirst ? labels.left : labels.right}
          </p>
          <CarouselEditableText
            as="p"
            slotId={realityFirst ? "left" : "right"}
            value={realityFirst ? myth : reality}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: realityFirst ? "1.12rem" : "1.55rem",
              fontWeight: 740,
              lineHeight: 1.15,
            }}
          />
        </div>
      </div>
      <Handle
        handle={handle}
        tokens={tokens}
        light={!realityFirst}
      />
    </div>
  );
}

function WinnerReveal({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  variant,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const right = rightCopy(values);
  const left = leftCopy(values);
  const withImage = Boolean(imageUrl?.trim()) && variant === "winner_dominant";

  return (
    <div
      style={{
        ...shell(tokens),
        ...(withImage ? imageStyle(imageUrl!) : {}),
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "1.8rem 1.45rem 2.1rem",
      }}
    >
      {withImage ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,10,16,0.08) 18%, rgba(8,10,16,0.9) 100%)",
          }}
        />
      ) : (
        <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      )}
      <div style={{ position: "relative", zIndex: 2 }}>
        <p
          style={{
            margin: "0 0 0.55rem",
            fontSize: DESIGN.typography.sideLabel,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: withImage ? "rgba(255,255,255,0.72)" : tokens.colors.accent,
          }}
        >
          The decision
        </p>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={right || h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            ...headlineStyle(tokens),
            maxWidth: "13ch",
            fontSize: "clamp(1.85rem, 7.4vw, 2.4rem)",
            color: withImage ? "#fff" : tokens.colors.foreground,
          }}
        />
        {left ? (
          <CarouselEditableText
            as="p"
            slotId="left"
            value={left}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: "0.85rem 0 0",
              fontSize: "0.78rem",
              lineHeight: 1.4,
              color: withImage ? "rgba(255,255,255,0.62)" : tokens.colors.muted,
              maxWidth: "28ch",
            }}
          />
        ) : null}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              margin: "0.7rem 0 0",
              fontSize: DESIGN.typography.comparisonBody,
              lineHeight: 1.45,
              color: withImage ? "rgba(255,255,255,0.78)" : tokens.colors.muted,
              maxWidth: "30ch",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} light={withImage} />
    </div>
  );
}

function ComparisonClosing({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
}: ComparisonProps) {
  const h = headline(values);
  const b = body(values);
  const action = cta(values);

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "2rem 1.55rem 2.25rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <p
          style={{
            margin: "0 0 0.7rem",
            fontSize: DESIGN.typography.sideLabel,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: tokens.colors.accent,
          }}
        >
          Take this
        </p>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            ...headlineStyle(tokens),
            maxWidth: "13ch",
            fontSize: DESIGN.typography.decision,
          }}
        />
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "0.95rem", maxWidth: "30ch" }}
          />
        ) : null}
        {action ? (
          <CarouselEditableText
            as="span"
            slotId="cta_label"
            value={action}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              display: "inline-block",
              marginTop: "1.15rem",
              fontSize: "0.7rem",
              fontWeight: 680,
              letterSpacing: "0.04em",
              color: tokens.colors.muted,
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function renderForTreatment(props: ComparisonProps) {
  switch (props.treatment) {
    case "contrast_cover":
      return <ContrastCover {...props} />;
    case "side_by_side":
      return <SideBySide {...props} />;
    case "asymmetric_comparison":
      return <AsymmetricComparison {...props} />;
    case "wrong_vs_right":
      return <WrongVsRight {...props} />;
    case "before_after":
      return <BeforeAfter {...props} />;
    case "tradeoff_matrix":
      return <TradeoffMatrix {...props} />;
    case "comparison_score":
      return <ComparisonScore {...props} />;
    case "myth_reality":
      return <MythReality {...props} />;
    case "winner_reveal":
      return <WinnerReveal {...props} />;
    case "comparison_closing":
      return <ComparisonClosing {...props} />;
  }
}

export function CarouselComparisonPremiumFamily(
  props: CarouselComparisonPremiumFamilyProps
) {
  const composition = props.composition as ComparisonComposition | undefined;
  if (!composition || composition.family !== "comparison") {
    return null;
  }

  const treatment = resolveComparisonRenderTreatment({
    treatment: composition.treatment,
    semanticRole: composition.semanticRole,
    imageUrl: props.imageUrl,
  });
  const variant = resolveComparisonPremiumVariant({
    treatment,
    position: composition.position,
    totalSlides: composition.totalSlides,
    sequence: composition.sequence,
    imageUrl: props.imageUrl,
  });

  return (
    <div
      data-comparison-family="comparison"
      data-comparison-premium="v1"
      data-comparison-treatment={treatment}
      data-comparison-variant={variant}
      data-comparison-role={composition.semanticRole}
      data-comparison-archetype={composition.archetype}
      data-comparison-position={String(composition.position)}
      data-comparison-sequence={
        composition.sequence
          ? `${composition.sequence.kind}:${composition.sequence.index}${
              composition.sequence.kind === "problem_solution"
                ? `:${composition.sequence.side}`
                : ""
            }`
          : "none"
      }
      style={{ width: "22.5rem" }}
    >
      {renderForTreatment({
        ...props,
        composition,
        treatment,
        variant,
      })}
    </div>
  );
}
