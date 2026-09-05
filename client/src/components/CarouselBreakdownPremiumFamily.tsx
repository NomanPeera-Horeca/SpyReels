import type { CSSProperties, ReactElement } from "react";
import type { CarouselDesignTokens } from "@shared/carouselTemplates";
import {
  breakdownChecklistLines,
  breakdownDataHero,
  breakdownDataPoint,
  breakdownRegionCopy,
  breakdownSequenceLabel,
  resolveBreakdownListicleRenderTreatment,
  type BreakdownListicleTreatment,
} from "@shared/carouselBreakdownFamily";
import {
  PREMIUM_CAROUSEL_DESIGN_FOUNDATION as DESIGN,
  resolveBreakdownPremiumVariant,
  type BreakdownPremiumVariant,
} from "@shared/carouselPremiumDesignSystem";
import {
  CarouselBreakdownListicleFamily as BaselineBreakdownFamily,
  type CarouselBreakdownListicleFamilyProps,
} from "@/components/CarouselBreakdownListicleFamily";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableImage } from "@/components/CarouselEditableImage";
import { CarouselEditableText } from "@/components/CarouselEditableText";

type PremiumProps = CarouselBreakdownListicleFamilyProps & {
  treatment: BreakdownListicleTreatment;
  variant: BreakdownPremiumVariant;
  sequence: string | null;
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
    backgroundColor: tokens.colors.background,
    color: tokens.colors.foreground,
    fontFamily: tokens.fontFamily.body,
  };
}

function surface(tokens: CarouselDesignTokens): CSSProperties {
  return {
    borderRadius: DESIGN.radius.surface,
    background: wash(tokens.colors.foreground, DESIGN.alpha.surface),
    border: `1px solid ${wash(tokens.colors.foreground, DESIGN.alpha.hairline)}`,
  };
}

function accentSurface(tokens: CarouselDesignTokens): CSSProperties {
  return {
    borderRadius: DESIGN.radius.surface,
    background: wash(tokens.colors.accent, DESIGN.alpha.accentSoft),
    border: `1px solid ${wash(tokens.colors.accent, 0.48)}`,
  };
}

function headlineStyle(tokens: CarouselDesignTokens): CSSProperties {
  return {
    margin: 0,
    fontFamily: tokens.fontFamily.display,
    fontSize: "clamp(1.55rem, 6vw, 2rem)",
    fontWeight: 750,
    lineHeight: 1.08,
    letterSpacing: "-0.038em",
    overflowWrap: "break-word",
  };
}

function bodyStyle(tokens: CarouselDesignTokens): CSSProperties {
  return {
    margin: 0,
    fontSize: DESIGN.typography.body,
    lineHeight: 1.5,
    color: tokens.colors.muted,
  };
}

function Handle({ handle, tokens }: { handle?: string; tokens: CarouselDesignTokens }) {
  if (!handle) return null;
  return (
    <span
      style={{
        position: "absolute",
        zIndex: 5,
        left: DESIGN.spacing.edge,
        bottom: "0.9rem",
        fontSize: "0.62rem",
        fontWeight: 600,
        letterSpacing: "0.035em",
        color: tokens.colors.muted,
        opacity: 0.86,
      }}
    >
      {handle}
    </span>
  );
}

function Sequence({
  sequence,
  tokens,
  hero = false,
}: {
  sequence: string | null;
  tokens: CarouselDesignTokens;
  hero?: boolean;
}) {
  if (!sequence) return null;
  return (
    <span
      aria-label={`Item ${sequence}`}
      style={{
        display: "inline-block",
        fontFamily: tokens.fontFamily.display,
        fontSize: hero ? "clamp(4.2rem, 17vw, 5.4rem)" : "0.72rem",
        fontWeight: 760,
        lineHeight: hero ? 0.84 : 1,
        letterSpacing: hero ? "-0.065em" : "0.12em",
        color: tokens.colors.accent,
      }}
    >
      {sequence}
    </span>
  );
}

function Eyebrow({
  value,
  tokens,
  editable,
  onSlotChange,
}: {
  value: string;
  tokens: CarouselDesignTokens;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
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
        lineHeight: 1.2,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: tokens.colors.accent,
      }}
    />
  );
}

function EditorialCover({
  tokens,
  values,
  handle,
  imageUrl,
  editable,
  onSlotChange,
  variant,
}: PremiumProps) {
  const kicker = breakdownRegionCopy(values, "kicker");
  const headline = breakdownRegionCopy(values, "headline");
  const body =
    breakdownRegionCopy(values, "body") || breakdownRegionCopy(values, "support");
  const withImage = variant === "cover_editorial_image" && Boolean(imageUrl?.trim());

  return (
    <div
      style={{
        ...shell(tokens),
        display: "grid",
        gridTemplateColumns: withImage ? "1.08fr 0.92fr" : "1fr",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: "8rem",
          height: "8rem",
          borderRadius: "999px",
          top: "-3.5rem",
          right: withImage ? "7.2rem" : "-2.5rem",
          background: wash(tokens.colors.accent, 0.12),
          border: `1px solid ${wash(tokens.colors.accent, 0.28)}`,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 0,
          padding: withImage
            ? "1.8rem 1rem 2rem 1.55rem"
            : "2.35rem 1.7rem 2.45rem",
        }}
      >
        <Eyebrow
          value={kicker}
          tokens={tokens}
          editable={editable}
          onSlotChange={onSlotChange}
        />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            margin: kicker ? "0.9rem 0 0" : 0,
            fontFamily: tokens.fontFamily.display,
            fontSize: withImage
              ? "clamp(1.72rem, 6.6vw, 2.15rem)"
              : "clamp(2.05rem, 7.8vw, 2.4rem)",
            fontWeight: 780,
            lineHeight: 0.99,
            letterSpacing: "-0.052em",
            maxWidth: withImage ? "13ch" : "100%",
            overflowWrap: "break-word",
          }}
        />
        <div
          aria-hidden
          style={{
            width: "3.35rem",
            height: "0.18rem",
            margin: "1.05rem 0 0.9rem",
            borderRadius: DESIGN.radius.pill,
            background: tokens.colors.accent,
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
              ...bodyStyle(tokens),
              maxWidth: withImage ? "26ch" : "34ch",
              fontSize: withImage ? "0.8rem" : "0.9rem",
            }}
          />
        ) : null}
      </div>
      {withImage ? (
        <CarouselEditableImage
          slotId="photo"
          src={imageUrl!}
          style={{
            position: "relative",
            zIndex: 1,
            margin: "1rem 0.95rem 1rem 0",
            borderRadius: DESIGN.radius.media,
            boxShadow: `0 1rem 2.5rem ${wash(tokens.colors.foreground, 0.14)}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `linear-gradient(180deg, transparent 58%, ${wash(
                tokens.colors.background,
                0.28
              )} 100%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "0.7rem",
              bottom: "0.7rem",
              width: "2rem",
              height: "0.28rem",
              borderRadius: DESIGN.radius.pill,
              background: tokens.colors.accent,
              pointerEvents: "none",
            }}
          />
        </CarouselEditableImage>
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function EditorialText({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "2.15rem 1.8rem 2.25rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <Sequence sequence={sequence} tokens={tokens} />
        <div
          aria-hidden
          style={{
            width: "2.4rem",
            height: "1px",
            margin: sequence ? "0.75rem 0 0.9rem" : "0 0 0.9rem",
            background: wash(tokens.colors.accent, 0.85),
          }}
        />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), maxWidth: "14ch", fontSize: "clamp(1.9rem, 7.4vw, 2.45rem)" }}
        />
        {body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "1.1rem", maxWidth: "31ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumNumber({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
  variant,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const card = variant === "number_feature_card";

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1.8rem 1.65rem 2.1rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      {card ? (
        <div
          style={{
            ...accentSurface(tokens),
            position: "relative",
            zIndex: 2,
            alignSelf: "flex-start",
            minWidth: "4.4rem",
            padding: "0.85rem 1rem 0.75rem",
            marginBottom: "1.15rem",
          }}
        >
          <Sequence sequence={sequence} tokens={tokens} hero />
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            position: "absolute",
            zIndex: 0,
            top: "1.3rem",
            right: "1rem",
            fontFamily: tokens.fontFamily.display,
            fontSize: "7.6rem",
            fontWeight: 800,
            lineHeight: 0.9,
            letterSpacing: "-0.08em",
            color: wash(tokens.colors.accent, DESIGN.alpha.ghost),
          }}
        >
          {sequence}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 2, maxWidth: card ? "100%" : "82%" }}>
        {!card ? <Sequence sequence={sequence} tokens={tokens} hero /> : null}
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            ...headlineStyle(tokens),
            marginTop: card ? 0 : "1.05rem",
            maxWidth: "15ch",
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
            style={{ ...bodyStyle(tokens), marginTop: "0.95rem", maxWidth: "31ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumSplit({
  tokens,
  values,
  handle,
  imageUrl,
  editable,
  onSlotChange,
  sequence,
  variant,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const kicker = breakdownRegionCopy(values, "kicker");
  const imageFirst = variant === "split_image_left";

  if (!imageUrl?.trim()) {
    return (
      <EditorialText
        tokens={tokens}
        values={values}
        handle={handle}
        editable={editable}
        onSlotChange={onSlotChange}
        treatment="text_focus"
        variant="text_editorial"
        sequence={sequence}
      />
    );
  }

  const text = (
    <div
      style={{
        position: "relative",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: imageFirst ? "1.75rem 1.45rem 1.9rem 1rem" : "1.75rem 1rem 1.9rem 1.45rem",
        minWidth: 0,
      }}
    >
      <Sequence sequence={sequence} tokens={tokens} />
      {!sequence && kicker ? (
        <Eyebrow value={kicker} tokens={tokens} editable={editable} onSlotChange={onSlotChange} />
      ) : null}
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={headline}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          marginTop: sequence || kicker ? "0.78rem" : 0,
          fontSize: "clamp(1.2rem, 4.5vw, 1.46rem)",
          overflowWrap: "normal",
          wordBreak: "normal",
          hyphens: "none",
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
          style={{ ...bodyStyle(tokens), marginTop: "0.78rem", fontSize: DESIGN.typography.bodySmall }}
        />
      ) : null}
    </div>
  );

  const media = (
    <CarouselEditableImage
      slotId="photo"
      src={imageUrl!}
      style={{
        position: "relative",
        zIndex: 2,
        margin: imageFirst ? "1rem 0 1rem 1rem" : "1rem 1rem 1rem 0",
        borderRadius: DESIGN.radius.media,
        boxShadow: `0 0.8rem 2rem ${wash(tokens.colors.foreground, 0.13)}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `1px solid ${wash(tokens.colors.accent, 0.34)}`,
          borderRadius: DESIGN.radius.media,
          pointerEvents: "none",
        }}
      />
    </CarouselEditableImage>
  );

  return (
    <div
      style={{
        ...shell(tokens),
        display: "grid",
        gridTemplateColumns: imageFirst ? "0.96fr 1.04fr" : "1.08fr 0.92fr",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      {imageFirst ? media : text}
      {imageFirst ? text : media}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumComparison({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
  variant,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const left = breakdownRegionCopy(values, "left") || "This";
  const right = breakdownRegionCopy(values, "right") || "That";
  const stacked = variant === "comparison_stack";

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.65rem 1.35rem 1.9rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <Sequence sequence={sequence} tokens={tokens} />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), marginTop: "0.62rem", fontSize: "clamp(1.4rem, 5.4vw, 1.75rem)" }}
        />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: stacked ? "1fr" : "1fr 1fr",
          gap: stacked ? "0.5rem" : "0.65rem",
          margin: "1rem 0 0.8rem",
          flex: 1,
          alignItems: "stretch",
        }}
      >
        {[{ id: "left", value: left, accent: false }, { id: "right", value: right, accent: true }].map((item) => (
          <div
            key={item.id}
            style={{
              ...(item.accent ? accentSurface(tokens) : surface(tokens)),
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: stacked ? "flex-start" : "center",
              padding: stacked ? "0.95rem 1rem" : "1.05rem 0.8rem",
              overflow: "hidden",
            }}
          >
            <CarouselEditableText
              as="p"
              slotId={item.id}
              value={item.value}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{
                margin: 0,
                fontFamily: tokens.fontFamily.display,
                fontSize: stacked ? "1.02rem" : "0.92rem",
                fontWeight: 740,
                lineHeight: 1.2,
                letterSpacing: "-0.025em",
                textAlign: stacked ? "left" : "center",
              }}
            />
          </div>
        ))}
      </div>
      {body ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={body}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), position: "relative", zIndex: 2 }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumDiagram({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const support = breakdownRegionCopy(values, "support");
  const steps = [support, body].filter((step) => step.length > 0);

  if (steps.length === 0) {
    return (
      <EditorialText
        tokens={tokens}
        values={values}
        handle={handle}
        editable={editable}
        onSlotChange={onSlotChange}
        treatment="text_focus"
        variant="text_editorial"
        sequence={sequence}
      />
    );
  }

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.7rem 1.4rem 1.9rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <Sequence sequence={sequence} tokens={tokens} />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), marginTop: "0.58rem", fontSize: "clamp(1.4rem, 5.3vw, 1.74rem)" }}
        />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: steps.length === 1 ? "stretch" : "center",
          gap: "0.55rem",
          flex: 1,
          marginTop: "0.95rem",
        }}
      >
        {steps.map((step, index) => (
          <div
            key={`${step}-${index}`}
            style={{
              ...(index === 0 ? accentSurface(tokens) : surface(tokens)),
              padding: steps.length === 1 ? "1.4rem 1.15rem" : "1.05rem 1rem",
              flex: steps.length === 1 ? 1 : undefined,
              display: steps.length === 1 ? "flex" : undefined,
              alignItems: steps.length === 1 ? "center" : undefined,
            }}
          >
            <CarouselEditableText
              as="p"
              slotId={index === 0 && support ? "support" : "body"}
              value={step}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{
                margin: 0,
                fontSize: steps.length === 1 ? "1.02rem" : DESIGN.typography.body,
                lineHeight: 1.4,
                fontWeight: 650,
                color: tokens.colors.foreground,
              }}
            />
          </div>
        ))}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumChecklist({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
  variant,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const support = breakdownRegionCopy(values, "support");
  const rows = breakdownChecklistLines(values);
  const cards = variant === "checklist_cards";

  if (rows.length === 0) {
    return (
      <EditorialText
        tokens={tokens}
        values={values}
        handle={handle}
        editable={editable}
        onSlotChange={onSlotChange}
        treatment="text_focus"
        variant="text_editorial"
        sequence={sequence}
      />
    );
  }

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.65rem 1.4rem 1.85rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <Sequence sequence={sequence} tokens={tokens} />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), marginTop: "0.58rem", fontSize: "clamp(1.4rem, 5.3vw, 1.74rem)" }}
        />
        {support && body ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={body}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "0.62rem", fontSize: DESIGN.typography.bodySmall }}
          />
        ) : null}
      </div>
      <div
        style={{
          ...(cards ? {} : surface(tokens)),
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          gap: cards ? "0.52rem" : 0,
          marginTop: "0.9rem",
          overflow: "hidden",
        }}
      >
        {rows.map((row, index) => (
          <div
            key={`${row}-${index}`}
            style={{
              ...(cards ? (index === 0 ? accentSurface(tokens) : surface(tokens)) : {}),
              display: "grid",
              gridTemplateColumns: "1.45rem 1fr",
              gap: "0.68rem",
              alignItems: "start",
              padding: cards ? "0.72rem 0.8rem" : "0.78rem 0.85rem",
              borderTop: !cards && index > 0 ? `1px solid ${wash(tokens.colors.foreground, 0.08)}` : undefined,
            }}
          >
            <span
              style={{
                width: "1.35rem",
                height: "1.35rem",
                borderRadius: "0.42rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: tokens.colors.accent,
                color: tokens.colors.background,
                fontSize: "0.7rem",
                fontWeight: 800,
              }}
            >
              ✓
            </span>
            <CarouselEditableText
              as="p"
              slotId={support ? "support" : "body"}
              value={row}
              editable={editable}
              selectOnly
              onCommit={onSlotChange}
              style={{
                margin: 0,
                fontSize: "0.86rem",
                lineHeight: 1.36,
                fontWeight: index === 0 && cards ? 700 : 600,
              }}
            />
          </div>
        ))}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumData({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
  sequence,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body = breakdownRegionCopy(values, "body");
  const support = breakdownDataPoint(values);
  const hero = breakdownDataHero(values);
  const extracted = Boolean(hero && support && hero !== support);

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.65rem 1.45rem 1.9rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <Sequence sequence={sequence} tokens={tokens} />
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={headline}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), marginTop: "0.58rem", fontSize: "clamp(1.35rem, 5.1vw, 1.68rem)" }}
        />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          margin: "0.9rem 0 0.75rem",
          padding: "1.1rem 1rem 1.15rem",
          borderTop: `1px solid ${wash(tokens.colors.accent, 0.58)}`,
          borderBottom: `1px solid ${wash(tokens.colors.foreground, 0.12)}`,
        }}
      >
        {hero ? (
          extracted ? (
            <CarouselEditableText
              as="p"
              slotId="support"
              value={hero}
              editable={editable}
              selectOnly
              onCommit={onSlotChange}
              style={{
                margin: 0,
                fontFamily: tokens.fontFamily.display,
                fontSize: "clamp(3rem, 12.5vw, 4.1rem)",
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: "-0.07em",
                color: tokens.colors.accent,
                overflowWrap: "break-word",
              }}
            />
          ) : (
            <CarouselEditableText
              as="p"
              slotId="support"
              value={hero}
              editable={editable}
              onCommit={onSlotChange}
              multiline
              style={{
                margin: 0,
                fontFamily: tokens.fontFamily.display,
                fontSize: "clamp(1.7rem, 6.8vw, 2.3rem)",
                fontWeight: 780,
                lineHeight: 1,
                letterSpacing: "-0.045em",
                color: tokens.colors.accent,
              }}
            />
          )
        ) : null}
        {extracted && support ? (
          <CarouselEditableText
            as="p"
            slotId="support"
            value={support}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "0.75rem", color: tokens.colors.foreground, fontWeight: 650 }}
          />
        ) : null}
      </div>
      {body ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={body}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), position: "relative", zIndex: 2 }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function PremiumClosing({
  tokens,
  values,
  handle,
  editable,
  onSlotChange,
}: PremiumProps) {
  const headline = breakdownRegionCopy(values, "headline");
  const body =
    breakdownRegionCopy(values, "body") || breakdownRegionCopy(values, "support");
  const cta = breakdownRegionCopy(values, "cta");
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.55rem 2.15rem",
        textAlign: "center",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          zIndex: 0,
          width: "11rem",
          height: "11rem",
          borderRadius: "999px",
          background: wash(tokens.colors.accent, 0.08),
          border: `1px solid ${wash(tokens.colors.accent, 0.18)}`,
        }}
      />
      <div style={{ position: "relative", zIndex: 2, width: "100%" }}>
        <div
          aria-hidden
          style={{
            width: "2.8rem",
            height: "0.18rem",
            margin: "0 auto 1.15rem",
            borderRadius: DESIGN.radius.pill,
            background: tokens.colors.accent,
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
            ...headlineStyle(tokens),
            margin: "0 auto",
            maxWidth: "15ch",
            fontSize: headline.length > 44 ? "clamp(1.48rem, 5.7vw, 1.9rem)" : "clamp(1.8rem, 7vw, 2.35rem)",
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
            style={{ ...bodyStyle(tokens), margin: "0.9rem auto 0", maxWidth: "31ch" }}
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
              padding: "0.72rem 1.15rem",
              borderRadius: DESIGN.radius.pill,
              background: tokens.colors.accent,
              color: tokens.colors.background,
              fontSize: "0.8rem",
              fontWeight: 760,
              lineHeight: 1.2,
              maxWidth: "100%",
              overflowWrap: "break-word",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function premiumRenderer(treatment: BreakdownListicleTreatment): ((props: PremiumProps) => ReactElement) | null {
  switch (treatment) {
    case "strong_cover":
      return EditorialCover;
    case "text_focus":
      return EditorialText;
    case "number_focus":
      return PremiumNumber;
    case "text_visual_split":
      return PremiumSplit;
    case "comparison_split":
      return PremiumComparison;
    case "checklist_stack":
      return PremiumChecklist;
    case "data_focus":
      return PremiumData;
    case "closing_focus":
      return PremiumClosing;
    case "diagram_focus":
      return PremiumDiagram;
    case "timeline_flow":
      return null;
  }
}

/**
 * Premium v1 of the proven Breakdown/Listicle family.
 *
 * Semantic decisions remain upstream. This component only turns the existing
 * treatment + Planning IR sequence into a richer, deterministic visual system.
 * Diagram/timeline deliberately retain the already-proven baseline renderer in
 * v1 while the high-frequency surfaces get the first premium treatment pass.
 */
export function CarouselBreakdownPremiumFamily(
  props: CarouselBreakdownListicleFamilyProps
) {
  const treatment = resolveBreakdownListicleRenderTreatment({
    archetype: props.composition?.archetype ?? props.composition?.treatment ?? "",
    semanticRole: props.composition?.semanticRole ?? "",
    imageUrl: props.imageUrl,
    listItemIndex: props.composition?.listItemIndex ?? null,
  });
  const sequence = breakdownSequenceLabel(props.composition?.listItemIndex ?? null);
  const variant = resolveBreakdownPremiumVariant({
    treatment,
    semanticRole: props.composition?.semanticRole,
    listItemIndex: props.composition?.listItemIndex ?? null,
    imageUrl: props.imageUrl,
  });
  const Renderer = premiumRenderer(treatment);

  return (
    <div
      className={props.className}
      data-breakdown-family="breakdown_listicle"
      data-breakdown-premium="v1"
      data-breakdown-archetype={props.composition?.archetype ?? ""}
      data-breakdown-treatment={treatment}
      data-breakdown-variant={variant}
      data-breakdown-role={props.composition?.semanticRole ?? ""}
      data-breakdown-sequence={sequence ?? ""}
    >
      {Renderer ? (
        <Renderer {...props} className={undefined} treatment={treatment} variant={variant} sequence={sequence} />
      ) : (
        <BaselineBreakdownFamily {...props} className={undefined} />
      )}
    </div>
  );
}
