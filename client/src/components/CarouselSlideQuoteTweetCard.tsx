import type {
  CarouselDesignTokens,
  CarouselSlotValues,
} from "@shared/carouselTemplates";

export type CarouselSlideQuoteTweetCardProps = {
  tokens: CarouselDesignTokens;
  values: CarouselSlotValues;
  handle?: string;
  className?: string;
  /** Profile avatar URL (shared across slides via shareCoverImage). */
  imageUrl?: string;
};

const ASPECT_RATIO_CSS: Record<CarouselDesignTokens["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

function normalizeHandle(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function displayNameFromHandle(handle: string): string {
  const bare = handle.replace(/^@/, "").trim();
  if (!bare) return "Your Name";
  return bare
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Hormozi-style tweet/quote card: avatar + name + verified + handle, then
 * bold left-aligned quote. Layout id: "quote_tweet_card".
 */
export function CarouselSlideQuoteTweetCard({
  tokens,
  values,
  handle,
  className,
  imageUrl,
}: CarouselSlideQuoteTweetCardProps) {
  const quote = values.headline ?? "";
  const nameOverride = (values.kicker ?? "").trim();
  const normalizedHandle = normalizeHandle(handle);
  const displayName =
    nameOverride ||
    (normalizedHandle ? displayNameFromHandle(normalizedHandle) : "Your Name");
  const handleLine = normalizedHandle || "@yourhandle";

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
        padding: "2.25rem 1.75rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "0.7rem",
          marginBottom: "1.35rem",
          width: "100%",
        }}
      >
        <div
          style={{
            width: "2.65rem",
            height: "2.65rem",
            borderRadius: "9999px",
            flexShrink: 0,
            backgroundColor: tokens.colors.muted,
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            overflow: "hidden",
          }}
          aria-hidden={!imageUrl}
        />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.28rem" }}>
            <span
              style={{
                fontFamily: tokens.fontFamily.body,
                fontSize: "0.95rem",
                fontWeight: 700,
                color: tokens.colors.foreground,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-label="Verified"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="12" fill="#1D9BF0" />
              <path
                d="M10.2 15.6 L6.8 12.2 L8.1 10.9 L10.2 13 L15.9 7.3 L17.2 8.6 Z"
                fill="#FFFFFF"
              />
            </svg>
          </div>
          <span
            style={{
              fontFamily: tokens.fontFamily.body,
              fontSize: "0.82rem",
              fontWeight: 400,
              color: tokens.colors.muted,
              lineHeight: 1.2,
            }}
          >
            {handleLine}
          </span>
        </div>
      </div>

      <h2
        style={{
          margin: 0,
          fontFamily: tokens.fontFamily.display,
          fontSize: "clamp(1.35rem, 5.8vw, 1.85rem)",
          fontWeight: 700,
          lineHeight: 1.32,
          letterSpacing: "-0.02em",
          color: tokens.colors.foreground,
          maxWidth: "18ch",
          whiteSpace: "pre-line",
        }}
      >
        {quote}
      </h2>
    </div>
  );
}
