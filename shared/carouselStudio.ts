/**
 * Shared Carousel Studio types (backend + frontend).
 * Phase 2: angles persist on carousel_remakes, then the existing remake worker writes slides.
 */

/** One strategic direction proposed before full slide generation. */
export type CarouselAngleOption = {
  /** Category label, e.g. Contrarian, Framework, Story. */
  kicker: string;
  /** Short hook-style title for the direction. */
  title: string;
  /** One-sentence description of the strategic approach. */
  description: string;
  /** Suggested slide count for this direction (not full slide content). */
  estimatedSlideCount: number;
};

export const CAROUSEL_CONTENT_GOALS = [
  "saves",
  "shares",
  "authority",
  "education",
  "conversion",
  "engagement",
] as const;
export type CarouselContentGoal = (typeof CAROUSEL_CONTENT_GOALS)[number];

export const CAROUSEL_CONTENT_FORMATS = [
  "framework",
  "comparison",
  "story",
  "roadmap",
  "breakdown",
] as const;
export type CarouselContentFormat = (typeof CAROUSEL_CONTENT_FORMATS)[number];

export const CAROUSEL_ANGLE_TYPES = [
  "contrarian",
  "how_to",
  "mistakes",
  "myth_busting",
  "story",
  "checklist",
  "diagnostic",
] as const;
export type CarouselAngleType = (typeof CAROUSEL_ANGLE_TYPES)[number];

export const CAROUSEL_SLIDE_ROLES = [
  "hook",
  "context",
  "problem",
  "insight",
  "example",
  "comparison",
  "framework",
  "takeaway",
  "cta",
] as const;
export type CarouselSlideRole = (typeof CAROUSEL_SLIDE_ROLES)[number];

export const CAROUSEL_RECOMMENDED_VISUALS = [
  "text",
  "photo",
  "comparison",
  "timeline",
  "diagram",
  "checklist",
  "data",
] as const;
export type CarouselRecommendedVisual =
  (typeof CAROUSEL_RECOMMENDED_VISUALS)[number];

export const CAROUSEL_CLAIM_RISKS = ["low", "medium", "high"] as const;
export type CarouselClaimRisk = (typeof CAROUSEL_CLAIM_RISKS)[number];

export const CAROUSEL_RESEARCH_MODES = [
  "none",
  "claim_verification",
  "research_required",
] as const;
export type CarouselResearchMode = (typeof CAROUSEL_RESEARCH_MODES)[number];

export const CAROUSEL_LAYOUT_FAMILIES = [
  "framework",
  "comparison",
  "story",
  "roadmap",
  "breakdown",
] as const;
export type CarouselLayoutFamily = (typeof CAROUSEL_LAYOUT_FAMILIES)[number];

export const CAROUSEL_BRIEF_SCORE_WEIGHTS = {
  relevance: 0.24,
  usefulness: 0.2,
  specificity: 0.16,
  visualPotential: 0.14,
  factualSafety: 0.16,
  originality: 0.1,
} as const;

export const CAROUSEL_BRIEF_KEY_POINTS_MIN = 4;
export const CAROUSEL_BRIEF_KEY_POINTS_MAX = 8;
export const CAROUSEL_BRIEF_EVIDENCE_MAX = 5;
export const CAROUSEL_BRIEF_PROHIBITED_MAX = 5;

/** Server-assigned modern creative-brief version. LLM must not provide this. */
export const CAROUSEL_CREATIVE_BRIEF_VERSION = 2 as const;
export type CarouselCreativeBriefVersion = typeof CAROUSEL_CREATIVE_BRIEF_VERSION;

export type CarouselCreativeBriefScores = {
  relevance: number;
  usefulness: number;
  specificity: number;
  visualPotential: number;
  factualSafety: number;
  originality: number;
  overall: number;
};

export type CarouselCreativeBriefKeyPoint = {
  title: string;
  explanation: string;
  purpose: string;
};

export type CarouselCreativeBriefSlideOutlineItem = {
  position: number;
  role: CarouselSlideRole;
  objective: string;
  recommendedVisual: CarouselRecommendedVisual;
};

type CarouselCreativeBriefBody = {
  id: string;
  kicker: string;
  title: string;
  description: string;
  estimatedSlideCount: number;
  topic: string;
  inferredAudience: string;
  audienceReasoning: string;
  contentGoal: CarouselContentGoal;
  contentFormat: CarouselContentFormat;
  angleType: CarouselAngleType;
  hook: string;
  corePromise: string;
  centralInsight: string;
  keyPoints: CarouselCreativeBriefKeyPoint[];
  slideOutline: CarouselCreativeBriefSlideOutlineItem[];
  layoutFamily: CarouselLayoutFamily;
  visualDirection: string;
  imageDirection: string;
  claimRisk: CarouselClaimRisk;
  researchMode: CarouselResearchMode;
  evidenceRequirements: string[];
  prohibitedClaims: string[];
  ctaDirection: string;
  scores: CarouselCreativeBriefScores;
  confidence: number;
};

/** Modern brief. schemaVersion is assigned server-side after LLM normalize. */
export type CarouselCreativeBrief = CarouselCreativeBriefBody & {
  schemaVersion: CarouselCreativeBriefVersion;
  isLegacy: false;
};

/** In-memory historic four-field angle. Stored JSON has no schemaVersion. */
export type LegacyNormalizedCarouselBrief = CarouselCreativeBriefBody & {
  schemaVersion: 1;
  isLegacy: true;
};

export type NormalizedCarouselBrief =
  | LegacyNormalizedCarouselBrief
  | CarouselCreativeBrief;

/**
 * Stored angleOptionsJson: historic four-field angles and/or modern schemaVersion 2
 * briefs. Always pass through normalizeStoredCarouselBriefs before use.
 */
export type CarouselStoredAngleOptionsJson = Array<
  CarouselAngleOption | CarouselCreativeBrief
>;

export const CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE =
  "The creative brief controls strategy, order and emphasis. It is not itself a factual source. Do not turn planning assumptions into factual claims.";

export type CreativeBriefSelectionTelemetry = {
  candidateIds: string[];
  candidates: Array<{
    id: string;
    contentFormat: CarouselContentFormat;
    layoutFamily: CarouselLayoutFamily;
    scores: CarouselCreativeBriefScores;
    researchMode: CarouselResearchMode;
    claimRisk: CarouselClaimRisk;
  }>;
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number | null;
  selection: "recommended" | "manual" | "unselected";
};

export type ReviewPlanCardModel = {
  index: number;
  brief: NormalizedCarouselBrief;
  isRecommended: boolean;
  isSelected: boolean;
  isLegacy: boolean;
  researchLabel: string;
  keyPointTitles: string[];
  structureSummary: string;
  plannedLayoutFamily: string;
};

export type StudioSelectionViewState = {
  recommendedBriefIndex: number | null;
  selectedIndex: number | null;
};

export const CAROUSEL_STUDIO_ANGLE_COUNT = 3;

export const CAROUSEL_STUDIO_MIN_SLIDES = 5;
export const CAROUSEL_STUDIO_MAX_SLIDES = 12;

/** Total slides the remake worker will generate from an angle estimate (hook + middles + CTA). */
export function studioPlannedSlideCount(estimatedSlideCount: number): number {
  const middle = Math.min(Math.max(estimatedSlideCount - 2, 3), 18);
  return middle + 2;
}

/** Same photo-led template as content-to-carousel "photo" style. */
export const CAROUSEL_STUDIO_TEMPLATE_ID = "photo_story_test";

export type CarouselStudioSourceType = "prompt" | "web" | "youtube";

export const CAROUSEL_REMAKE_PROGRESS_STAGES = [
  "writing_copy",
  "generating_images",
  "saving",
] as const;

export type CarouselRemakeProgressStage =
  (typeof CAROUSEL_REMAKE_PROGRESS_STAGES)[number];

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

export function normalizeCarouselSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** Neutral remake-niche placeholder when Studio has no explicit audience/pillar override. */
export const STUDIO_INFER_FROM_SOURCE_NICHE = "infer from source";

/**
 * Studio niche override for generateAngles / generateFromInput.
 * Saved creator niche and untouched Customize fields are never submitted.
 * Closed Customize always means no override.
 */
export function buildStudioNicheOverride(args: {
  customizeOpen: boolean;
  audienceEdited: boolean;
  pillarEdited: boolean;
  audience: string;
  pillar: string;
}): string | undefined {
  if (!args.customizeOpen) return undefined;
  const audience = args.audienceEdited ? args.audience.trim() : "";
  const pillar = args.pillarEdited ? args.pillar.trim() : "";
  if (audience && pillar) return `${audience} · ${pillar}`;
  if (audience) return audience;
  if (pillar) return pillar;
  return undefined;
}

/** First line of the typed idea / extracted source, never a saved profile niche. */
export function inferStudioNicheFromSource(sourceContent: string): string {
  const firstLine =
    sourceContent
      .trim()
      .split(/\n/)[0]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
  if (!firstLine) return STUDIO_INFER_FROM_SOURCE_NICHE;
  return firstLine.slice(0, 200);
}

/**
 * Studio-only niche resolution. Does not fall back to the saved creator profile.
 * Explicit Customize override wins; otherwise infer from source content.
 */
export function resolveStudioCarouselNiche(
  provided: string | undefined,
  sourceContent: string
): string {
  const override = provided?.trim() ?? "";
  if (override.length > 0) return override;
  return inferStudioNicheFromSource(sourceContent);
}

/** Studio editor slide (headline/body + optional photo from the remake image chain). */
export type CarouselStudioSlide = {
  title: string;
  body: string;
  imageUrl?: string | null;
};

function firstUrlFromSlideEntry(
  value: string | Record<string, string> | undefined | null
): string | null {
  if (!value) return null;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "object") {
    for (const slotUrl of Object.values(value)) {
      if (typeof slotUrl === "string" && slotUrl.length > 0) return slotUrl;
    }
  }
  return null;
}

function pickSlideTitle(slots: Record<string, string>): string {
  const headline = slots.headline?.trim() || "";
  if (headline) return headline;
  const title = slots.title?.trim() || "";
  if (title) return title;
  return slots.kicker?.trim() || "";
}

function slideIdsFromStructure(slideStructure: unknown): string[] {
  if (!Array.isArray(slideStructure)) return [];
  const ids: string[] = [];
  for (const slide of slideStructure) {
    if (!slide || typeof slide !== "object") continue;
    const id = (slide as { id?: unknown }).id;
    if (typeof id === "string" && id) ids.push(id);
  }
  return ids;
}

function slotMapForSlide(
  slotValues: unknown,
  slideId: string
): Record<string, string> | undefined {
  if (!slotValues || typeof slotValues !== "object" || Array.isArray(slotValues)) {
    return undefined;
  }
  const slide = (slotValues as Record<string, unknown>)[slideId];
  if (!slide || typeof slide !== "object" || Array.isArray(slide)) return undefined;
  return slide as Record<string, string>;
}

/**
 * Library card title + slide count from persisted remake JSON.
 * Title prefers first-slide headline, then title, then kicker, then niche.
 */
export function deriveCarouselLibraryMeta(args: {
  slotValues?: unknown;
  slideStructure: unknown;
  niche?: string | null;
}): { title: string; slideCount: number } {
  const ids = slideIdsFromStructure(args.slideStructure);
  const firstSlots = ids[0] ? slotMapForSlide(args.slotValues, ids[0]) : undefined;
  const fromSlots = firstSlots ? pickSlideTitle(firstSlots) : "";
  const niche = typeof args.niche === "string" ? args.niche.trim() : "";
  return {
    title: fromSlots || niche || "Untitled carousel",
    slideCount: ids.length,
  };
}

function pickSlideBody(slots: Record<string, string>, title: string): string {
  const parts = [slots.body, slots.subhead, slots.cta_label]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0 && value !== title);
  return parts.join("\n\n");
}

/** Map remake slotValues + slideStructure + imageUrls into studio title/body slides. */
export function mapRemakeToStudioSlides(args: {
  slotValues: Record<string, Record<string, string>> | null | undefined;
  slideStructure: unknown;
  imageUrls: unknown;
}): CarouselStudioSlide[] {
  const slotValues = args.slotValues ?? {};
  const imageMap =
    args.imageUrls && typeof args.imageUrls === "object"
      ? (args.imageUrls as Record<string, string | Record<string, string>>)
      : {};

  const ids: string[] = [];
  if (Array.isArray(args.slideStructure)) {
    for (const slide of args.slideStructure) {
      if (!slide || typeof slide !== "object") continue;
      const id = (slide as { id?: unknown }).id;
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  if (ids.length === 0) {
    ids.push(...Object.keys(slotValues));
  }

  const slides: CarouselStudioSlide[] = [];
  for (const id of ids) {
    const slots = slotValues[id] ?? {};
    const title = pickSlideTitle(slots);
    const body = pickSlideBody(slots, title);
    if (!title && !body) continue;
    slides.push({
      title: title || "Untitled slide",
      body,
      imageUrl: firstUrlFromSlideEntry(imageMap[id]),
    });
  }
  return slides;
}

function includesUnion<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const raw = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

export function clampCarouselBriefScore(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function clampCarouselBriefConfidence(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function scoreCarouselCreativeBrief(input: {
  relevance?: unknown;
  usefulness?: unknown;
  specificity?: unknown;
  visualPotential?: unknown;
  factualSafety?: unknown;
  originality?: unknown;
}): CarouselCreativeBriefScores {
  const relevance = clampCarouselBriefScore(input.relevance);
  const usefulness = clampCarouselBriefScore(input.usefulness);
  const specificity = clampCarouselBriefScore(input.specificity);
  const visualPotential = clampCarouselBriefScore(input.visualPotential);
  const factualSafety = clampCarouselBriefScore(input.factualSafety);
  const originality = clampCarouselBriefScore(input.originality);
  const overall = clampCarouselBriefScore(
    relevance * CAROUSEL_BRIEF_SCORE_WEIGHTS.relevance +
      usefulness * CAROUSEL_BRIEF_SCORE_WEIGHTS.usefulness +
      specificity * CAROUSEL_BRIEF_SCORE_WEIGHTS.specificity +
      visualPotential * CAROUSEL_BRIEF_SCORE_WEIGHTS.visualPotential +
      factualSafety * CAROUSEL_BRIEF_SCORE_WEIGHTS.factualSafety +
      originality * CAROUSEL_BRIEF_SCORE_WEIGHTS.originality
  );
  return {
    relevance,
    usefulness,
    specificity,
    visualPotential,
    factualSafety,
    originality,
    overall,
  };
}

export function selectRecommendedCreativeBrief(
  briefs: NormalizedCarouselBrief[]
): { index: number | null; brief: NormalizedCarouselBrief | null } {
  if (briefs.length === 0) return { index: null, brief: null };
  let bestIndex = 0;
  for (let i = 1; i < briefs.length; i++) {
    if (compareCreativeBriefRecommendation(briefs[i]!, briefs[bestIndex]!, i, bestIndex) < 0) {
      bestIndex = i;
    }
  }
  return { index: bestIndex, brief: briefs[bestIndex] ?? null };
}

/** Rank briefs with the same comparison used to pick the recommended plan. */
export function rankCarouselCreativeBriefs<T extends NormalizedCarouselBrief>(
  briefs: T[]
): T[] {
  return briefs
    .map((brief, index) => ({ brief, index }))
    .sort((a, b) =>
      compareCreativeBriefRecommendation(a.brief, b.brief, a.index, b.index)
    )
    .map((entry) => entry.brief);
}

function compareCreativeBriefRecommendation(
  a: NormalizedCarouselBrief,
  b: NormalizedCarouselBrief,
  aIndex: number,
  bIndex: number
): number {
  if (a.scores.overall !== b.scores.overall) {
    return b.scores.overall - a.scores.overall;
  }
  if (a.scores.factualSafety !== b.scores.factualSafety) {
    return b.scores.factualSafety - a.scores.factualSafety;
  }
  if (a.scores.usefulness !== b.scores.usefulness) {
    return b.scores.usefulness - a.scores.usefulness;
  }
  if (a.scores.relevance !== b.scores.relevance) {
    return b.scores.relevance - a.scores.relevance;
  }
  return aIndex - bIndex;
}

function trimSentence(value: unknown, maxLen = 240): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function trimStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = trimSentence(item, 160);
    if (!text) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseKeyPoints(
  value: unknown
): CarouselCreativeBriefKeyPoint[] {
  if (!Array.isArray(value)) return [];
  const out: CarouselCreativeBriefKeyPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = trimSentence(row.title, 80);
    const explanation = trimSentence(row.explanation, 240);
    const purpose = trimSentence(row.purpose, 120);
    if (!title || !explanation || !purpose) continue;
    out.push({ title, explanation, purpose });
    if (out.length >= CAROUSEL_BRIEF_KEY_POINTS_MAX) break;
  }
  return out;
}

function parseSlideOutline(
  value: unknown,
  expectedCount: number
): CarouselCreativeBriefSlideOutlineItem[] {
  if (!Array.isArray(value)) return [];
  const out: CarouselCreativeBriefSlideOutlineItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = includesUnion(CAROUSEL_SLIDE_ROLES, row.role)
      ? row.role
      : null;
    const objective = trimSentence(row.objective, 240);
    const recommendedVisual = includesUnion(
      CAROUSEL_RECOMMENDED_VISUALS,
      row.recommendedVisual
    )
      ? row.recommendedVisual
      : null;
    if (!role || !objective || !recommendedVisual) continue;
    out.push({
      position: out.length + 1,
      role,
      objective,
      recommendedVisual,
    });
    if (out.length >= expectedCount) break;
  }
  return out;
}

function parseScores(value: unknown): CarouselCreativeBriefScores {
  const row =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return scoreCarouselCreativeBrief(row);
}

const MODERN_PLANNING_STRING_KEYS = [
  "topic",
  "inferredAudience",
  "audienceReasoning",
  "contentGoal",
  "contentFormat",
  "angleType",
  "hook",
  "corePromise",
  "centralInsight",
  "layoutFamily",
  "visualDirection",
  "imageDirection",
  "claimRisk",
  "researchMode",
  "ctaDirection",
] as const;

const MODERN_PLANNING_ARRAY_KEYS = [
  "keyPoints",
  "slideOutline",
  "evidenceRequirements",
  "prohibitedClaims",
] as const;

function hasMeaningfulModernPlanningFields(row: Record<string, unknown>): boolean {
  for (const key of MODERN_PLANNING_STRING_KEYS) {
    if (typeof row[key] === "string" && row[key].trim().length > 0) return true;
  }
  for (const key of MODERN_PLANNING_ARRAY_KEYS) {
    if (Array.isArray(row[key]) && row[key].length > 0) return true;
  }
  if (row.scores && typeof row.scores === "object") return true;
  if (typeof row.confidence === "number") return true;
  return false;
}

function hasValidHistoricFourFields(row: Record<string, unknown>): boolean {
  const kicker = typeof row.kicker === "string" ? row.kicker.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const description =
    typeof row.description === "string" ? row.description.trim() : "";
  if (!kicker || !title || !description) return false;
  return (
    typeof row.estimatedSlideCount === "number" &&
    Number.isFinite(row.estimatedSlideCount)
  );
}

/** Historic stored four-field only. Never uses content-field placeholders. */
export function isHistoricFourFieldAngle(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion === CAROUSEL_CREATIVE_BRIEF_VERSION) return false;
  if (row.schemaVersion === 1 && row.isLegacy === true) return false;
  if (hasMeaningfulModernPlanningFields(row)) return false;
  return hasValidHistoricFourFields(row);
}

export function isLegacyCreativeBrief(
  brief: NormalizedCarouselBrief
): brief is LegacyNormalizedCarouselBrief {
  return brief.schemaVersion === 1 && brief.isLegacy === true;
}

export function assignCarouselBriefId(index: number): string {
  return `brief_${index + 1}`;
}

function legacyCreativeBriefFromAngle(
  angle: CarouselAngleOption,
  index: number
): LegacyNormalizedCarouselBrief {
  const estimatedSlideCount = clampInt(
    angle.estimatedSlideCount,
    CAROUSEL_STUDIO_MIN_SLIDES,
    CAROUSEL_STUDIO_MAX_SLIDES,
    8
  );
  return {
    schemaVersion: 1,
    isLegacy: true,
    id: assignCarouselBriefId(index),
    kicker: angle.kicker,
    title: angle.title,
    description: angle.description,
    estimatedSlideCount,
    topic: angle.title,
    inferredAudience: "",
    audienceReasoning: "",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "how_to",
    hook: angle.title,
    corePromise: angle.description,
    centralInsight: angle.description,
    keyPoints: [],
    slideOutline: [],
    layoutFamily: "breakdown",
    visualDirection: "",
    imageDirection: "",
    claimRisk: "medium",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: [],
    ctaDirection: "",
    scores: scoreCarouselCreativeBrief({}),
    confidence: 0,
  };
}

function parseLegacyAngle(value: unknown): CarouselAngleOption | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const kicker = trimSentence(row.kicker, 80);
  const title = trimSentence(row.title, 120);
  const description = trimSentence(row.description, 240);
  if (!kicker || !title || !description) return null;
  return {
    kicker,
    title,
    description,
    estimatedSlideCount: clampInt(
      row.estimatedSlideCount,
      CAROUSEL_STUDIO_MIN_SLIDES,
      CAROUSEL_STUDIO_MAX_SLIDES,
      8
    ),
  };
}

/**
 * Strict LLM-path normalize. Returns null when required planning is missing
 * or slideOutline length does not match estimatedSlideCount.
 */
export function normalizeGeneratedCarouselBrief(
  value: unknown,
  index: number
): CarouselCreativeBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kicker = trimSentence(row.kicker, 80);
  const title = trimSentence(row.title, 120);
  const description = trimSentence(row.description, 240);
  const topic = trimSentence(row.topic, 120);
  const inferredAudience = trimSentence(row.inferredAudience, 120);
  const audienceReasoning = trimSentence(row.audienceReasoning, 240);
  const hook = trimSentence(row.hook, 160);
  const corePromise = trimSentence(row.corePromise, 240);
  const centralInsight = trimSentence(row.centralInsight, 240);
  const visualDirection = trimSentence(row.visualDirection, 240);
  const imageDirection = trimSentence(row.imageDirection, 240);
  const ctaDirection = trimSentence(row.ctaDirection, 160);
  if (
    !kicker ||
    !title ||
    !description ||
    !topic ||
    !inferredAudience ||
    !audienceReasoning ||
    !hook ||
    !corePromise ||
    !centralInsight ||
    !visualDirection ||
    !imageDirection ||
    !ctaDirection
  ) {
    return null;
  }
  if (!includesUnion(CAROUSEL_CONTENT_GOALS, row.contentGoal)) return null;
  if (!includesUnion(CAROUSEL_CONTENT_FORMATS, row.contentFormat)) return null;
  if (!includesUnion(CAROUSEL_ANGLE_TYPES, row.angleType)) return null;
  if (!includesUnion(CAROUSEL_LAYOUT_FAMILIES, row.layoutFamily)) return null;
  if (row.contentFormat !== row.layoutFamily) return null;
  if (!includesUnion(CAROUSEL_CLAIM_RISKS, row.claimRisk)) return null;
  if (!includesUnion(CAROUSEL_RESEARCH_MODES, row.researchMode)) return null;

  const estimatedSlideCount = clampInt(
    row.estimatedSlideCount,
    CAROUSEL_STUDIO_MIN_SLIDES,
    CAROUSEL_STUDIO_MAX_SLIDES,
    0
  );
  if (
    estimatedSlideCount < CAROUSEL_STUDIO_MIN_SLIDES ||
    estimatedSlideCount > CAROUSEL_STUDIO_MAX_SLIDES
  ) {
    return null;
  }

  const keyPoints = parseKeyPoints(row.keyPoints);
  if (
    keyPoints.length < CAROUSEL_BRIEF_KEY_POINTS_MIN ||
    keyPoints.length > CAROUSEL_BRIEF_KEY_POINTS_MAX
  ) {
    return null;
  }

  const slideOutline = parseSlideOutline(row.slideOutline, estimatedSlideCount);
  if (slideOutline.length !== estimatedSlideCount) return null;

  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: assignCarouselBriefId(index),
    kicker,
    title,
    description,
    estimatedSlideCount,
    topic,
    inferredAudience,
    audienceReasoning,
    contentGoal: row.contentGoal,
    contentFormat: row.contentFormat,
    angleType: row.angleType,
    hook,
    corePromise,
    centralInsight,
    keyPoints,
    slideOutline,
    layoutFamily: row.layoutFamily,
    visualDirection,
    imageDirection,
    claimRisk: row.claimRisk,
    researchMode: row.researchMode,
    evidenceRequirements: trimStringList(
      row.evidenceRequirements,
      CAROUSEL_BRIEF_EVIDENCE_MAX
    ),
    prohibitedClaims: trimStringList(
      row.prohibitedClaims,
      CAROUSEL_BRIEF_PROHIBITED_MAX
    ),
    ctaDirection,
    scores: parseScores(row.scores),
    confidence: clampCarouselBriefConfidence(row.confidence),
  };
}

/**
 * Stored-payload normalize. Historic four-field stays legacy. Malformed modern
 * and garbage are dropped. Never reinterprets broken modern as valid legacy.
 */
export function normalizeStoredCarouselBrief(
  value: unknown,
  index: number
): NormalizedCarouselBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  if (row.schemaVersion === CAROUSEL_CREATIVE_BRIEF_VERSION) {
    return normalizeGeneratedCarouselBrief(value, index);
  }

  if (row.schemaVersion === 1 && row.isLegacy === true) {
    const angle = parseLegacyAngle(value);
    return angle ? legacyCreativeBriefFromAngle(angle, index) : null;
  }

  if (isHistoricFourFieldAngle(value)) {
    const angle = parseLegacyAngle(value);
    return angle ? legacyCreativeBriefFromAngle(angle, index) : null;
  }

  if (hasMeaningfulModernPlanningFields(row)) {
    return normalizeGeneratedCarouselBrief(value, index);
  }

  return null;
}

/**
 * Index contract:
 * - Stored index = position inside persisted angleOptionsJson.
 * - Display index = position inside the compacted valid-brief array.
 * DB selectedAngleIndex is always a stored index.
 * recommendedBriefIndex returned to the UI is always a display index.
 * Review Plan selection and generateCarousel input are display indexes.
 * Do not mix these two meanings under one unqualified helper.
 */
export type NormalizedStoredCarouselBriefEntry = {
  brief: NormalizedCarouselBrief;
  originalIndex: number;
};

export function normalizeStoredCarouselBriefEntries(
  raw: unknown
): NormalizedStoredCarouselBriefEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedStoredCarouselBriefEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const brief = normalizeStoredCarouselBrief(raw[i], out.length);
    if (!brief) continue;
    out.push({ brief, originalIndex: i });
  }
  return out;
}

export function normalizeStoredCarouselBriefs(
  raw: unknown
): NormalizedCarouselBrief[] {
  return normalizeStoredCarouselBriefEntries(raw).map((entry) => entry.brief);
}

/** Map a persisted stored index to a Review Plan / UI display index. */
export function normalizedIndexFromOriginalIndex(
  entries: NormalizedStoredCarouselBriefEntry[],
  originalIndex: number
): number | null {
  const displayIndex = entries.findIndex(
    (entry) => entry.originalIndex === originalIndex
  );
  return displayIndex === -1 ? null : displayIndex;
}

/** Map a Review Plan / UI display index back to the persisted stored index. */
export function originalIndexFromNormalizedIndex(
  entries: NormalizedStoredCarouselBriefEntry[],
  normalizedIndex: number
): number | null {
  const entry = entries[normalizedIndex];
  return entry ? entry.originalIndex : null;
}

export function findBriefByOriginalStoredIndex(
  entries: NormalizedStoredCarouselBriefEntry[],
  originalIndex: number
): NormalizedCarouselBrief | null {
  return (
    entries.find((entry) => entry.originalIndex === originalIndex)?.brief ??
    null
  );
}

/** Newly generated valid arrays keep stored index === display index. */
export function identityCarouselBriefEntries(
  briefs: NormalizedCarouselBrief[]
): NormalizedStoredCarouselBriefEntry[] {
  return briefs.map((brief, originalIndex) => ({ brief, originalIndex }));
}

export function normalizeGeneratedCarouselBriefs(
  raw: unknown
): CarouselCreativeBrief[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: CarouselCreativeBrief[] = [];
  for (const item of list) {
    const brief = normalizeGeneratedCarouselBrief(item, out.length);
    if (!brief) continue;
    out.push(brief);
    if (out.length >= CAROUSEL_STUDIO_ANGLE_COUNT) break;
  }
  return out;
}

export function researchModeLabel(brief: NormalizedCarouselBrief): string {
  if (isLegacyCreativeBrief(brief)) return "Not evaluated";
  if (brief.researchMode === "none") return "No research required";
  if (brief.researchMode === "claim_verification") return "Claims should be verified";
  return "Research required before publishing";
}

export function formatCarouselEnumLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildReviewPlanViewModel(args: {
  briefs: NormalizedCarouselBrief[];
  recommendedBriefIndex: number | null;
  selectedIndex: number | null;
}): {
  recommended: ReviewPlanCardModel | null;
  alternatives: ReviewPlanCardModel[];
  cards: ReviewPlanCardModel[];
} {
  const cards = args.briefs.map((brief, index) => {
    const isLegacy = isLegacyCreativeBrief(brief);
    return {
      index,
      brief,
      isRecommended:
        args.recommendedBriefIndex != null &&
        index === args.recommendedBriefIndex,
      isSelected:
        args.selectedIndex != null && index === args.selectedIndex,
      isLegacy,
      researchLabel: researchModeLabel(brief),
      keyPointTitles: brief.keyPoints.map((point) => point.title),
      structureSummary: brief.slideOutline
        .map((slide) => slide.role)
        .join(" → "),
      plannedLayoutFamily: formatCarouselEnumLabel(brief.layoutFamily),
    };
  });
  const recommended =
    args.recommendedBriefIndex == null
      ? null
      : cards.find((card) => card.isRecommended) ?? null;
  return {
    recommended,
    alternatives: cards.filter((card) => !card.isRecommended),
    cards,
  };
}

export function pendingStudioSelectionViewState(): StudioSelectionViewState {
  return { recommendedBriefIndex: null, selectedIndex: null };
}

export function applyStudioSelectionResponse(args: {
  /** Display index inside the normalized valid-brief array. */
  recommendedBriefIndex: number | null;
  /** Display index already mapped from the persisted stored index. */
  selectedAngleIndex: number | null;
  mode: "review" | "generateFromInput" | "restore";
}): StudioSelectionViewState {
  if (args.mode === "review") {
    return {
      recommendedBriefIndex: args.recommendedBriefIndex,
      selectedIndex: args.recommendedBriefIndex,
    };
  }
  return {
    recommendedBriefIndex: args.recommendedBriefIndex,
    selectedIndex: args.selectedAngleIndex,
  };
}

export function applyManualStudioSelection(
  state: StudioSelectionViewState,
  selectedIndex: number
): StudioSelectionViewState {
  return {
    recommendedBriefIndex: state.recommendedBriefIndex,
    selectedIndex,
  };
}

export function studioGenerateActionEnabled(
  state: StudioSelectionViewState
): boolean {
  return state.selectedIndex != null && state.recommendedBriefIndex != null;
}

export function buildCreativeBriefSelectionTelemetry(args: {
  briefs: NormalizedCarouselBrief[];
  /** Display index inside the normalized valid-brief array. */
  recommendedBriefIndex: number | null;
  /** Display index for the current UI selection. */
  selectedAngleIndex: number | null;
}): CreativeBriefSelectionTelemetry {
  const selection =
    args.selectedAngleIndex == null
      ? "unselected"
      : args.recommendedBriefIndex != null &&
          args.selectedAngleIndex === args.recommendedBriefIndex
        ? "recommended"
        : "manual";
  return {
    candidateIds: args.briefs.map((brief) => brief.id),
    candidates: args.briefs.map((brief) => ({
      id: brief.id,
      contentFormat: brief.contentFormat,
      layoutFamily: brief.layoutFamily,
      scores: brief.scores,
      researchMode: brief.researchMode,
      claimRisk: brief.claimRisk,
    })),
    recommendedBriefIndex: args.recommendedBriefIndex,
    selectedAngleIndex: args.selectedAngleIndex,
    selection,
  };
}

export function logCreativeBriefSelectionTelemetry(
  payload: CreativeBriefSelectionTelemetry & { remakeId?: number | null }
): void {
  console.info("[carouselStudio] creativeBriefSelection", payload);
}

export function formatApprovedCreativeBriefForCopy(
  brief: CarouselCreativeBrief
): string {
  const keyPoints =
    brief.keyPoints.length > 0
      ? brief.keyPoints
          .map(
            (point, i) =>
              `${i + 1}. ${point.title}: ${point.explanation} (purpose: ${point.purpose})`
          )
          .join("\n")
      : "None";
  const outline =
    brief.slideOutline.length > 0
      ? brief.slideOutline
          .map(
            (slide) =>
              `${slide.position}. [${slide.role}] ${slide.objective} (visual: ${slide.recommendedVisual})`
          )
          .join("\n")
      : "None";
  const evidence =
    brief.evidenceRequirements.length > 0
      ? brief.evidenceRequirements
          .map((item, i) => `${i + 1}. ${item}`)
          .join("\n")
      : "None";
  const prohibited =
    brief.prohibitedClaims.length > 0
      ? brief.prohibitedClaims.map((item, i) => `${i + 1}. ${item}`).join("\n")
      : "None";
  return [
    `Inferred audience: ${brief.inferredAudience}`,
    `Content goal: ${brief.contentGoal}`,
    `Format: ${brief.contentFormat}`,
    `Angle type: ${brief.angleType}`,
    `Hook: ${brief.hook}`,
    `Core promise: ${brief.corePromise}`,
    `Central insight: ${brief.centralInsight}`,
    "Ordered key points:",
    keyPoints,
    "Ordered slide outline:",
    outline,
    `CTA direction: ${brief.ctaDirection}`,
    "Evidence requirements:",
    evidence,
    "Prohibited claims:",
    prohibited,
  ].join("\n");
}

export function resolveRecommendedStudioBrief(briefs: NormalizedCarouselBrief[]): {
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number | null;
  selected: NormalizedCarouselBrief | null;
} {
  const { index, brief } = selectRecommendedCreativeBrief(briefs);
  return {
    recommendedBriefIndex: index,
    selectedAngleIndex: index,
    selected: brief,
  };
}

export function resolveUserSelectedStudioBrief(
  briefs: NormalizedCarouselBrief[],
  selectedAngleIndex: number
): {
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number;
  selected: NormalizedCarouselBrief | null;
} {
  const recommendedBriefIndex = selectRecommendedCreativeBrief(briefs).index;
  return {
    recommendedBriefIndex,
    selectedAngleIndex,
    selected: briefs[selectedAngleIndex] ?? null,
  };
}

const WORD_COUNT_TOKENS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const COUNT_TOKEN_RE = "twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|[2-9]|1[0-2]";

export type CarouselBriefSlideBinding = {
  position: number;
  role: CarouselSlideRole;
  objective: string;
  slideId: string | null;
};

export type CarouselCopySlotValues = Record<string, Record<string, string>>;

export const CAROUSEL_SLIDE_INTENTS = [
  "content",
  "transition",
  "closing",
] as const;
export type CarouselSlideIntent = (typeof CAROUSEL_SLIDE_INTENTS)[number];

export const CAROUSEL_CLOSING_TYPES = [
  "takeaway",
  "question",
  "practical_action",
  "follow",
  "comment",
  "dm",
  "save",
  "share",
  "click",
  "soft_close",
] as const;
export type CarouselClosingType = (typeof CAROUSEL_CLOSING_TYPES)[number];

export function isCarouselSlideIntent(
  value: unknown
): value is CarouselSlideIntent {
  return includesUnion(CAROUSEL_SLIDE_INTENTS, value);
}

export function isCarouselClosingType(
  value: unknown
): value is CarouselClosingType {
  return includesUnion(CAROUSEL_CLOSING_TYPES, value);
}

export function readSlideIntentMetadata(
  slots: Record<string, string> | undefined
): {
  slideIntent: CarouselSlideIntent | null;
  closingType: CarouselClosingType | null;
} {
  const slideIntentRaw = slots?.slideIntent?.trim();
  const closingTypeRaw = slots?.closingType?.trim();
  return {
    slideIntent: isCarouselSlideIntent(slideIntentRaw) ? slideIntentRaw : null,
    closingType: isCarouselClosingType(closingTypeRaw) ? closingTypeRaw : null,
  };
}

/** Drop copy-call metadata so it is never persisted as visible slide text. */
export function stripSlideIntentMetadata(
  values: CarouselCopySlotValues
): CarouselCopySlotValues {
  const next: CarouselCopySlotValues = {};
  for (const [slideId, slots] of Object.entries(values)) {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(slots)) {
      if (key === "slideIntent" || key === "closingType") continue;
      cleaned[key] = value;
    }
    next[slideId] = cleaned;
  }
  return next;
}

const QUALIFIED_CLAIM_CHECKS: Array<{ re: RegExp; message: string }> = [
  {
    re: /most owners have at least two/i,
    message:
      'Unsupported claim "Most owners have at least two of these". Use qualified wording such as "Many owners may have more than one".',
  },
  {
    re: /all five plugged means predictable cash/i,
    message:
      'Unsupported claim "All five plugged means predictable cash". Use qualified wording such as "Fixing these leaks can make cash flow more predictable".',
  },
  {
    re: /a reserve is not a luxury/i,
    message:
      'Unsupported claim "A reserve is not a luxury". Qualify this as an opinion, not a verified fact.',
  },
];

const CLOSING_CLAIM_CHECKS: Array<{ re: RegExp; message: string }> = [
  {
    re: /instagram will never show you/i,
    message:
      'Unsupported claim "Instagram will never show you our posts unless you follow". Use qualified wording such as "Instagram may not show you the next one - follow so you do not miss it".',
  },
];

function parseCountToken(raw: string): number | null {
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 2 && asNumber <= 12) {
    return asNumber;
  }
  return WORD_COUNT_TOKENS[raw.toLowerCase()] ?? null;
}

function maxCountMatches(text: string, pattern: RegExp): number | null {
  let max: number | null = null;
  for (const match of text.matchAll(pattern)) {
    const parsed = parseCountToken(match[1] ?? "");
    if (parsed == null) continue;
    if (max == null || parsed > max) max = parsed;
  }
  return max;
}

function briefPlanningText(brief: CarouselCreativeBrief): string {
  return [
    brief.title,
    brief.hook,
    brief.corePromise,
    brief.centralInsight,
    ...brief.keyPoints.map(
      (point) => `${point.title} ${point.explanation} ${point.purpose}`
    ),
    ...brief.slideOutline.map((slide) => slide.objective),
  ].join("\n");
}

const PAIRED_SOLUTION_PROMISE_RE =
  /\b(?:how to fix each|fix each|fix for each|plug them|plug each|how to plug them)\b/i;

export function promisedCarouselItemCount(
  text: string,
  kind: "problem" | "fix"
): number | null {
  if (kind === "problem") {
    return maxCountMatches(
      text,
      new RegExp(
        `\\b(${COUNT_TOKEN_RE})\\s+(?:cash\\s+)?(?:leaks|problems)\\b`,
        "gi"
      )
    );
  }
  const named = maxCountMatches(
    text,
    new RegExp(`\\b(${COUNT_TOKEN_RE})\\s+(?:plugs|fixes|solutions)\\b`, "gi")
  );
  const allPlugged = maxCountMatches(
    text,
    new RegExp(`\\ball\\s+(${COUNT_TOKEN_RE})\\s+plugged\\b`, "gi")
  );
  let implied: number | null = null;
  if (PAIRED_SOLUTION_PROMISE_RE.test(text)) {
    implied = promisedCarouselItemCount(text, "problem");
  }
  return [named, allPlugged, implied].reduce<number | null>((max, value) => {
    if (value == null) return max;
    if (max == null || value > max) return value;
    return max;
  }, null);
}

export function briefPromisesPairedSolutions(
  brief: CarouselCreativeBrief
): boolean {
  const text = briefPlanningText(brief);
  if (promisedCarouselItemCount(text, "fix") != null) return true;
  const numbered = collectNumberedCarouselItems([
    ...brief.keyPoints.map((point) => point.title),
    ...brief.slideOutline.map((slide) => slide.objective),
  ]);
  return numbered.problems.size > 0 && numbered.fixes.size > 0;
}

export function isNumberedProblemSolutionBrief(
  brief: CarouselCreativeBrief
): boolean {
  const text = briefPlanningText(brief);
  if (/\b(?:leak|problem|fix|plug)\s*[1-9]\b/i.test(text)) return true;
  return (
    promisedCarouselItemCount(text, "problem") != null ||
    promisedCarouselItemCount(text, "fix") != null
  );
}

type NumberedCarouselItem = { kind: "problem" | "fix"; n: number };

function parseNumberedCarouselItem(
  text: string
): NumberedCarouselItem | null {
  const problem = text.match(/\b(?:leak|problem)\s*([1-9]|1[0-2])\b/i);
  if (problem) return { kind: "problem", n: Number(problem[1]) };
  const fix = text.match(/\b(?:fix|plug)\s*([1-9]|1[0-2])\b/i);
  if (fix) return { kind: "fix", n: Number(fix[1]) };
  return null;
}

function numberedItemKey(item: NumberedCarouselItem): string {
  return `${item.kind}:${item.n}`;
}

function numberedItemLabel(item: NumberedCarouselItem): string {
  return `${item.kind === "problem" ? "Leak" : "Fix"} ${item.n}`;
}

function expectedNumberedItemPositions(
  outline: CarouselCreativeBriefSlideOutlineItem[]
): Map<string, number> {
  const expected = new Map<string, number>();
  for (const slide of outline) {
    const planned = parseNumberedCarouselItem(slide.objective);
    if (!planned) continue;
    const key = numberedItemKey(planned);
    if (!expected.has(key)) expected.set(key, slide.position);
  }
  return expected;
}

function collectNumberedCarouselItems(texts: string[]): {
  problems: Set<number>;
  fixes: Set<number>;
  problemPosition: Map<number, number>;
  fixPosition: Map<number, number>;
} {
  const problems = new Set<number>();
  const fixes = new Set<number>();
  const problemPosition = new Map<number, number>();
  const fixPosition = new Map<number, number>();
  texts.forEach((text, index) => {
    const parsed = parseNumberedCarouselItem(text);
    if (!parsed) return;
    const position = index + 1;
    if (parsed.kind === "problem") {
      problems.add(parsed.n);
      if (!problemPosition.has(parsed.n)) problemPosition.set(parsed.n, position);
      return;
    }
    fixes.add(parsed.n);
    if (!fixPosition.has(parsed.n)) fixPosition.set(parsed.n, position);
  });
  return { problems, fixes, problemPosition, fixPosition };
}

function normalizeObjectiveKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function bindBriefOutlineToSlides(
  outline: CarouselCreativeBriefSlideOutlineItem[],
  slideIds: string[]
): CarouselBriefSlideBinding[] {
  return outline.map((item, index) => ({
    position: item.position,
    role: item.role,
    objective: item.objective,
    slideId: slideIds[index] ?? null,
  }));
}

function isClosingRole(role: string): boolean {
  return role === "cta" || role === "takeaway";
}

export function validateCarouselBriefSemantics(
  brief: CarouselCreativeBrief
): string[] {
  const issues: string[] = [];
  const outline = brief.slideOutline;
  const last = outline[outline.length - 1];
  if (!last || !isClosingRole(last.role)) {
    issues.push("Brief must contain exactly one final closing");
  }
  const closingPositions = outline
    .filter((slide) => slide.role === "cta" || slide.role === "takeaway")
    .map((slide) => slide.position);
  if (
    closingPositions.length !== 1 ||
    closingPositions[0] !== outline.length
  ) {
    if (closingPositions.length === 0) {
      issues.push("Brief must contain exactly one final closing");
    } else {
      issues.push("Brief has multiple competing endings");
    }
  }

  const seenObjectives = new Map<string, number>();
  for (const slide of outline) {
    const key = normalizeObjectiveKey(slide.objective);
    if (!key) continue;
    const prior = seenObjectives.get(key);
    if (prior != null) {
      if (slide.position === outline.length) {
        issues.push("Duplicated closing language");
      }
      issues.push(
        `Repeated objective creates a filler slide at position ${slide.position}`
      );
    } else {
      seenObjectives.set(key, slide.position);
    }
  }

  if (!isNumberedProblemSolutionBrief(brief)) {
    return uniqueIssues(issues);
  }

  const planningText = briefPlanningText(brief);
  const numbered = collectNumberedCarouselItems([
    ...brief.keyPoints.map((point) => point.title),
    ...outline.map((slide) => slide.objective),
  ]);
  for (const n of numbered.fixes) {
    if (!numbered.problems.has(n)) {
      issues.push(`Fix ${n} exists without Problem/Leak ${n}`);
    }
  }
  for (const n of numbered.fixes) {
    const fixAt = numbered.fixPosition.get(n);
    const leakAt = numbered.problemPosition.get(n);
    if (fixAt != null && leakAt != null && fixAt < leakAt) {
      issues.push(`Fix ${n} appears before Leak ${n}`);
    }
  }

  const promisedProblems = promisedCarouselItemCount(planningText, "problem");
  if (promisedProblems != null && numbered.problems.size < promisedProblems) {
    issues.push(
      `The hook promises ${promisedProblems} items but fewer than ${promisedProblems} are outlined`
    );
  }

  const promisedFixes = promisedCarouselItemCount(planningText, "fix");
  if (
    briefPromisesPairedSolutions(brief) &&
    promisedFixes != null &&
    numbered.fixes.size < promisedFixes
  ) {
    issues.push(
      `A summary claims ${promisedFixes} solutions that were not introduced`
    );
  }

  return uniqueIssues(issues);
}

export function selectSemanticallyValidCarouselBriefs(
  briefs: CarouselCreativeBrief[]
): { briefs: CarouselCreativeBrief[]; semanticIssues: string[] } {
  const accepted: CarouselCreativeBrief[] = [];
  const semanticIssues: string[] = [];
  for (const brief of briefs) {
    const issues = validateCarouselBriefSemantics(brief);
    if (issues.length > 0) {
      semanticIssues.push(`Brief "${brief.title}": ${issues.join("; ")}`);
      continue;
    }
    accepted.push(brief);
  }
  return { briefs: accepted, semanticIssues };
}

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

function slideCopyText(
  values: CarouselCopySlotValues,
  slideId: string
): { title: string; body: string; all: string } {
  const slots = values[slideId] ?? {};
  const title =
    slots.headline?.trim() || slots.title?.trim() || slots.kicker?.trim() || "";
  const body = [slots.body, slots.subhead, slots.cta_label]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0 && value !== title)
    .join(" ");
  const all = Object.entries(slots)
    .filter(([key]) => key !== "slideIntent" && key !== "closingType")
    .map(([, value]) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return { title, body, all };
}

function significantCopyTokens(text: string): Set<string> {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "you",
    "are",
    "was",
    "how",
    "why",
    "each",
    "then",
    "than",
    "them",
    "they",
    "will",
    "can",
    "not",
    "but",
    "use",
    "own",
    "all",
    "any",
    "has",
    "have",
    "had",
    "been",
    "into",
    "over",
    "onto",
  ]);
  const tokens = new Set<string>();
  for (const raw of text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)) {
    if (raw.length < 4 || stop.has(raw)) continue;
    tokens.add(raw);
    if (raw.endsWith("s") && raw.length > 4) tokens.add(raw.slice(0, -1));
    else tokens.add(`${raw}s`);
  }
  return tokens;
}

function copyMatchesObjective(objective: string, generated: string): boolean {
  const planned = significantCopyTokens(objective);
  if (planned.size === 0) return true;
  const actual = significantCopyTokens(generated);
  let hits = 0;
  for (const token of planned) {
    if (actual.has(token)) hits += 1;
  }
  const needed = Math.max(2, Math.ceil(planned.size * 0.35));
  return hits >= needed;
}

export function validateCopyBriefAdherence(args: {
  brief: CarouselCreativeBrief;
  slideIds: string[];
  slideRoles?: string[];
  values: CarouselCopySlotValues;
}): string[] {
  const { brief, slideIds, values } = args;
  const issues: string[] = [];
  const outline = brief.slideOutline;
  const bindings = bindBriefOutlineToSlides(outline, slideIds);

  if (slideIds.length !== outline.length) {
    issues.push(
      `Generated slide count ${slideIds.length} does not match outline length ${outline.length}`
    );
  }

  const generatedTexts: string[] = [];
  const competingClosingPositions: number[] = [];
  const expectedByKey = expectedNumberedItemPositions(outline);
  const lastPosition = outline.length;

  for (const binding of bindings) {
    const index = binding.position - 1;
    const expectedId = slideIds[index] ?? null;
    if (binding.slideId !== expectedId) {
      issues.push(
        `Outline position ${binding.position} is not bound to effective slide ${index + 1}`
      );
    }
    if (!binding.slideId) {
      issues.push(
        `Missing planned slide at position ${binding.position}: ${binding.role}`
      );
      continue;
    }
    const copy = slideCopyText(values, binding.slideId);
    generatedTexts.push(`${copy.title} ${copy.all}`);
    const { slideIntent, closingType } = readSlideIntentMetadata(
      values[binding.slideId]
    );
    const isFinal = binding.position === lastPosition;
    if (!slideIntent) {
      issues.push(`Position ${binding.position} is missing slideIntent`);
    } else if (slideIntent === "closing") {
      if (!isFinal) {
        competingClosingPositions.push(binding.position);
      }
      if (!closingType) {
        issues.push(`Position ${binding.position} is missing closingType`);
      }
    } else if (isFinal) {
      issues.push("Copy is missing an intentional final closing");
    }

    const plannedItem = parseNumberedCarouselItem(binding.objective);
    const generatedItem = parseNumberedCarouselItem(`${copy.title} ${copy.all}`);
    if (
      plannedItem &&
      (!generatedItem ||
        generatedItem.kind !== plannedItem.kind ||
        generatedItem.n !== plannedItem.n)
    ) {
      issues.push(
        `Position ${binding.position} is missing ${numberedItemLabel(plannedItem)}`
      );
    }
    if (generatedItem) {
      const expectedPosition = expectedByKey.get(numberedItemKey(generatedItem));
      if (expectedPosition != null && expectedPosition !== binding.position) {
        issues.push(
          `Unexpected ${numberedItemLabel(generatedItem)} at position ${binding.position}; expected at position ${expectedPosition}`
        );
      }
    }

    if (!copyMatchesObjective(binding.objective, `${copy.title} ${copy.body} ${copy.all}`)) {
      console.info(
        `[carouselStudio] copy objective overlap diagnostic at position ${binding.position}: ${binding.objective}`
      );
    }
  }

  const numbered = collectNumberedCarouselItems(generatedTexts);
  const promisedProblems = promisedCarouselItemCount(
    briefPlanningText(brief),
    "problem"
  );
  if (promisedProblems != null) {
    for (let n = 1; n <= promisedProblems; n += 1) {
      if (!numbered.problems.has(n)) {
        issues.push(`Missing Leak ${n}`);
      }
    }
  }
  for (const n of numbered.fixes) {
    if (!numbered.problems.has(n)) {
      issues.push(`Fix ${n} exists without Problem/Leak ${n}`);
    }
    const fixAt = numbered.fixPosition.get(n);
    const leakAt = numbered.problemPosition.get(n);
    if (fixAt != null && (leakAt == null || fixAt < leakAt)) {
      issues.push(`Fix ${n} appears before Leak ${n}`);
    }
  }
  const promisedFixes = promisedCarouselItemCount(briefPlanningText(brief), "fix");
  if (promisedFixes != null && numbered.fixes.size < promisedFixes) {
    issues.push(
      `A summary claims ${promisedFixes} solutions that were not introduced`
    );
  }

  const lastOutline = outline[outline.length - 1];
  if (!lastOutline || !isClosingRole(lastOutline.role)) {
    issues.push("Copy is missing an intentional final closing");
  }
  if (competingClosingPositions.length > 0) {
    issues.push("Copy has multiple competing endings");
  }

  const lastCopy = generatedTexts[generatedTexts.length - 1] ?? "";
  if (lastCopy && generatedTexts.length > 1) {
    const lastKey = normalizeObjectiveKey(lastCopy);
    if (
      lastKey &&
      generatedTexts.slice(0, -1).some((text) => normalizeObjectiveKey(text) === lastKey)
    ) {
      issues.push("Duplicated closing language");
    }
  }
  if (lastOutline && !lastCopy.trim()) {
    issues.push("Final closing slide is filler");
  }

  const allCopy = generatedTexts.join("\n");
  for (const check of CLOSING_CLAIM_CHECKS) {
    if (check.re.test(allCopy)) issues.push(check.message);
  }
  if (brief.researchMode === "claim_verification") {
    for (const check of QUALIFIED_CLAIM_CHECKS) {
      if (check.re.test(allCopy)) issues.push(check.message);
    }
  }

  return uniqueIssues(issues);
}
