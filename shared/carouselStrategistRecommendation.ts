/**
 * Strategist format recommendation: validate LLM metadata and apply it
 * during ranking. Not a source-text classifier. Not renderer routing.
 */

import {
  CAROUSEL_CONTENT_FORMATS,
  detectExplicitCarouselListContract,
  rankCarouselCreativeBriefs,
  type CarouselContentFormat,
  type CarouselListContract,
  type NormalizedCarouselBrief,
} from "./carouselStudio";

export const CAROUSEL_FORMAT_SELECTION_GUIDANCE = [
  "Choose the three strategies from the source's core idea, not a fixed diagnostic/breakdown, story, and practical framework default.",
  "When the core idea is a contrast, tradeoff, or which-is-better decision (wrong versus right, cheap versus quality, old way versus new way, myth versus reality, before versus after, option A versus option B), include a comparison candidate. Comparison is usually the strongest format for that intent.",
  "When the core idea is a personal narrative (why I switched, what happened after, a sequenced transformation), prefer story. Do not force comparison just because two subjects appear.",
  "When the source is an explicit numbered list (N mistakes, reasons, signs, or ways), prefer breakdown.",
  "When the source asks for a named process or decision framework, prefer framework.",
  "Do not treat a contrast word as automatic comparison if the source is actually a story, numbered list, or framework.",
].join(" ");

export const CAROUSEL_FORMAT_FIT_SCORING_GUIDANCE = [
  "Score relevance as format fit to the source's core idea, not only topic overlap.",
  "If the core idea is a contrast between two alternatives, a comparison brief should outscore a story that only narrates the same topic.",
  "Give comparison briefs high visualPotential when the contrast can be shown side by side.",
  "Do not lower factualSafety only because the format is comparison.",
  "If the core idea is a personal narrative, keep story relevance high.",
  "If the source is an explicit numbered list, keep breakdown relevance high.",
  "If the source asks for a named framework, keep framework relevance high.",
].join(" ");

export const CAROUSEL_FORMAT_RECOMMENDATION_GUIDANCE = [
  "Also return top-level recommendedFormat and formatConfidence for the source as a whole, not for one candidate.",
  "recommendedFormat must be one contentFormat from the allowed enum and should name the single strongest format for the source's core idea.",
  "formatConfidence is 0 to 1. Use a high value only when the core idea clearly favors one format. Use a low value when the source is an open question or could honestly be more than one format.",
  "When formatConfidence is high, include at least one candidate whose contentFormat and layoutFamily match recommendedFormat.",
  "Do not raise formatConfidence just to force a winner.",
].join(" ");

/**
 * Conservative gate before a strategist format can override score ranking.
 * Live AUTO generateCarouselAngles run (24 prompts, no prefer-family):
 * contrast 0.82-0.88, story 0.72-0.82, numbered lists 0.88-0.93,
 * named frameworks 0.85-0.92. Open "best way" was 0.60 and used score
 * fallback. 0.70 keeps narrative cases above the gate without forcing
 * ambiguous questions into a format.
 */
export const CAROUSEL_FORMAT_RECOMMENDATION_MIN_CONFIDENCE = 0.7;

export type CarouselStrategistFormatRecommendation = {
  recommendedFormat: CarouselContentFormat;
  formatConfidence: number;
};

export type CarouselFormatRecommendationApplication =
  | "list_contract"
  | "strategist"
  | "score_fallback";

function includesFormat(value: unknown): value is CarouselContentFormat {
  return (
    typeof value === "string" &&
    (CAROUSEL_CONTENT_FORMATS as readonly string[]).includes(value)
  );
}

export function normalizeCarouselFormatRecommendation(
  raw: unknown
): CarouselStrategistFormatRecommendation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (!includesFormat(row.recommendedFormat)) return null;
  const confidence =
    typeof row.formatConfidence === "number" && Number.isFinite(row.formatConfidence)
      ? row.formatConfidence
      : Number(row.formatConfidence);
  if (!Number.isFinite(confidence)) return null;
  return {
    recommendedFormat: row.recommendedFormat,
    formatConfidence: Math.min(1, Math.max(0, confidence)),
  };
}

export function firstValidCarouselFormatRecommendation(
  ...candidates: Array<CarouselStrategistFormatRecommendation | null | undefined>
): CarouselStrategistFormatRecommendation | null {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}

function briefMatchesFormat(
  brief: NormalizedCarouselBrief,
  format: CarouselContentFormat
): boolean {
  return brief.contentFormat === format || brief.layoutFamily === format;
}

function preferMatchingFormat<T extends NormalizedCarouselBrief>(
  ranked: T[],
  format: CarouselContentFormat
): T[] | null {
  const matches = ranked.filter((brief) => briefMatchesFormat(brief, format));
  if (matches.length === 0) return null;
  const rest = ranked.filter((brief) => !briefMatchesFormat(brief, format));
  return [...matches, ...rest];
}

export function resolveCarouselFormatRecommendationApplication(args: {
  recommendation?: CarouselStrategistFormatRecommendation | null;
  listContract?: CarouselListContract | null;
  sourceContent?: string | null;
  hasMatchingRecommendedBrief: boolean;
  hasMatchingBreakdownBrief: boolean;
}): CarouselFormatRecommendationApplication {
  const listContract =
    args.listContract === undefined
      ? detectExplicitCarouselListContract(args.sourceContent ?? "")
      : args.listContract;
  if (listContract?.explicitListContract && args.hasMatchingBreakdownBrief) {
    return "list_contract";
  }
  const recommendation = args.recommendation ?? null;
  if (
    recommendation &&
    recommendation.formatConfidence >= CAROUSEL_FORMAT_RECOMMENDATION_MIN_CONFIDENCE &&
    args.hasMatchingRecommendedBrief
  ) {
    return "strategist";
  }
  return "score_fallback";
}

export function applyCarouselFormatRecommendation<T extends NormalizedCarouselBrief>(
  briefs: T[],
  recommendation?: CarouselStrategistFormatRecommendation | null,
  options?: {
    listContract?: CarouselListContract | null;
    sourceContent?: string | null;
  }
): T[] {
  const ranked = rankCarouselCreativeBriefs(briefs);
  if (ranked.length === 0) return ranked;

  const listContract =
    options?.listContract === undefined
      ? detectExplicitCarouselListContract(options?.sourceContent ?? "")
      : options.listContract;
  const hasMatchingBreakdownBrief = ranked.some((brief) =>
    briefMatchesFormat(brief, "breakdown")
  );
  const hasMatchingRecommendedBrief = Boolean(
    recommendation &&
      ranked.some((brief) => briefMatchesFormat(brief, recommendation.recommendedFormat))
  );
  const application = resolveCarouselFormatRecommendationApplication({
    recommendation,
    listContract,
    sourceContent: options?.sourceContent,
    hasMatchingRecommendedBrief,
    hasMatchingBreakdownBrief,
  });

  if (application === "list_contract") {
    return preferMatchingFormat(ranked, "breakdown") ?? ranked;
  }
  if (application === "strategist" && recommendation) {
    return preferMatchingFormat(ranked, recommendation.recommendedFormat) ?? ranked;
  }
  return ranked;
}

export function selectRecommendedCreativeBriefWithFormat(args: {
  briefs: NormalizedCarouselBrief[];
  recommendation?: CarouselStrategistFormatRecommendation | null;
  listContract?: CarouselListContract | null;
  sourceContent?: string | null;
}): { index: number | null; brief: NormalizedCarouselBrief | null } {
  if (args.briefs.length === 0) return { index: null, brief: null };
  const ranked = applyCarouselFormatRecommendation(args.briefs, args.recommendation, {
    listContract: args.listContract,
    sourceContent: args.sourceContent,
  });
  const winner = ranked[0] ?? null;
  if (!winner) return { index: null, brief: null };
  const index = args.briefs.indexOf(winner);
  return { index: index < 0 ? 0 : index, brief: winner };
}
