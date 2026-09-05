/**
 * Global carousel design override.
 *
 * Precedence (most specific wins):
 *   template design
 *   -> global designOverrideJson (this module)
 *   -> per-slot text override (carouselSlotStyle)
 *
 * Changing or resetting the global theme must not rewrite slot styles.
 * A null override means "use the template as-is" and is the Reset path.
 */
import { CAROUSEL_EDITOR_FONTS } from "./carouselSlotStyle";
import type { CarouselDesignTokens } from "./carouselTemplates";

export type StoredCarouselDesignOverride = {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  fontDisplay?: string;
  fontBody?: string;
};

export type CarouselDesignOverridePatch = {
  background?: string;
  foreground?: string;
  accent?: string;
  muted?: string;
  fontDisplay?: string | null;
  fontBody?: string | null;
};

export const CAROUSEL_DESIGN_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const ALLOWED_DESIGN_FONTS = new Set<string>(
  CAROUSEL_EDITOR_FONTS.map((font) => font.value)
);

export function isCarouselDesignHex(value: string): boolean {
  return CAROUSEL_DESIGN_HEX.test(value.trim());
}

export function isAllowedCarouselDesignFont(value: string): boolean {
  return ALLOWED_DESIGN_FONTS.has(value);
}

export function expandCarouselDesignHex(value: string): string | null {
  const raw = value.trim();
  if (!CAROUSEL_DESIGN_HEX.test(raw)) return null;
  if (raw.length === 7) return raw;
  const r = raw[1];
  const g = raw[2];
  const b = raw[3];
  if (!r || !g || !b) return null;
  return `#${r}${r}${g}${g}${b}${b}`;
}

export function normalizeCarouselDesignColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return isCarouselDesignHex(value) ? value : null;
}

export function normalizeCarouselDesignFont(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return isAllowedCarouselDesignFont(value) ? value : null;
}

export function normalizeCarouselDesignOverride(
  raw: unknown
): StoredCarouselDesignOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const background = normalizeCarouselDesignColor(input.background);
  const foreground = normalizeCarouselDesignColor(input.foreground);
  const accent = normalizeCarouselDesignColor(input.accent);
  const muted = normalizeCarouselDesignColor(input.muted);
  if (!background || !foreground || !accent || !muted) return null;

  const next: StoredCarouselDesignOverride = {
    background,
    foreground,
    accent,
    muted,
  };

  if (input.fontDisplay != null && String(input.fontDisplay).trim()) {
    const fontDisplay = normalizeCarouselDesignFont(input.fontDisplay);
    if (!fontDisplay) return null;
    next.fontDisplay = fontDisplay;
  }
  if (input.fontBody != null && String(input.fontBody).trim()) {
    const fontBody = normalizeCarouselDesignFont(input.fontBody);
    if (!fontBody) return null;
    next.fontBody = fontBody;
  }
  return next;
}

export function applyCarouselDesignPatch(
  current: StoredCarouselDesignOverride | null,
  template: Pick<CarouselDesignTokens, "colors" | "fontFamily">,
  patch: CarouselDesignOverridePatch
): StoredCarouselDesignOverride | null {
  const next: StoredCarouselDesignOverride = {
    background: current?.background ?? template.colors.background,
    foreground: current?.foreground ?? template.colors.foreground,
    accent: current?.accent ?? template.colors.accent,
    muted: current?.muted ?? template.colors.muted,
  };
  if (current?.fontDisplay) next.fontDisplay = current.fontDisplay;
  if (current?.fontBody) next.fontBody = current.fontBody;

  if (patch.background !== undefined) {
    const color = normalizeCarouselDesignColor(patch.background);
    if (!color) return null;
    next.background = color;
  }
  if (patch.foreground !== undefined) {
    const color = normalizeCarouselDesignColor(patch.foreground);
    if (!color) return null;
    next.foreground = color;
  }
  if (patch.accent !== undefined) {
    const color = normalizeCarouselDesignColor(patch.accent);
    if (!color) return null;
    next.accent = color;
  }
  if (patch.muted !== undefined) {
    const color = normalizeCarouselDesignColor(patch.muted);
    if (!color) return null;
    next.muted = color;
  }
  if (patch.fontDisplay !== undefined) {
    if (!patch.fontDisplay) delete next.fontDisplay;
    else {
      const font = normalizeCarouselDesignFont(patch.fontDisplay);
      if (!font) return null;
      next.fontDisplay = font;
    }
  }
  if (patch.fontBody !== undefined) {
    if (!patch.fontBody) delete next.fontBody;
    else {
      const font = normalizeCarouselDesignFont(patch.fontBody);
      if (!font) return null;
      next.fontBody = font;
    }
  }
  return normalizeCarouselDesignOverride(next);
}

export function storedDesignToTokenOverride(
  stored: StoredCarouselDesignOverride | null | undefined,
  aspectRatioOverride: string | null | undefined
): Partial<CarouselDesignTokens> | undefined {
  if (!stored && !aspectRatioOverride) return undefined;
  const override: Partial<CarouselDesignTokens> = {};
  if (stored) {
    override.colors = {
      background: stored.background,
      foreground: stored.foreground,
      accent: stored.accent,
      muted: stored.muted,
    };
    const fontFamily: CarouselDesignTokens["fontFamily"] = {
      display: stored.fontDisplay ?? "",
      body: stored.fontBody ?? "",
    };
    if (stored.fontDisplay || stored.fontBody) {
      override.fontFamily = fontFamily;
    }
  }
  if (
    aspectRatioOverride === "4:5" ||
    aspectRatioOverride === "1:1" ||
    aspectRatioOverride === "9:16"
  ) {
    override.aspectRatio = aspectRatioOverride;
  }
  return override;
}

export function mergeCarouselDesignTokens(
  template: CarouselDesignTokens,
  override?: Partial<CarouselDesignTokens> | null
): CarouselDesignTokens {
  if (!override) return template;
  return {
    ...template,
    ...override,
    colors: {
      ...template.colors,
      ...(override.colors ?? {}),
    },
    fontFamily: {
      display:
        override.fontFamily?.display?.trim() || template.fontFamily.display,
      body: override.fontFamily?.body?.trim() || template.fontFamily.body,
    },
    aspectRatio: override.aspectRatio ?? template.aspectRatio,
    decoration: override.decoration ?? template.decoration,
    radiusPx: override.radiusPx ?? template.radiusPx,
    textAlign: override.textAlign ?? template.textAlign,
    backgroundPattern: override.backgroundPattern ?? template.backgroundPattern,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const expanded = expandCarouselDesignHex(hex);
  if (!expanded) return null;
  const r = Number.parseInt(expanded.slice(1, 3), 16);
  const g = Number.parseInt(expanded.slice(3, 5), 16);
  const b = Number.parseInt(expanded.slice(5, 7), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b };
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (value: number) => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

export function carouselDesignContrastRatio(
  background: string,
  foreground: string
): number | null {
  const a = relativeLuminance(background);
  const b = relativeLuminance(foreground);
  if (a == null || b == null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when Text vs Background is obviously hard to read. Does not rewrite colors. */
export function carouselDesignContrastWarning(
  background: string,
  foreground: string
): boolean {
  const ratio = carouselDesignContrastRatio(background, foreground);
  return ratio != null && ratio < 3;
}
