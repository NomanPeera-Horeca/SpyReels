import type { CSSProperties } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  resolveFrameworkRenderTreatment,
  type FrameworkComposition,
  type FrameworkTreatment,
} from "@shared/carouselFrameworkFamily";
import {
  FRAMEWORK_PREMIUM_DESIGN_FOUNDATION as DESIGN,
  resolveFrameworkPremiumVariant,
  type FrameworkPremiumVariant,
} from "@shared/carouselFrameworkPremiumDesignSystem";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselFrameworkPremiumFamilyProps = {
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

type FrameworkProps = CarouselFrameworkPremiumFamilyProps & {
  composition: FrameworkComposition;
  treatment: FrameworkTreatment;
  variant: FrameworkPremiumVariant;
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
    fontSize: DESIGN.typography.frameworkBody,
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

function leftCopy(values: CarouselSlotValues): string {
  return values.left?.trim() || "";
}

function rightCopy(values: CarouselSlotValues): string {
  return values.right?.trim() || "";
}

function partLines(text: string, exclude?: string): string[] {
  const skip = exclude?.trim() || "";
  return text
    .split(/\n|•|;/)
    .map((line) => line.replace(/^\s*[-]\s*/, "").trim())
    .filter((line) => line && line !== skip)
    .slice(0, 4);
}

function markCount(composition: FrameworkComposition): number {
  const count = composition.frameworkStepCount;
  if (count >= 2 && count <= 5) return count;
  if (composition.totalSlides >= 6) return 4;
  if (composition.totalSlides >= 5) return 3;
  return 0;
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

function SystemMarks({
  tokens,
  count,
  current,
  connected = true,
}: {
  tokens: CarouselDesignTokens;
  count: number;
  current?: number | null;
  connected?: boolean;
}) {
  if (count < 2) return null;
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        width: "100%",
      }}
    >
      {Array.from({ length: count }, (_, index) => {
        const active = current != null && index + 1 === current;
        return (
          <div
            key={`mark-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              flex: index === count - 1 ? "0 0 auto" : 1,
            }}
          >
            <span
              style={{
                width: active ? "0.72rem" : "0.48rem",
                height: active ? "0.72rem" : "0.48rem",
                borderRadius: "999px",
                background: active
                  ? tokens.colors.accent
                  : wash(tokens.colors.foreground, 0.18),
                boxShadow: active
                  ? `0 0 0 4px ${wash(tokens.colors.accent, 0.18)}`
                  : "none",
                flex: "0 0 auto",
              }}
            />
            {connected && index < count - 1 ? (
              <span
                style={{
                  display: "block",
                  height: 1,
                  flex: 1,
                  margin: "0 0.28rem",
                  background: wash(tokens.colors.foreground, 0.16),
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FoundationBar({ tokens }: { tokens: CarouselDesignTokens }) {
  return (
    <div
      aria-hidden
      style={{
        height: "0.28rem",
        borderRadius: DESIGN.radius.pill,
        background: wash(tokens.colors.accent, 0.55),
      }}
    />
  );
}

function CoverEditorial({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  const count = markCount(composition);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.7rem 1.55rem 1.85rem",
      }}
    >
      <div>
        <Eyebrow
          value={k || "Framework"}
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
            marginTop: "0.95rem",
            maxWidth: "12ch",
            fontSize: "clamp(2rem, 8vw, 2.7rem)",
          }}
        />
      </div>
      <div>
        <div
          aria-hidden
          style={{
            width: "3.1rem",
            height: 2,
            background: tokens.colors.accent,
            marginBottom: "1rem",
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
              maxWidth: "28ch",
            }}
          />
        ) : null}
        {count >= 2 ? (
          <div style={{ marginTop: "1.25rem", maxWidth: "11rem" }}>
            <SystemMarks tokens={tokens} count={count} />
          </div>
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
    </div>
  );
}

function CoverDiagram({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  const count = Math.max(3, markCount(composition) || 3);
  const photo = imageUrl?.trim() || "";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.55rem 1.45rem 1.7rem",
      }}
    >
      <Eyebrow
        value={k || "Model"}
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
          marginTop: "0.7rem",
          maxWidth: "14ch",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "relative",
          flex: 1,
          minHeight: "9.5rem",
          margin: "1.1rem 0 0.9rem",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "4.4rem",
            height: "4.4rem",
            marginLeft: "-2.2rem",
            marginTop: "-2.2rem",
            borderRadius: "999px",
            border: `2px solid ${tokens.colors.accent}`,
            background: photo
              ? undefined
              : wash(tokens.colors.accent, 0.12),
            ...(photo ? imageStyle(photo) : {}),
            boxShadow: `0 0 0 10px ${wash(tokens.colors.accent, 0.08)}`,
          }}
        />
        {Array.from({ length: count }, (_, index) => {
          const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
          const x = 50 + Math.cos(angle) * 38;
          const y = 50 + Math.sin(angle) * 34;
          return (
            <span
              key={`orbit-${index}`}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: "0.7rem",
                height: "0.7rem",
                marginLeft: "-0.35rem",
                marginTop: "-0.35rem",
                borderRadius: "999px",
                background: tokens.colors.foreground,
                opacity: 0.55,
              }}
            />
          );
        })}
      </div>
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

function CenteredSystem({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  const count = markCount(composition);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1.6rem 1.45rem",
        gap: "1.15rem",
      }}
    >
      <Eyebrow
        value={k}
        tokens={tokens}
        editable={editable}
        onSlotChange={onSlotChange}
      />
      <div
        style={{
          position: "relative",
          padding: "1.35rem 1.2rem 1.25rem",
          borderRadius: DESIGN.radius.surface,
          border: `1px solid ${wash(tokens.colors.foreground, 0.12)}`,
          background: wash(tokens.colors.accent, 0.06),
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
            textAlign: "center",
            fontSize: "clamp(1.35rem, 5.4vw, 1.8rem)",
          }}
        />
      </div>
      {count >= 2 ? (
        <SystemMarks
          tokens={tokens}
          count={count}
          current={composition.frameworkStepIndex}
        />
      ) : (
        <div
          aria-hidden
          style={{
            height: 1,
            background: wash(tokens.colors.foreground, 0.12),
          }}
        />
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
            textAlign: "center",
            maxWidth: "30ch",
            marginInline: "auto",
          }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function ConnectedNodes({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const extra = partLines(supportCopy(values), body(values));
  const count = Math.max(markCount(composition), extra.length, 2);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.55rem 1.4rem 1.75rem",
      }}
    >
      <div>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), maxWidth: "13ch" }}
        />
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "0.85rem", maxWidth: "28ch" }}
          />
        ) : null}
      </div>
      <div>
        <SystemMarks
          tokens={tokens}
          count={Math.min(count, 5)}
          current={composition.frameworkStepIndex}
        />
        {extra.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(extra.length, 4)}, 1fr)`,
              gap: "0.45rem",
              marginTop: "0.75rem",
            }}
          >
            {extra.map((line, index) => (
              <p
                key={line}
                style={{
                  margin: 0,
                  fontSize: DESIGN.typography.partLabel,
                  lineHeight: 1.35,
                  letterSpacing: "0.02em",
                  color:
                    composition.frameworkStepIndex === index + 1
                      ? tokens.colors.foreground
                      : tokens.colors.muted,
                }}
              >
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function VerticalPillars({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const extra = partLines(supportCopy(values), body(values));
  const count = Math.min(Math.max(markCount(composition), extra.length, 3), 4);
  const current = composition.frameworkStepIndex;
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
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${count}, 1fr)`,
          alignItems: "end",
          gap: "0.55rem",
          margin: "1.15rem 0 0.7rem",
        }}
      >
        {Array.from({ length: count }, (_, index) => {
          const active = current == null || current === index + 1;
          return (
            <div
              key={`pillar-${index}`}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                minHeight: "8.5rem",
              }}
            >
              {extra[index] ? (
                <p
                  style={{
                    margin: "0 0 0.45rem",
                    fontSize: DESIGN.typography.partLabel,
                    lineHeight: 1.3,
                    color: active
                      ? tokens.colors.foreground
                      : tokens.colors.muted,
                  }}
                >
                  {extra[index]}
                </p>
              ) : null}
              <div
                aria-hidden
                style={{
                  height: active ? "72%" : "42%",
                  borderRadius: `${DESIGN.radius.compact} ${DESIGN.radius.compact} 0 0`,
                  background: active
                    ? tokens.colors.accent
                    : wash(tokens.colors.foreground, 0.1),
                }}
              />
            </div>
          );
        })}
      </div>
      <FoundationBar tokens={tokens} />
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...bodyStyle(tokens), marginTop: "0.85rem", maxWidth: "30ch" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function SteppedPath({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const count = Math.max(markCount(composition), 3);
  const current = composition.frameworkStepIndex ?? Math.min(composition.position, count);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.5rem 1.4rem 1.7rem",
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: DESIGN.typography.partLabel,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: tokens.colors.accent,
            fontWeight: 760,
          }}
        >
          {current} of {count}
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
      <div
        aria-hidden
        style={{
          position: "relative",
          height: "3.4rem",
          margin: "0.4rem 0 0.8rem",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "1.45rem",
            height: 2,
            background: wash(tokens.colors.foreground, 0.16),
          }}
        />
        {Array.from({ length: count }, (_, index) => {
          const active = index + 1 === current;
          return (
            <span
              key={`step-${index}`}
              style={{
                position: "absolute",
                left: `${(index / Math.max(count - 1, 1)) * 100}%`,
                top: active ? "0.55rem" : "1.05rem",
                width: active ? "1.35rem" : "0.72rem",
                height: active ? "1.35rem" : "0.72rem",
                marginLeft: active ? "-0.67rem" : "-0.36rem",
                borderRadius: "999px",
                background: active
                  ? tokens.colors.accent
                  : tokens.colors.background,
                border: `2px solid ${
                  active ? tokens.colors.accent : wash(tokens.colors.foreground, 0.28)
                }`,
              }}
            />
          );
        })}
      </div>
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

function VerticalFlow({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const count = Math.max(markCount(composition), 3);
  const current = composition.frameworkStepIndex ?? Math.min(composition.position, count);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "grid",
        gridTemplateColumns: "1.4rem 1fr",
        gap: "0.95rem",
        padding: "1.5rem 1.4rem 1.7rem",
      }}
    >
      <div aria-hidden style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: "0.42rem",
            top: "0.2rem",
            bottom: "1.4rem",
            width: 2,
            background: wash(tokens.colors.foreground, 0.16),
          }}
        />
        {Array.from({ length: count }, (_, index) => {
          const active = index + 1 === current;
          return (
            <span
              key={`flow-${index}`}
              style={{
                position: "absolute",
                left: active ? 0 : "0.18rem",
                top: `${(index / Math.max(count - 1, 1)) * 78 + 4}%`,
                width: active ? "1.05rem" : "0.7rem",
                height: active ? "1.05rem" : "0.7rem",
                borderRadius: "999px",
                background: active
                  ? tokens.colors.accent
                  : wash(tokens.colors.foreground, 0.2),
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), maxWidth: "12ch" }}
        />
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "0.9rem", maxWidth: "26ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function StackedLayers({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const extra = partLines(supportCopy(values), body(values));
  const count = Math.min(Math.max(markCount(composition), extra.length, 3), 4);
  const current = composition.frameworkStepIndex ?? 1;
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
        style={{ ...headlineStyle(tokens), maxWidth: "13ch" }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: "0.4rem",
          margin: "1.1rem 0 0.9rem",
        }}
      >
        {Array.from({ length: count }, (_, index) => {
          const active = index + 1 === current;
          return (
            <div
              key={`layer-${index}`}
              style={{
                minHeight: active ? "3.1rem" : "1.55rem",
                borderRadius: DESIGN.radius.compact,
                padding: active ? "0.7rem 0.85rem" : "0.35rem 0.85rem",
                background: active
                  ? wash(tokens.colors.accent, 0.18)
                  : wash(tokens.colors.foreground, 0.06),
                border: `1px solid ${
                  active
                    ? wash(tokens.colors.accent, 0.4)
                    : wash(tokens.colors.foreground, 0.08)
                }`,
                display: "flex",
                alignItems: "center",
              }}
            >
              {active ? (
                <CarouselEditableText
                  as="p"
                  slotId="body"
                  value={b}
                  editable={editable}
                  onCommit={onSlotChange}
                  multiline
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    lineHeight: 1.4,
                    color: tokens.colors.foreground,
                  }}
                />
              ) : extra[index] ? (
                <span
                  style={{
                    fontSize: DESIGN.typography.partLabel,
                    color: tokens.colors.muted,
                  }}
                >
                  {extra[index]}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function CircularFlow({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const count = Math.max(markCount(composition), 3);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.45rem 1.4rem 1.65rem",
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
          textAlign: "center",
          fontSize: "clamp(1.35rem, 5.5vw, 1.85rem)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "relative",
          flex: 1,
          minHeight: "10.5rem",
          margin: "0.7rem 0",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "7.4rem",
            height: "7.4rem",
            marginLeft: "-3.7rem",
            marginTop: "-3.7rem",
            borderRadius: "999px",
            border: `2px solid ${wash(tokens.colors.foreground, 0.16)}`,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "1.15rem",
            height: "1.15rem",
            marginLeft: "-0.57rem",
            marginTop: "-0.57rem",
            borderRadius: "999px",
            background: tokens.colors.accent,
          }}
        />
        {Array.from({ length: count }, (_, index) => {
          const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
          const x = 50 + Math.cos(angle) * 37;
          const y = 50 + Math.sin(angle) * 37;
          const active = composition.frameworkStepIndex === index + 1;
          return (
            <span
              key={`cycle-${index}`}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: active ? "0.95rem" : "0.7rem",
                height: active ? "0.95rem" : "0.7rem",
                marginLeft: active ? "-0.47rem" : "-0.35rem",
                marginTop: active ? "-0.47rem" : "-0.35rem",
                borderRadius: "999px",
                background: active
                  ? tokens.colors.accent
                  : wash(tokens.colors.foreground, 0.28),
              }}
            />
          );
        })}
      </div>
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
            textAlign: "center",
            maxWidth: "28ch",
            marginInline: "auto",
          }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function DecisionSplit({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const left = leftCopy(values);
  const right = rightCopy(values);
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
      <div
        aria-hidden
        style={{
          position: "relative",
          height: "3.6rem",
          margin: "1.1rem 0 0.9rem",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 2,
            height: "1.35rem",
            marginLeft: -1,
            background: tokens.colors.accent,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "18%",
            right: "18%",
            top: "1.35rem",
            height: 2,
            background: tokens.colors.accent,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "18%",
            top: "1.35rem",
            width: 2,
            height: "1.35rem",
            background: tokens.colors.accent,
          }}
        />
        <span
          style={{
            position: "absolute",
            right: "18%",
            top: "1.35rem",
            width: 2,
            height: "1.35rem",
            background: tokens.colors.accent,
          }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          flex: 1,
        }}
      >
        <div
          style={{
            padding: "0.85rem 0.8rem",
            borderRadius: DESIGN.radius.compact,
            background: wash(tokens.colors.foreground, 0.05),
            border: `1px solid ${wash(tokens.colors.foreground, 0.1)}`,
          }}
        >
          <CarouselEditableText
            as="p"
            slotId={left ? "left" : "body"}
            value={left || b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.42 }}
          />
        </div>
        <div
          style={{
            padding: "0.85rem 0.8rem",
            borderRadius: DESIGN.radius.compact,
            background: wash(tokens.colors.accent, 0.12),
            border: `1px solid ${wash(tokens.colors.accent, 0.28)}`,
          }}
        >
          <CarouselEditableText
            as="p"
            slotId={right ? "right" : "support"}
            value={right || supportCopy(values)}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.42 }}
          />
        </div>
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function QuadrantEditorial({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
}: FrameworkProps) {
  const h = headline(values);
  const extra = partLines(supportCopy(values) || body(values), headline(values));
  const cells = [extra[0] || h, extra[1] || "", extra[2] || "", extra[3] || ""];
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.4rem 1.3rem 1.6rem",
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
          fontSize: "clamp(1.28rem, 5vw, 1.7rem)",
          marginBottom: "0.85rem",
        }}
      />
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 0,
          border: `1px solid ${wash(tokens.colors.foreground, 0.14)}`,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: wash(tokens.colors.foreground, 0.14),
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: 1,
            background: wash(tokens.colors.foreground, 0.14),
          }}
        />
        {cells.map((cell, index) => (
          <div
            key={`cell-${index}`}
            style={{
              padding: "0.85rem 0.8rem",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            {cell ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  lineHeight: 1.35,
                  color:
                    index === 0
                      ? tokens.colors.foreground
                      : tokens.colors.muted,
                }}
              >
                {cell}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function Manifesto({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1.7rem 1.5rem",
      }}
    >
      <div
        aria-hidden
        style={{
          width: "2.4rem",
          height: 3,
          background: tokens.colors.accent,
          marginBottom: "1.1rem",
        }}
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
          fontSize: "clamp(1.85rem, 7.4vw, 2.45rem)",
          maxWidth: "11ch",
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
          style={{ ...bodyStyle(tokens), marginTop: "1.1rem", maxWidth: "28ch" }}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function ModelPlusExample({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  composition,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const photo = imageUrl?.trim() || "";
  const count = markCount(composition);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: photo ? "flex-start" : "space-between",
        padding: "1.35rem 1.3rem 1.55rem",
        gap: "0.85rem",
      }}
    >
      <div
        style={{
          padding: "0.75rem 0.85rem",
          borderRadius: DESIGN.radius.compact,
          background: wash(tokens.colors.accent, 0.08),
          border: `1px solid ${wash(tokens.colors.accent, 0.2)}`,
        }}
      >
        {count >= 2 ? (
          <SystemMarks
            tokens={tokens}
            count={count}
            current={composition.frameworkStepIndex}
          />
        ) : (
          <div
            aria-hidden
            style={{
              height: 2,
              background: wash(tokens.colors.accent, 0.45),
            }}
          />
        )}
      </div>
      {photo ? (
        <div
          style={{
            height: "6.4rem",
            borderRadius: DESIGN.radius.media,
            ...imageStyle(photo),
          }}
        />
      ) : null}
      <CarouselEditableText
        as="h2"
        slotId="headline"
        value={h}
        editable={editable}
        onCommit={onSlotChange}
        multiline
        style={{ ...headlineStyle(tokens), fontSize: "clamp(1.35rem, 5.4vw, 1.8rem)" }}
      />
      {b ? (
        <CarouselEditableText
          as="p"
          slotId="body"
          value={b}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={bodyStyle(tokens)}
        />
      ) : null}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function FrameworkTakeaway({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  composition,
  variant,
}: FrameworkProps) {
  const h = headline(values);
  const b = body(values);
  const action = cta(values);
  const count = markCount(composition);
  const decision = variant === "decision_close";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "1.65rem 1.45rem 1.8rem",
        background: decision
          ? `linear-gradient(180deg, ${tokens.colors.background} 0%, ${wash(
              tokens.colors.accent,
              0.12
            )} 100%)`
          : tokens.colors.background,
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
          {decision ? "Decide" : "Use it"}
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
            fontSize: DESIGN.typography.decision,
            maxWidth: "11ch",
          }}
        />
      </div>
      <div>
        {count >= 2 ? (
          <div style={{ maxWidth: "10rem", marginBottom: "1rem" }}>
            <SystemMarks tokens={tokens} count={count} />
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

function renderForVariant(props: FrameworkProps) {
  switch (props.variant) {
    case "cover_editorial":
      return <CoverEditorial {...props} />;
    case "cover_diagram":
      return <CoverDiagram {...props} />;
    case "centered_system":
      return <CenteredSystem {...props} />;
    case "connected_nodes":
      return <ConnectedNodes {...props} />;
    case "vertical_pillars":
      return <VerticalPillars {...props} />;
    case "stepped_path":
      return <SteppedPath {...props} />;
    case "vertical_flow":
      return <VerticalFlow {...props} />;
    case "stacked_layers":
      return <StackedLayers {...props} />;
    case "circular_flow":
      return <CircularFlow {...props} />;
    case "decision_split":
      return <DecisionSplit {...props} />;
    case "quadrant_editorial":
      return <QuadrantEditorial {...props} />;
    case "manifesto":
      return <Manifesto {...props} />;
    case "model_plus_example":
      return <ModelPlusExample {...props} />;
    case "framework_takeaway":
    case "decision_close":
      return <FrameworkTakeaway {...props} />;
  }
}

export function CarouselFrameworkPremiumFamily(
  props: CarouselFrameworkPremiumFamilyProps
) {
  const composition = props.composition as FrameworkComposition | undefined;
  if (!composition || composition.family !== "framework") {
    return null;
  }

  const treatment = resolveFrameworkRenderTreatment({
    treatment: composition.treatment,
    imageUrl: props.imageUrl,
  });
  const variant = resolveFrameworkPremiumVariant({
    treatment,
    position: composition.position,
    totalSlides: composition.totalSlides,
    archetype: composition.archetype,
    sequence: composition.sequence,
    frameworkStepCount: composition.frameworkStepCount,
    frameworkStepIndex: composition.frameworkStepIndex,
    imageUrl: props.imageUrl,
  });

  return (
    <div
      data-framework-family="framework"
      data-framework-premium="v1"
      data-framework-treatment={treatment}
      data-framework-variant={variant}
      data-framework-role={composition.semanticRole}
      data-framework-archetype={composition.archetype}
      data-framework-position={String(composition.position)}
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
