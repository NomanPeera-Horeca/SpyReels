import type { CSSProperties } from "react";
import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import {
  resolveStoryNarrativeRenderTreatment,
  type StoryNarrativeComposition,
  type StoryNarrativeTreatment,
} from "@shared/carouselStoryFamily";
import {
  STORY_PREMIUM_DESIGN_FOUNDATION as DESIGN,
  resolveStoryPremiumVariant,
  type StoryPremiumVariant,
} from "@shared/carouselStoryPremiumDesignSystem";
import { CarouselDecorationLayer } from "@/components/CarouselDecorationLayer";
import { CarouselEditableText } from "@/components/CarouselEditableText";

export type CarouselStoryPremiumFamilyProps = {
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

type StoryProps = CarouselStoryPremiumFamilyProps & {
  composition: StoryNarrativeComposition;
  treatment: StoryNarrativeTreatment;
  variant: StoryPremiumVariant;
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
    fontSize: "clamp(1.72rem, 6.7vw, 2.25rem)",
    fontWeight: 760,
    lineHeight: 1.04,
    letterSpacing: "-0.045em",
    overflowWrap: "normal",
    wordBreak: "normal",
    hyphens: "none",
  };
}

function bodyStyle(tokens: CarouselDesignTokens): CSSProperties {
  return {
    margin: 0,
    fontSize: DESIGN.typography.storyBody,
    lineHeight: 1.52,
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

function CinematicCover({
  tokens,
  values,
  imageUrl,
  editable,
  onSlotChange,
  handle,
  variant,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  const k = kicker(values);
  const withImage = Boolean(imageUrl?.trim()) && variant !== "cover_type";

  if (withImage && variant === "cover_full_bleed") {
    return (
      <div style={{ ...shell(tokens), ...imageStyle(imageUrl!) }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,10,16,0.12) 18%, rgba(8,10,16,0.36) 48%, rgba(8,10,16,0.92) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: 0,
            right: 0,
            bottom: 0,
            padding: "2rem 1.55rem 2.25rem",
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
              marginTop: k ? "0.8rem" : 0,
              maxWidth: "13ch",
              fontSize: "clamp(2rem, 8vw, 2.7rem)",
              color: "#fff",
              textShadow: "0 2px 22px rgba(0,0,0,0.35)",
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
                margin: "0.9rem 0 0",
                maxWidth: "29ch",
                fontSize: "0.84rem",
                lineHeight: 1.48,
                color: "rgba(255,255,255,0.78)",
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
      <div
        style={{
          ...shell(tokens),
          display: "grid",
          gridTemplateRows: "1.12fr 0.88fr",
          padding: "1rem",
          gap: "1rem",
        }}
      >
        <div
          aria-hidden
          style={{
            ...imageStyle(imageUrl!),
            borderRadius: DESIGN.radius.media,
            minHeight: 0,
            boxShadow: `0 1.2rem 2.8rem ${wash(tokens.colors.foreground, 0.13)}`,
          }}
        />
        <div style={{ padding: "0 0.55rem 1.15rem", alignSelf: "center" }}>
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
              marginTop: k ? "0.65rem" : 0,
              fontSize: "clamp(1.72rem, 6.6vw, 2.15rem)",
              maxWidth: "15ch",
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
              style={{ ...bodyStyle(tokens), marginTop: "0.7rem", maxWidth: "32ch" }}
            />
          ) : null}
        </div>
        <Handle handle={handle} tokens={tokens} />
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
        padding: "2.1rem 1.7rem 2.35rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "1.6rem",
          right: "1.3rem",
          width: "8.5rem",
          height: "8.5rem",
          borderRadius: "999px",
          border: `1px solid ${wash(tokens.colors.accent, 0.32)}`,
          background: wash(tokens.colors.accent, 0.08),
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
            marginTop: k ? "0.85rem" : 0,
            maxWidth: "12ch",
            fontSize: "clamp(2.2rem, 8.8vw, 3rem)",
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
            style={{ ...bodyStyle(tokens), marginTop: "1rem", maxWidth: "31ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function StoryScene(props: StoryProps) {
  const { tokens, values, imageUrl, editable, onSlotChange, handle, variant } = props;
  const h = headline(values);
  const b = body(values);
  const withImage = Boolean(imageUrl?.trim());

  if (!withImage) return <EditorialSetup {...props} />;

  if (variant === "scene_full_bleed") {
    return (
      <div style={{ ...shell(tokens), ...imageStyle(imageUrl!) }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,10,16,0.06) 20%, rgba(8,10,16,0.18) 50%, rgba(8,10,16,0.86) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: "1.35rem",
            right: "1.35rem",
            bottom: "2rem",
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
              maxWidth: "14ch",
              color: "#fff",
              fontSize: "clamp(1.7rem, 6.6vw, 2.2rem)",
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
                margin: "0.7rem 0 0",
                maxWidth: "30ch",
                fontSize: DESIGN.typography.caption,
                lineHeight: 1.46,
                color: "rgba(255,255,255,0.78)",
              }}
            />
          ) : null}
        </div>
        <Handle handle={handle} tokens={tokens} light />
      </div>
    );
  }

  if (variant === "scene_caption_bottom") {
    return (
      <div
        style={{
          ...shell(tokens),
          display: "grid",
          gridTemplateRows: "1fr auto",
          padding: "0.9rem",
          gap: "0.75rem",
        }}
      >
        <div
          aria-hidden
          style={{
            ...imageStyle(imageUrl!),
            borderRadius: DESIGN.radius.media,
            minHeight: 0,
          }}
        />
        <div style={{ padding: "0.15rem 0.5rem 1.3rem" }}>
          <CarouselEditableText
            as="h2"
            slotId="headline"
            value={h}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{
              ...headlineStyle(tokens),
              fontSize: "clamp(1.25rem, 4.8vw, 1.6rem)",
              maxWidth: "18ch",
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
              style={{ ...bodyStyle(tokens), marginTop: "0.5rem", fontSize: DESIGN.typography.caption }}
            />
          ) : null}
        </div>
        <Handle handle={handle} tokens={tokens} />
      </div>
    );
  }

  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        padding: "1.05rem 1.05rem 1.7rem",
      }}
    >
      <div
        aria-hidden
        style={{
          ...imageStyle(imageUrl!),
          flex: 1,
          minHeight: 0,
          borderRadius: DESIGN.radius.media,
          boxShadow: `0 1.1rem 2.5rem ${wash(tokens.colors.foreground, 0.13)}`,
        }}
      />
      <div style={{ padding: "1rem 0.55rem 0" }}>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{
            ...headlineStyle(tokens),
            fontSize: "clamp(1.3rem, 5vw, 1.68rem)",
            maxWidth: "18ch",
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
            style={{ ...bodyStyle(tokens), marginTop: "0.5rem", maxWidth: "34ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function EditorialSetup({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  const centered = variant === "setup_center";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        alignItems: centered ? "center" : "flex-end",
        justifyContent: "center",
        padding: centered ? "2.2rem 2rem" : "2.1rem 1.7rem 2.35rem",
      }}
    >
      <CarouselDecorationLayer type={tokens.decoration} color={tokens.colors.accent} />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          textAlign: centered ? "center" : "left",
        }}
      >
        <div
          aria-hidden
          style={{
            width: centered ? "2.8rem" : "3.5rem",
            height: "2px",
            borderRadius: DESIGN.radius.pill,
            background: tokens.colors.accent,
            margin: centered ? "0 auto 1.25rem" : "0 0 1.25rem",
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
            maxWidth: centered ? "15ch" : "14ch",
            margin: centered ? "0 auto" : 0,
            fontSize: "clamp(1.9rem, 7.5vw, 2.55rem)",
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
              margin: centered ? "1rem auto 0" : "1rem 0 0",
              maxWidth: "32ch",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function TensionStatement({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  const field = variant === "tension_accent_field";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "1.65rem",
      }}
    >
      {field ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "1.05rem",
            borderRadius: DESIGN.radius.media,
            background: wash(tokens.colors.accent, 0.13),
            border: `1px solid ${wash(tokens.colors.accent, 0.42)}`,
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "1.55rem",
            top: "1.5rem",
            bottom: "1.5rem",
            width: "0.22rem",
            borderRadius: DESIGN.radius.pill,
            background: tokens.colors.accent,
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: field ? "1.2rem" : "0 0.3rem 0 1rem",
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
            maxWidth: "12ch",
            fontSize: "clamp(2.25rem, 9vw, 3.05rem)",
            lineHeight: 0.98,
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
            style={{ ...bodyStyle(tokens), marginTop: "1.15rem", maxWidth: "29ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function QuoteMoment({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  const side = variant === "quote_side";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        alignItems: "center",
        padding: "2rem 1.7rem",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: side ? "1.6rem" : "2.2rem",
          left: side ? "1.5rem" : "50%",
          transform: side ? undefined : "translateX(-50%)",
          fontFamily: tokens.fontFamily.display,
          fontSize: "6rem",
          lineHeight: 0.8,
          color: wash(tokens.colors.accent, 0.2),
        }}
      >
        “
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          paddingLeft: side ? "1rem" : 0,
          textAlign: side ? "left" : "center",
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
            margin: side ? 0 : "0 auto",
            maxWidth: "14ch",
            fontSize: "clamp(1.85rem, 7.2vw, 2.45rem)",
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
              margin: side ? "1rem 0 0" : "1rem auto 0",
              maxWidth: "29ch",
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function ImageTextSplit(props: StoryProps) {
  const { tokens, values, imageUrl, editable, onSlotChange, handle, variant } = props;
  if (!imageUrl?.trim()) return <EditorialSetup {...props} />;
  const h = headline(values);
  const b = body(values);
  const imageFirst = variant === "split_image_left";

  const text = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minWidth: 0,
        padding: imageFirst ? "1.45rem 1.3rem 1.8rem 1.05rem" : "1.45rem 1.05rem 1.8rem 1.45rem",
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
          fontSize: "clamp(1.28rem, 4.9vw, 1.65rem)",
          maxWidth: "15ch",
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
          style={{ ...bodyStyle(tokens), marginTop: "0.85rem", maxWidth: "27ch" }}
        />
      ) : null}
    </div>
  );

  const image = (
    <div
      aria-hidden
      style={{
        ...imageStyle(imageUrl),
        margin: "0.9rem",
        borderRadius: DESIGN.radius.media,
        minWidth: 0,
      }}
    />
  );

  return (
    <div
      style={{
        ...shell(tokens),
        display: "grid",
        gridTemplateColumns: imageFirst ? "1.02fr 0.98fr" : "1.05fr 0.95fr",
      }}
    >
      {imageFirst ? image : text}
      {imageFirst ? text : image}
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function TurningPoint(props: StoryProps) {
  const { tokens, values, imageUrl, editable, onSlotChange, handle, variant } = props;
  const h = headline(values);
  const b = body(values);
  const withImage = Boolean(imageUrl?.trim()) && variant === "turning_point_image";

  return (
    <div
      style={{
        ...shell(tokens),
        ...(withImage ? imageStyle(imageUrl!) : {}),
        display: "flex",
        alignItems: "center",
        padding: "1.55rem",
      }}
    >
      {withImage ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(8,10,16,0.92) 0%, rgba(8,10,16,0.68) 58%, rgba(8,10,16,0.26) 100%)",
          }}
        />
      ) : (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "-2rem",
              top: "50%",
              width: "13rem",
              height: "13rem",
              transform: "translateY(-50%)",
              borderRadius: "999px",
              background: wash(tokens.colors.accent, 0.17),
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: "1.4rem",
              top: "1.4rem",
              width: "2.8rem",
              height: "2px",
              background: tokens.colors.accent,
            }}
          />
        </>
      )}
      <div style={{ position: "relative", zIndex: 2, maxWidth: withImage ? "63%" : "88%" }}>
        <p
          style={{
            margin: "0 0 0.9rem",
            fontSize: DESIGN.typography.eyebrow,
            fontWeight: 760,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: withImage ? "rgba(255,255,255,0.72)" : tokens.colors.accent,
          }}
        >
          THE TURN
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
            maxWidth: "12ch",
            fontSize: "clamp(2rem, 8vw, 2.75rem)",
            color: withImage ? "#fff" : tokens.colors.foreground,
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
              marginTop: "1rem",
              maxWidth: "28ch",
              color: withImage ? "rgba(255,255,255,0.76)" : tokens.colors.muted,
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} light={withImage} />
    </div>
  );
}

function TimelineMoment({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        alignItems: "center",
        padding: "2rem 1.65rem",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "1.7rem",
          top: "1.7rem",
          bottom: "1.7rem",
          width: "1px",
          background: wash(tokens.colors.accent, 0.58),
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "1.43rem",
          top: "44%",
          width: "0.56rem",
          height: "0.56rem",
          borderRadius: "999px",
          background: tokens.colors.accent,
          boxShadow: `0 0 0 0.35rem ${wash(tokens.colors.accent, 0.13)}`,
        }}
      />
      <div style={{ position: "relative", zIndex: 2, paddingLeft: "1.1rem" }}>
        <p
          style={{
            margin: "0 0 0.7rem",
            fontSize: DESIGN.typography.eyebrow,
            fontWeight: 760,
            letterSpacing: "0.14em",
            color: tokens.colors.accent,
            textTransform: "uppercase",
          }}
        >
          ONE MOMENT
        </p>
        <CarouselEditableText
          as="h2"
          slotId="headline"
          value={h}
          editable={editable}
          onCommit={onSlotChange}
          multiline
          style={{ ...headlineStyle(tokens), maxWidth: "14ch", fontSize: "clamp(1.8rem, 7vw, 2.4rem)" }}
        />
        {b ? (
          <CarouselEditableText
            as="p"
            slotId="body"
            value={b}
            editable={editable}
            onCommit={onSlotChange}
            multiline
            style={{ ...bodyStyle(tokens), marginTop: "0.9rem", maxWidth: "30ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function InsightReveal({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
  variant,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  const manifesto = variant === "insight_manifesto";
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        alignItems: manifesto ? "center" : "flex-end",
        padding: "2rem 1.7rem 2.35rem",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: manifesto ? "2rem 1.15rem" : "auto 1.4rem 1.4rem auto",
          width: manifesto ? undefined : "7rem",
          height: manifesto ? undefined : "7rem",
          borderRadius: manifesto ? DESIGN.radius.media : "999px",
          background: wash(tokens.colors.accent, manifesto ? 0.1 : 0.12),
          border: `1px solid ${wash(tokens.colors.accent, 0.3)}`,
        }}
      />
      <div style={{ position: "relative", zIndex: 2, width: "100%", padding: manifesto ? "1rem" : 0 }}>
        <p
          style={{
            margin: "0 0 0.8rem",
            fontSize: DESIGN.typography.eyebrow,
            fontWeight: 760,
            letterSpacing: "0.15em",
            color: tokens.colors.accent,
            textTransform: "uppercase",
          }}
        >
          WHAT I LEARNED
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
            maxWidth: manifesto ? "13ch" : "15ch",
            fontSize: manifesto ? "clamp(2rem, 7.8vw, 2.7rem)" : "clamp(1.8rem, 7vw, 2.35rem)",
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
            style={{ ...bodyStyle(tokens), marginTop: "1rem", maxWidth: "31ch" }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function StoryClosing({
  tokens,
  values,
  editable,
  onSlotChange,
  handle,
}: StoryProps) {
  const h = headline(values);
  const b = body(values);
  const action = cta(values);
  return (
    <div
      style={{
        ...shell(tokens),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "2.1rem 1.75rem 2.35rem",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: "11rem",
          height: "11rem",
          borderRadius: "999px",
          right: "-4.5rem",
          bottom: "-3.5rem",
          background: wash(tokens.colors.accent, 0.1),
          border: `1px solid ${wash(tokens.colors.accent, 0.25)}`,
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>
        <p
          style={{
            margin: "0 0 0.85rem",
            fontSize: DESIGN.typography.eyebrow,
            fontWeight: 760,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: tokens.colors.accent,
          }}
        >
          THE PART I KEEP
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
            maxWidth: "14ch",
            fontSize: "clamp(2rem, 7.8vw, 2.65rem)",
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
            style={{ ...bodyStyle(tokens), marginTop: "0.95rem", maxWidth: "31ch" }}
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
              marginTop: "1.25rem",
              padding: "0.62rem 0.9rem",
              borderRadius: DESIGN.radius.pill,
              background: wash(tokens.colors.accent, 0.14),
              border: `1px solid ${wash(tokens.colors.accent, 0.44)}`,
              color: tokens.colors.foreground,
              fontSize: "0.72rem",
              fontWeight: 720,
            }}
          />
        ) : null}
      </div>
      <Handle handle={handle} tokens={tokens} />
    </div>
  );
}

function renderForTreatment(props: StoryProps) {
  switch (props.treatment) {
    case "cinematic_cover":
      return <CinematicCover {...props} />;
    case "story_scene":
      return <StoryScene {...props} />;
    case "editorial_setup":
      return <EditorialSetup {...props} />;
    case "tension_statement":
      return <TensionStatement {...props} />;
    case "quote_moment":
      return <QuoteMoment {...props} />;
    case "image_text_split":
      return <ImageTextSplit {...props} />;
    case "turning_point":
      return <TurningPoint {...props} />;
    case "timeline_moment":
      return <TimelineMoment {...props} />;
    case "insight_reveal":
      return <InsightReveal {...props} />;
    case "story_closing":
      return <StoryClosing {...props} />;
  }
}

export function CarouselStoryPremiumFamily(
  props: CarouselStoryPremiumFamilyProps
) {
  const composition = props.composition as StoryNarrativeComposition | undefined;
  if (!composition || composition.family !== "story_narrative") {
    return null;
  }

  const treatment = resolveStoryNarrativeRenderTreatment({
    treatment: composition.treatment,
    semanticRole: composition.semanticRole,
    imageUrl: props.imageUrl,
  });
  const variant = resolveStoryPremiumVariant({
    treatment,
    position: composition.position,
    totalSlides: composition.totalSlides,
    imageUrl: props.imageUrl,
  });

  return renderForTreatment({
    ...props,
    composition,
    treatment,
    variant,
  });
}
