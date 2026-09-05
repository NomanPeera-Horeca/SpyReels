import {
  findBriefByOriginalStoredIndex,
  normalizeStoredCarouselBriefEntries,
  type NormalizedCarouselBrief,
} from "./carouselStudio";
import type { CarouselSlideSpec } from "./carouselTemplates";

export const CAROUSEL_SLOT_REWRITE_ACTIONS = [
  "make_punchier",
  "make_shorter",
  "make_clearer",
  "rewrite",
  "alternatives",
] as const;

export type CarouselSlotRewriteAction =
  (typeof CAROUSEL_SLOT_REWRITE_ACTIONS)[number];

export function isCarouselSlotRewriteAction(
  value: unknown
): value is CarouselSlotRewriteAction {
  return (
    typeof value === "string" &&
    (CAROUSEL_SLOT_REWRITE_ACTIONS as readonly string[]).includes(value)
  );
}

export type CarouselSlotRewriteBrief = {
  topic: string;
  title: string;
  hook: string;
  corePromise: string;
  centralInsight: string;
  ctaDirection: string;
  prohibitedClaims: string[];
};

export type CarouselSlotRewriteNearbySlot = {
  slotId: string;
  role: string;
  label: string;
  text: string;
};

export type CarouselSlotRewriteContext = {
  niche: string;
  sourceUrl: string | null;
  brief: CarouselSlotRewriteBrief | null;
  slide: {
    id: string;
    role: string;
    viralWhy: string;
    semanticRole: string | null;
    family: string | null;
    index: number;
    total: number;
  };
  slot: {
    id: string;
    role: string;
    label: string;
    budget: { min: number; max: number };
    currentText: string;
  };
  nearby: {
    sameSlide: CarouselSlotRewriteNearbySlot[];
    prevHeadline: string | null;
    nextHeadline: string | null;
  };
  factsToPreserve: string[];
};

export type CarouselSlotRewriteSource = {
  niche: string;
  sourceUrl?: string | null;
  angleOptionsJson: unknown;
  selectedAngleIndex: number | null;
  slideStructure: unknown;
  slotValues: unknown;
  slideId: string;
  slotId: string;
};

export type CarouselSlotRewriteBuildResult =
  | { ok: true; context: CarouselSlotRewriteContext }
  | { ok: false; code: "INVALID_SLIDE" | "INVALID_SLOT" };

const MAX_NEARBY_CHARS = 160;
const MAX_BRIEF_FIELD = 220;
const MAX_PROHIBITED_CLAIMS = 6;

export function excerptCarouselRewriteText(
  value: string,
  max = MAX_NEARBY_CHARS
): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function extractCarouselRewriteFacts(text: string): string[] {
  const matches = text.match(/(?:\$\s*)?\d+(?:,\d{3})*(?:\.\d+)?%?/g) ?? [];
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const raw of matches) {
    const fact = raw.replace(/\s+/g, "");
    if (!fact || seen.has(fact)) continue;
    seen.add(fact);
    facts.push(fact);
  }
  return facts;
}

function clipBriefField(value: unknown): string {
  if (typeof value !== "string") return "";
  return excerptCarouselRewriteText(value, MAX_BRIEF_FIELD);
}

function briefFromUnknown(value: unknown): CarouselSlotRewriteBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const topic = clipBriefField(row.topic) || clipBriefField(row.title);
  if (!topic) return null;
  const prohibitedClaims = Array.isArray(row.prohibitedClaims)
    ? row.prohibitedClaims
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, MAX_PROHIBITED_CLAIMS)
        .map((item) => excerptCarouselRewriteText(item, 80))
    : [];
  return {
    topic,
    title: clipBriefField(row.title),
    hook: clipBriefField(row.hook),
    corePromise: clipBriefField(row.corePromise),
    centralInsight: clipBriefField(row.centralInsight),
    ctaDirection: clipBriefField(row.ctaDirection),
    prohibitedClaims,
  };
}

function briefSnippet(
  brief: NormalizedCarouselBrief | null,
  rawOptions: unknown,
  selectedIndex: number | null
): CarouselSlotRewriteBrief | null {
  if (brief) return briefFromUnknown(brief);
  if (!Array.isArray(rawOptions)) return null;
  const raw = rawOptions[selectedIndex ?? 0];
  return briefFromUnknown(raw);
}

function asSlideSpecs(raw: unknown): CarouselSlideSpec[] {
  return Array.isArray(raw) ? (raw as CarouselSlideSpec[]) : [];
}

function asSlotValues(raw: unknown): Record<string, Record<string, string>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [slideId, slots] of Object.entries(raw)) {
    if (!slots || typeof slots !== "object") continue;
    const next: Record<string, string> = {};
    for (const [slotId, value] of Object.entries(slots)) {
      if (typeof value === "string") next[slotId] = value;
    }
    out[slideId] = next;
  }
  return out;
}

function slideHeadline(
  slide: CarouselSlideSpec | undefined,
  values: Record<string, string> | undefined
): string | null {
  if (!slide || !values) return null;
  const headline =
    values.headline ??
    values.title ??
    slide.slots.find((slot) => slot.role === "headline")?.id;
  const text =
    (typeof headline === "string" && values[headline]) ||
    values.headline ||
    values.title ||
    "";
  const clipped = excerptCarouselRewriteText(text, 80);
  return clipped || null;
}

export function buildCarouselSlotRewriteContext(
  source: CarouselSlotRewriteSource
): CarouselSlotRewriteBuildResult {
  const slides = asSlideSpecs(source.slideStructure);
  const values = asSlotValues(source.slotValues);
  const slideIndex = slides.findIndex((slide) => slide.id === source.slideId);
  const slide = slides[slideIndex];
  if (!slide) return { ok: false, code: "INVALID_SLIDE" };

  const slot = slide.slots.find((item) => item.id === source.slotId);
  if (!slot) return { ok: false, code: "INVALID_SLOT" };

  const currentText = values[slide.id]?.[slot.id] ?? "";
  const entries = normalizeStoredCarouselBriefEntries(source.angleOptionsJson);
  const selectedBrief =
    source.selectedAngleIndex == null
      ? entries[0]?.brief ?? null
      : findBriefByOriginalStoredIndex(entries, source.selectedAngleIndex);

  const sameSlide = slide.slots
    .filter((item) => item.id !== slot.id)
    .map((item) => ({
      slotId: item.id,
      role: item.role,
      label: item.label,
      text: excerptCarouselRewriteText(values[slide.id]?.[item.id] ?? "", 80),
    }))
    .filter((item) => item.text.length > 0);

  return {
    ok: true,
    context: {
      niche: source.niche.trim(),
      sourceUrl: source.sourceUrl?.trim() || null,
      brief: briefSnippet(
        selectedBrief,
        source.angleOptionsJson,
        source.selectedAngleIndex
      ),
      slide: {
        id: slide.id,
        role: slide.role,
        viralWhy: excerptCarouselRewriteText(slide.viralWhy ?? "", 160),
        semanticRole: slide.composition?.semanticRole ?? null,
        family: slide.composition?.family ?? null,
        index: slideIndex,
        total: slides.length,
      },
      slot: {
        id: slot.id,
        role: slot.role,
        label: slot.label,
        budget: {
          min: slot.budget.min,
          max: slot.budget.max,
        },
        currentText,
      },
      nearby: {
        sameSlide,
        prevHeadline: slideHeadline(slides[slideIndex - 1], values[slides[slideIndex - 1]?.id]),
        nextHeadline: slideHeadline(slides[slideIndex + 1], values[slides[slideIndex + 1]?.id]),
      },
      factsToPreserve: extractCarouselRewriteFacts(currentText),
    },
  };
}

export type CarouselSlotRewriteValidation =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "too_long" | "missing_fact" };

export function validateCarouselSlotRewriteText(
  text: unknown,
  context: Pick<CarouselSlotRewriteContext, "slot" | "factsToPreserve">,
  options: { requireShorterThan?: string } = {}
): CarouselSlotRewriteValidation {
  if (typeof text !== "string") return { ok: false, reason: "empty" };
  const cleaned = text.replace(/\u2014|\u2013/g, ", ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { ok: false, reason: "empty" };
  if (cleaned.length > context.slot.budget.max) {
    return { ok: false, reason: "too_long" };
  }
  const missing = context.factsToPreserve.find(
    (fact) => !cleaned.replace(/\s+/g, "").includes(fact.replace(/\s+/g, ""))
  );
  if (missing) return { ok: false, reason: "missing_fact" };
  if (
    options.requireShorterThan &&
    cleaned.length >= options.requireShorterThan.trim().length
  ) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, text: cleaned };
}

export function validateCarouselSlotRewriteAlternatives(
  alternatives: unknown,
  context: Pick<CarouselSlotRewriteContext, "slot" | "factsToPreserve">
): { ok: true; alternatives: [string, string, string] } | { ok: false; reason: string } {
  if (!Array.isArray(alternatives) || alternatives.length !== 3) {
    return { ok: false, reason: "count" };
  }
  const validated: string[] = [];
  for (const item of alternatives) {
    const next = validateCarouselSlotRewriteText(item, context);
    if (!next.ok) return { ok: false, reason: next.reason };
    validated.push(next.text);
  }
  return {
    ok: true,
    alternatives: [validated[0], validated[1], validated[2]],
  };
}
