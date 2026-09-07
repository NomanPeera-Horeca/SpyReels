/**
 * Single source-of-truth for Carousel Studio paste detection.
 * Do not add a second URL regex elsewhere for this flow.
 */

export const CAROUSEL_DETECTED_SOURCE_KINDS = [
  "idea",
  "youtube",
  "article",
  "instagram",
  "linkedin",
  "carousel",
] as const;

export type CarouselDetectedSourceKind =
  (typeof CAROUSEL_DETECTED_SOURCE_KINDS)[number];

export type CarouselDetectedSource = {
  kind: CarouselDetectedSourceKind;
  chipLabel: string | null;
  displayLabel: string;
};

const IDEA_SOURCE: CarouselDetectedSource = {
  kind: "idea",
  chipLabel: null,
  displayLabel: "Based on your idea",
};

/** Normalize a pasted carousel URL. www. hosts get https. */
export function normalizeCarouselSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** True when the trimmed input should be resolved as a URL, not a freeform idea. */
export function looksLikeCarouselSourceUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^www\./i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hostnameAndPath(raw: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(normalizeCarouselSourceUrl(raw));
    return {
      host: parsed.hostname.toLowerCase(),
      path: parsed.pathname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function hostMatches(host: string, needle: string): boolean {
  return host === needle || host.endsWith(`.${needle}`);
}

/**
 * Classify pasted studio input. URL hosts are classified once here.
 * Non-URL text is always `idea`.
 */
export function detectCarouselSource(raw: string): CarouselDetectedSource {
  const trimmed = raw.trim();
  if (!trimmed || !looksLikeCarouselSourceUrl(trimmed)) {
    return IDEA_SOURCE;
  }

  const parsed = hostnameAndPath(trimmed);
  if (!parsed) return IDEA_SOURCE;

  const { host, path } = parsed;

  if (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")) {
    return {
      kind: "youtube",
      chipLabel: "YouTube video detected",
      displayLabel: "YouTube video",
    };
  }

  if (hostMatches(host, "linkedin.com")) {
    return {
      kind: "linkedin",
      chipLabel: "LinkedIn post detected",
      displayLabel: "LinkedIn post",
    };
  }

  if (hostMatches(host, "instagram.com") || hostMatches(host, "instagr.am")) {
    if (path.includes("/p/")) {
      return {
        kind: "carousel",
        chipLabel: "Existing carousel detected",
        displayLabel: "Existing carousel",
      };
    }
    return {
      kind: "instagram",
      chipLabel: "Instagram post detected",
      displayLabel: "Instagram post",
    };
  }

  return {
    kind: "article",
    chipLabel: "Article or webpage detected",
    displayLabel: "Article or webpage",
  };
}
