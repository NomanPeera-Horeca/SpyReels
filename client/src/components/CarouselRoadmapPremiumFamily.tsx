import type { CSSProperties } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  labelRoadmapSteps,
  resolveRoadmapRenderTreatment,
  roadmapTreatmentEyebrow,
  splitRoadmapCopyLines,
  type RoadmapComposition,
  type RoadmapTreatment,
} from "@shared/carouselRoadmapFamily";
import {
  ROADMAP_PREMIUM_DESIGN_FOUNDATION as DESIGN,
  resolveRoadmapPremiumVariant,
  type RoadmapPremiumVariant,
} from "@shared/carouselRoadmapPremiumDesignSystem";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselRoadmapPremiumFamilyProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  imageUrl?: string;
  imageUrlsBySlot?: Record<string, string>;
  className?: string;
  editable?: boolean;
  onSlotChange?: (slotId: string, value: string) => void;
  composition?: unknown;
  previousRoadmapVariant?: RoadmapPremiumVariant | null;
};

type RoadmapProps = CarouselRoadmapPremiumFamilyProps & {
  composition: RoadmapComposition;
  treatment: RoadmapTreatment;
  variant: RoadmapPremiumVariant;
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
    fontSize: "clamp(1.55rem, 6.2vw, 2.08rem)",
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
    fontSize: DESIGN.typography.roadmapBody,
    lineHeight: 1.5,
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

function supportCopy(values: CarouselSlotValues): string {
  return values.support?.trim() || values.subhead?.trim() || "";
}

function groundedStepCount(composition: RoadmapComposition): number {
  return composition.roadmapStepCount >= 2
    ? composition.roadmapStepCount
    : 0;
}

function labelsForGroundedSteps(
  composition: RoadmapComposition,
  text: string,
  exclude?: string
): Array<string | null> {
  const labels = labelRoadmapSteps(
    composition.roadmapStepCount,
    text,
    exclude
  );
  const named = labels.filter((line) => Boolean(line)).length;
  if (named < 2) {
    return labels.map(() => null);
  }
  return labels;
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

function StepNow({
  tokens,
  current,
  count,
}: {
  tokens: CarouselDesignTokens;
  current?: number | null;
  count: number;
}) {
  if (current == null || count < 2) return null;
  return (
    <p
      style={{
        margin: 0,
        fontSize: DESIGN.typography.stepLabel,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: tokens.colors.accent,
        fontWeight: 760,
      }}
    >
      Step {current} of {count}
    </p>
  );
}

function PathStations({
  tokens,
  count,
  current,
  labels,
}: {
  tokens: CarouselDesignTokens;
  count: number;
  current?: number | null;
  labels?: Array<string | null>;
}) {
  if (count < 2) return null;
  const named = labels?.some(Boolean) ?? false;
  return (
    <div style={{ width: "100%" }}>
      <div
        aria-hidden
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: DESIGN.geometry.stationSizeActive,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "1.1rem",
            right: "1.1rem",
            top: "50%",
            height: DESIGN.geometry.pathStroke,
            marginTop: `calc(${DESIGN.geometry.pathStroke} / -2)`,
            borderRadius: DESIGN.radius.pill,
            background: wash(tokens.colors.foreground, 0.18),
          }}
        />
        {current != null && current > 1 ? (
          <span
            style={{
              position: "absolute",
              left: "1.1rem",
              width: `${((current - 1) / Math.max(count - 1, 1)) * 78}%`,
              top: "50%",
              height: DESIGN.geometry.pathStroke,
              marginTop: `calc(${DESIGN.geometry.pathStroke} / -2)`,
              borderRadius: DESIGN.radius.pill,
              background: tokens.colors.accent,
            }}
          />
        ) : null}
        {Array.from({ length: count }, (_, index) => {
          const active = current != null && index + 1 === current;
          const done = current != null && index + 1 < current;
          const size = active
            ? DESIGN.geometry.stationSizeActive
            : DESIGN.geometry.stationSize;
          return (
            <span
              key={`station-${index}`}
              style={{
                position: "relative",
                zIndex: 1,
                width: size,
                height: size,
                borderRadius: "999px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
                fontSize: active ? "1.05rem" : "0.82rem",
                fontWeight: 760,
                letterSpacing: "-0.03em",
                color:
                  active || done
                    ? tokens.colors.background
                    : tokens.colors.muted,
                background: active
                  ? tokens.colors.accent
                  : done
                    ? wash(tokens.colors.accent, 0.72)
                    : tokens.colors.background,
                boxShadow: active
                  ? `0 0 0 6px ${wash(tokens.colors.accent, 0.2)}`
                  : `inset 0 0 0 1.5px ${wash(tokens.colors.foreground, 0.22)}`,
              }}
            >
              {index + 1}
            </span>
          );
        })}
      </div>
      {named ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${count}, 1fr)`,
            gap: "0.35rem",
            marginTop: "0.55rem",
          }}
        >
          {(labels ?? []).map((line, index) => (
            <p
              key={`station-label-${index}`}
              style={{
                margin: 0,
                fontSize: DESIGN.typography.stepLabel,
                lineHeight: 1.3,
                letterSpacing: "0.02em",
                textAlign: "center",
                color:
                  current === index + 1
                    ? tokens.colors.foreground
                    : tokens.colors.muted,
              }}
            >
              {line ?? ""}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NextArrow({ tokens }: { tokens: CarouselDesignTokens }) {
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.45rem",
        color: tokens.colors.accent,
      }}
    >
      <span
        style={{
          width: "2.4rem",
          height: DESIGN.geometry.pathStroke,
          borderRadius: DESIGN.radius.pill,
          background: tokens.colors.accent,
        }}
      />
      <span
        style={{
          width: 0,
          height: 0,
          borderTop: "0.38rem solid transparent",
          borderBottom: "0.38rem solid transparent",
          borderLeft: `0.55rem solid ${tokens.colors.accent}`,
        }}
      />
    </div>
  );
}

function CoverEditorial({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  treatment,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        padding: "1.7rem 1.55rem 1.85rem",
      }}
    >
      <Eyebrow
        value={k || roadmapTreatmentEyebrow(treatment)}
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
          marginTop: "0.85rem",
          maxWidth: "12ch",
          fontSize: "clamp(2rem, 8vw, 2.7rem)",
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
          style={{
            ...bodyStyle(tokens),
            marginTop: "1.15rem",
            maxWidth: "28ch",
          }}
        />
      ) : null}
      <div style={{ marginTop: "1.35rem" }}>
        <NextArrow tokens={tokens} />
      </div>
      <Handle handle={handle} tokens={tokens} />
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
    </div>
  );
}

function CoverPath({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  const count = groundedStepCount(composition);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.55rem 1.45rem 1.75rem",
      }}
    >
      <div>
        <Eyebrow
          value={k || "The path"}
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
            marginTop: "0.75rem",
            maxWidth: "13ch",
          }}
        />
      </div>
      <div>
        {count >= 2 ? (
          <PathStations tokens={tokens} count={count} />
        ) : (
          <NextArrow tokens={tokens} />
        )}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...bodyStyle(tokens),
              marginTop: "1rem",
              maxWidth: "28ch",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function RouteMap({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const count = groundedStepCount(composition);
  const labels = labelsForGroundedSteps(
    composition,
    supportCopy(values) || b,
    h
  );
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1.4rem 1.7rem",
      }}
    >
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{ ...headlineStyle(tokens), maxWidth: "14ch" }}
      />
      {count >= 2 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            margin: "1.1rem 0 0.8rem",
            minHeight: DESIGN.geometry.pathBand,
          }}
        >
          <PathStations
            tokens={tokens}
            count={count}
            labels={labels}
          />
        </div>
      ) : (
        <div style={{ margin: "1.2rem 0 1rem" }}>
          <NextArrow tokens={tokens} />
        </div>
      )}
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), maxWidth: "30ch" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function StepFocus({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const count = groundedStepCount(composition);
  const current = composition.roadmapStepIndex;
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.45rem 1.4rem 1.7rem",
      }}
    >
      <div>
        <StepNow tokens={tokens} current={current} count={count} />
        {current != null && count >= 2 ? (
          <p
            style={{
              margin: current != null ? "0.35rem 0 0" : 0,
              fontFamily: tokens.fontFamily.display,
              fontSize: DESIGN.typography.stepHero,
              fontWeight: 780,
              letterSpacing: "-0.06em",
              lineHeight: 0.9,
              color: tokens.colors.accent,
            }}
          >
            {String(current).padStart(2, "0")}
          </p>
        ) : null}
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
            maxWidth: "13ch",
          }}
        />
      </div>
      <div>
        {count >= 2 ? (
          <div style={{ marginBottom: "1rem" }}>
            <PathStations tokens={tokens} count={count} current={current} />
          </div>
        ) : (
          <div style={{ marginBottom: "1rem" }}>
            <NextArrow tokens={tokens} />
          </div>
        )}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), maxWidth: "30ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function StepPhotoSplit({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  composition,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const count = groundedStepCount(composition);
  const current = composition.roadmapStepIndex;
  const photo = imageUrl?.trim() || "";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: 0,
      }}
    >
      <div
        style={{
          height: "42%",
          ...(photo
            ? imageStyle(photo)
            : { background: wash(tokens.colors.accent, 0.16) }),
          position: "relative",
        }}
      >
        {current != null && count >= 2 ? (
          <span
            style={{
              position: "absolute",
              left: "1.2rem",
              bottom: "1rem",
              minWidth: "2.6rem",
              height: "2.6rem",
              padding: "0 0.7rem",
              borderRadius: DESIGN.radius.pill,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: tokens.colors.background,
              color: tokens.colors.accent,
              fontWeight: 780,
              letterSpacing: "-0.04em",
            }}
          >
            {String(current).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "1.2rem 1.35rem 1.55rem",
        }}
      >
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), maxWidth: "14ch" }}
        />
        {count >= 2 ? (
          <PathStations tokens={tokens} count={count} current={current} />
        ) : null}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), maxWidth: "28ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function ActionChecklist({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const lines = splitRoadmapCopyLines(b, h).slice(0, 4);
  const items = lines.length >= 2 ? lines : b ? [b] : [];
  const count = groundedStepCount(composition);
  const current = composition.roadmapStepIndex;
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1.4rem 1.7rem",
      }}
    >
      <StepNow tokens={tokens} current={current} count={count} />
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{
          ...headlineStyle(tokens),
          marginTop: current != null && count >= 2 ? "0.55rem" : 0,
          maxWidth: "14ch",
        }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "0.7rem",
          marginTop: "1.1rem",
        }}
      >
        {items.map((line, index) => (
          <div
            key={`check-${index}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.7rem",
            }}
          >
            <span
              aria-hidden
              style={{
                width: "1.15rem",
                height: "1.15rem",
                marginTop: "0.12rem",
                borderRadius: "0.28rem",
                border: `2px solid ${tokens.colors.accent}`,
                background: wash(tokens.colors.accent, 0.12),
                flex: "0 0 auto",
              }}
            />
            <CarouselEditableText
              as="p"
              slotId={index === 0 ? "body" : "support"}
              value={line}
              editable={editable && index === 0}
              onCommit={onSlotChange}
              multiline
              style={{
                margin: 0,
                fontSize: "0.9rem",
                lineHeight: 1.4,
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

function ProgressPath({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const count = groundedStepCount(composition);
  const current = composition.roadmapStepIndex;
  return (
    <div
      style={{
        ...shell(tokens),
        display: "grid",
        gridTemplateColumns: "2.4rem 1fr",
        gap: "0.95rem",
        padding: "1.5rem 1.4rem 1.7rem",
      }}
    >
      <div aria-hidden style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: "0.72rem",
            top: "0.3rem",
            bottom: "1.3rem",
            width: DESIGN.geometry.pathStroke,
            background: wash(tokens.colors.foreground, 0.16),
            borderRadius: DESIGN.radius.pill,
          }}
        />
        {count >= 2
          ? Array.from({ length: count }, (_, index) => {
              const active = index + 1 === current;
              const done = current != null && index + 1 < current;
              const top = `${(index / Math.max(count - 1, 1)) * 78}%`;
              return (
                <span
                  key={`rail-${index}`}
                  style={{
                    position: "absolute",
                    left: active ? "0.12rem" : "0.28rem",
                    top,
                    width: active ? "1.45rem" : "1.1rem",
                    height: active ? "1.45rem" : "1.1rem",
                    borderRadius: "999px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: active ? "0.72rem" : "0.62rem",
                    fontWeight: 760,
                    color:
                      active || done
                        ? tokens.colors.background
                        : tokens.colors.muted,
                    background: active
                      ? tokens.colors.accent
                      : done
                        ? wash(tokens.colors.accent, 0.7)
                        : tokens.colors.background,
                    boxShadow: active
                      ? `0 0 0 5px ${wash(tokens.colors.accent, 0.18)}`
                      : `inset 0 0 0 1.5px ${wash(tokens.colors.foreground, 0.22)}`,
                  }}
                >
                  {index + 1}
                </span>
              );
            })
          : (
            <span
              style={{
                position: "absolute",
                left: "0.28rem",
                top: "0.2rem",
                width: "1.15rem",
                height: "1.15rem",
                borderRadius: "999px",
                background: tokens.colors.accent,
              }}
            />
          )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <StepNow tokens={tokens} current={current} count={count} />
          <CarouselEditableText
            as="h2"
            slotId="headline"
            value={h}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...headlineStyle(tokens),
              marginTop: "0.55rem",
              maxWidth: "12ch",
            }}
          />
        </div>
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), maxWidth: "24ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function WorkedExample({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  treatment,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const photo = imageUrl?.trim() || "";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1.4rem 1.7rem",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: DESIGN.typography.eyebrow,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: tokens.colors.accent,
          fontWeight: 760,
        }}
      >
        {roadmapTreatmentEyebrow(treatment)}
      </p>
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{ ...headlineStyle(tokens), marginTop: "0.65rem", maxWidth: "14ch" }}
      />
      {photo ? (
        <div
          style={{
            flex: 1,
            minHeight: "7.5rem",
            margin: "1rem 0 0.9rem",
            borderRadius: DESIGN.radius.media,
            ...imageStyle(photo),
          }}
        />
      ) : (
        <div
          style={{
            margin: "1.1rem 0 0.9rem",
            padding: "1rem 1.05rem",
            borderRadius: DESIGN.radius.surface,
            border: `1px solid ${wash(tokens.colors.foreground, 0.12)}`,
            background: wash(tokens.colors.accent, 0.07),
          }}
        >
          <NextArrow tokens={tokens} />
        </div>
      )}
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), maxWidth: "30ch" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function Checkpoint({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
  treatment,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const count = groundedStepCount(composition);
  const current = composition.roadmapStepIndex;
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: count >= 2 ? "space-between" : "flex-start",
        padding: "1.55rem 1.45rem 1.75rem",
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: DESIGN.typography.eyebrow,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: tokens.colors.accent,
            fontWeight: 760,
          }}
        >
          {roadmapTreatmentEyebrow(treatment)}
        </p>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), marginTop: "0.7rem", maxWidth: "13ch" }}
        />
      </div>
      <div style={{ marginTop: count >= 2 ? 0 : "1.35rem" }}>
        {count >= 2 ? (
          <PathStations tokens={tokens} count={count} current={current} />
        ) : (
          <NextArrow tokens={tokens} />
        )}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...bodyStyle(tokens),
              marginTop: "1rem",
              maxWidth: "28ch",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function Recap({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
  treatment,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const count = groundedStepCount(composition);
  const labels = labelsForGroundedSteps(
    composition,
    supportCopy(values) || b,
    h
  );
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: count >= 2 ? "space-between" : "flex-start",
        padding: "1.55rem 1.45rem 1.75rem",
        background: `linear-gradient(180deg, ${tokens.colors.background} 0%, ${wash(
          tokens.colors.accent,
          0.1
        )} 100%)`,
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: DESIGN.typography.eyebrow,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: tokens.colors.accent,
            fontWeight: 760,
          }}
        >
          {roadmapTreatmentEyebrow(treatment)}
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
            marginTop: "0.7rem",
            maxWidth: "12ch",
            fontSize: DESIGN.typography.nextAction,
          }}
        />
      </div>
      <div style={{ marginTop: count >= 2 ? 0 : "1.35rem" }}>
        {count >= 2 ? (
          <PathStations tokens={tokens} count={count} labels={labels} current={count} />
        ) : (
          <NextArrow tokens={tokens} />
        )}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...bodyStyle(tokens),
              marginTop: "1rem",
              maxWidth: "28ch",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function DecisionClose({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
  treatment,
}: RoadmapProps) {
  const h = headline(values);
  const b = body(values);
  const action = cta(values);
  const count = groundedStepCount(composition);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: count >= 2 ? "space-between" : "flex-start",
        padding: "1.65rem 1.45rem 1.8rem",
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: DESIGN.typography.eyebrow,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: tokens.colors.accent,
            fontWeight: 760,
          }}
        >
          {roadmapTreatmentEyebrow(treatment)}
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
            marginTop: "0.85rem",
            fontSize: DESIGN.typography.nextAction,
            maxWidth: "11ch",
          }}
        />
      </div>
      <div style={{ marginTop: count >= 2 ? 0 : "1.35rem" }}>
        {count >= 2 ? (
          <div style={{ maxWidth: "12rem", marginBottom: "1rem" }}>
            <PathStations tokens={tokens} count={count} current={count} />
          </div>
        ) : (
          <div style={{ marginBottom: "1rem" }}>
            <NextArrow tokens={tokens} />
          </div>
        )}
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), maxWidth: "28ch" }}
          />
        ) : null}
        {action ? (
          <CarouselEditableText
            as="p"
            slotId="cta_label"
            value={action}
            editable={editable}
            onCommit={onSlotChange}
            style={{
              margin: "1rem 0 0",
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: tokens.colors.accent,
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function renderForVariant(props: RoadmapProps) {
  switch (props.variant) {
    case "cover_editorial":
      return <CoverEditorial {...props} />;
    case "cover_path":
      return <CoverPath {...props} />;
    case "route_map":
      return <RouteMap {...props} />;
    case "step_focus":
      return <StepFocus {...props} />;
    case "step_photo_split":
      return <StepPhotoSplit {...props} />;
    case "action_checklist":
      return <ActionChecklist {...props} />;
    case "progress_path":
      return <ProgressPath {...props} />;
    case "worked_example":
      return <WorkedExample {...props} />;
    case "checkpoint":
      return <Checkpoint {...props} />;
    case "recap":
      return <Recap {...props} />;
    case "decision_close":
      return <DecisionClose {...props} />;
  }
}

export function CarouselRoadmapPremiumFamily(
  props: CarouselRoadmapPremiumFamilyProps
) {
  const composition = props.composition as RoadmapComposition | undefined;
  if (!composition || composition.family !== "roadmap") {
    return null;
  }

  const treatment = resolveRoadmapRenderTreatment({
    treatment: composition.treatment,
    imageUrl: props.imageUrl,
  });
  const variant = resolveRoadmapPremiumVariant({
    treatment,
    position: composition.position,
    totalSlides: composition.totalSlides,
    archetype: composition.archetype,
    sequence: composition.sequence,
    roadmapStepCount: composition.roadmapStepCount,
    roadmapStepIndex: composition.roadmapStepIndex,
    imageUrl: props.imageUrl,
    previousVariant: props.previousRoadmapVariant,
  });

  return (
    <div
      data-roadmap-family="roadmap"
      data-roadmap-premium="v1"
      data-roadmap-treatment={treatment}
      data-roadmap-variant={variant}
      data-roadmap-role={composition.semanticRole}
      data-roadmap-archetype={composition.archetype}
      data-roadmap-position={String(composition.position)}
      data-roadmap-step-count={String(composition.roadmapStepCount)}
      data-roadmap-step-index={
        composition.roadmapStepIndex == null
          ? ""
          : String(composition.roadmapStepIndex)
      }
      data-roadmap-step-source={composition.roadmapStepSource}
      style={{ width: "22.5rem" }}
    >
      {renderForVariant({
        ...props,
        composition,
        treatment,
        variant,
      })}
    </div>
  );
}
