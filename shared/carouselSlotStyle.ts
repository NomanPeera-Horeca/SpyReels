/** Per-slot typography overrides. Missing keys mean "use the layout default". */

export type CarouselSlotTextAlign = "left" | "center" | "right";

export type CarouselSlotStyleOverride = {
  fontFamily?: string;
  fontSizePx?: number;
  fontWeight?: number;
  textAlign?: CarouselSlotTextAlign;
  color?: string;
};

export type CarouselSlotStyleMap = Record<
  string,
  Record<string, CarouselSlotStyleOverride>
>;

export type CarouselSlotStylePatch = {
  fontFamily?: string | null;
  fontSizePx?: number | null;
  fontWeight?: number | null;
  textAlign?: CarouselSlotTextAlign | null;
  color?: string | null;
};

export const CAROUSEL_EDITOR_FONTS = [
  { id: "fraunces", label: "Fraunces", value: '"Fraunces", Georgia, serif' },
  { id: "dm-sans", label: "DM Sans", value: '"DM Sans", system-ui, sans-serif' },
  { id: "inter", label: "Inter", value: "Inter, system-ui, sans-serif" },
  { id: "georgia", label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
] as const;

export const CAROUSEL_EDITOR_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

export const CAROUSEL_EDITOR_FONT_SIZE_MIN = 12;
export const CAROUSEL_EDITOR_FONT_SIZE_MAX = 56;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function inferCarouselSlotRole(slotId: string): string {
  const id = slotId.trim().toLowerCase();
  if (id.includes("cta")) return "cta";
  if (
    id === "kicker" ||
    id.includes("kicker") ||
    id.includes("eyebrow") ||
    id === "label" ||
    id.endsWith("_label")
  ) {
    return "kicker";
  }
  if (id.includes("quote")) return "quote";
  if (id.includes("subtitle") || id.includes("subhead") || id === "dek") {
    return "subtitle";
  }
  if (
    id === "headline" ||
    id === "title" ||
    id === "hook" ||
    id.includes("headline") ||
    id.includes("title")
  ) {
    return "headline";
  }
  if (
    id.includes("body") ||
    id.includes("support") ||
    id.includes("caption") ||
    id.includes("point") ||
    id.includes("item")
  ) {
    return "body";
  }
  return "text";
}

export function normalizeCarouselSlotStyle(
  raw: unknown
): CarouselSlotStyleOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const next: CarouselSlotStyleOverride = {};

  if (typeof input.fontFamily === "string" && input.fontFamily.trim()) {
    const allowed = CAROUSEL_EDITOR_FONTS.some(
      (font) => font.value === input.fontFamily
    );
    if (allowed) next.fontFamily = input.fontFamily;
  }

  if (typeof input.fontSizePx === "number" && Number.isFinite(input.fontSizePx)) {
    const size = Math.round(input.fontSizePx);
    if (
      size >= CAROUSEL_EDITOR_FONT_SIZE_MIN &&
      size <= CAROUSEL_EDITOR_FONT_SIZE_MAX
    ) {
      next.fontSizePx = size;
    }
  }

  if (typeof input.fontWeight === "number" && Number.isFinite(input.fontWeight)) {
    const weight = Math.round(input.fontWeight);
    if (
      (CAROUSEL_EDITOR_FONT_WEIGHTS as readonly number[]).includes(weight)
    ) {
      next.fontWeight = weight;
    }
  }

  if (
    input.textAlign === "left" ||
    input.textAlign === "center" ||
    input.textAlign === "right"
  ) {
    next.textAlign = input.textAlign;
  }

  if (typeof input.color === "string" && HEX_COLOR.test(input.color.trim())) {
    next.color = input.color.trim();
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function normalizeCarouselSlotStyleMap(
  raw: unknown
): CarouselSlotStyleMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CarouselSlotStyleMap = {};
  for (const [slideId, slots] of Object.entries(raw as Record<string, unknown>)) {
    if (!slideId || !slots || typeof slots !== "object" || Array.isArray(slots)) {
      continue;
    }
    const slide: Record<string, CarouselSlotStyleOverride> = {};
    for (const [slotId, style] of Object.entries(slots as Record<string, unknown>)) {
      const normalized = normalizeCarouselSlotStyle(style);
      if (normalized) slide[slotId] = normalized;
    }
    if (Object.keys(slide).length > 0) out[slideId] = slide;
  }
  return out;
}

export function mergeCarouselSlotStyle(
  current: CarouselSlotStyleOverride | undefined,
  patch: CarouselSlotStylePatch
): CarouselSlotStyleOverride | null {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") delete next[key];
    else next[key] = value;
  }
  return normalizeCarouselSlotStyle(next);
}

export function applyCarouselSlotStyleOverride(
  base: Record<string, unknown> | undefined,
  override: CarouselSlotStyleOverride | undefined
): Record<string, unknown> {
  if (!override) return { ...(base ?? {}) };
  return {
    ...(base ?? {}),
    ...(override.fontFamily ? { fontFamily: override.fontFamily } : {}),
    ...(override.fontSizePx ? { fontSize: override.fontSizePx } : {}),
    ...(override.fontWeight ? { fontWeight: override.fontWeight } : {}),
    ...(override.textAlign ? { textAlign: override.textAlign } : {}),
    ...(override.color ? { color: override.color } : {}),
  };
}

export function upsertCarouselSlotStyleMap(
  current: CarouselSlotStyleMap,
  slideId: string,
  slotId: string,
  patch: CarouselSlotStylePatch
): CarouselSlotStyleMap {
  const slide = { ...(current[slideId] ?? {}) };
  const merged = mergeCarouselSlotStyle(slide[slotId], patch);
  if (merged) {
    slide[slotId] = merged;
  } else {
    delete slide[slotId];
  }
  const next = { ...current };
  if (Object.keys(slide).length > 0) next[slideId] = slide;
  else delete next[slideId];
  return next;
}
