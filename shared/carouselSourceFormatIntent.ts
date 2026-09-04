/**
 * Semantic format-intent signal for carousel strategist evaluation.
 * Used while scoring and ranking briefs. Not renderer routing.
 */

import {
  detectExplicitCarouselListContract,
  scoreCarouselCreativeBrief,
  type CarouselContentFormat,
  type NormalizedCarouselBrief,
} from "./carouselStudio";

export const CAROUSEL_SOURCE_FORMAT_INTENTS = [
  "comparison",
  "story",
  "breakdown",
  "framework",
  "ambiguous",
] as const;
export type CarouselSourceFormatIntent =
  (typeof CAROUSEL_SOURCE_FORMAT_INTENTS)[number];

export type CarouselSourceFormatIntentStrength = "strong" | "moderate" | "weak";

export type CarouselSourceFormatIntentResult = {
  format: CarouselSourceFormatIntent;
  strength: CarouselSourceFormatIntentStrength;
  scores: {
    comparison: number;
    story: number;
    breakdown: number;
    framework: number;
  };
};

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

const STRONG_FIT_BOOST = { relevance: 18, visualPotential: 16 } as const;
const MODERATE_FIT_BOOST = { relevance: 10, visualPotential: 8 } as const;

const POLAR_DECISION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bcheap(?:est|er)?\b/i, /\b(?:right|quality|premium|correct)\b/i],
  [/\blarge\b/i, /\bfocused\b/i],
  [/\bold (?:way|method|approach)\b/i, /\bnew (?:way|method|approach)\b/i],
  [/\bwrong\b/i, /\bright\b/i],
  [/\bmyth\b/i, /\breality\b/i],
  [/\bin-house\b/i, /\bthird[- ]party\b/i],
  [/\bdiscount(?:ing)?\b/i, /\b(?:adding value|value)\b/i],
  [/\bfrozen\b/i, /\bfresh\b/i],
  [/\brepair\b/i, /\breplace\b/i],
];

function normalizeSource(sourceContent: string): string {
  return sourceContent.replace(/\s+/g, " ").trim();
}

function hasVsAlternativePair(text: string): boolean {
  return /\S.+\s+(?:vs\.?|versus)\s+\S+/i.test(text);
}

function hasPolarDecisionPair(text: string): boolean {
  return POLAR_DECISION_PAIRS.some(
    ([left, right]) => left.test(text) && right.test(text)
  );
}

function comparisonSignals(text: string): number {
  let score = 0;
  if (hasVsAlternativePair(text)) score += 3;
  if (/\bwhich is better\b/i.test(text)) score += 3;
  if (/\bwhich (?:should i|one (?:to|should)|to (?:choose|pick))\b/i.test(text)) {
    score += 2;
  }
  if (hasPolarDecisionPair(text)) score += 2;
  if (/\boption [ab]\b/i.test(text)) score += 2;
  if (/\btrade-?offs?\b/i.test(text)) score += 2;
  if (
    /\b(?:instead of|or the alternative)\b/i.test(text) &&
    hasPolarDecisionPair(text)
  ) {
    score += 1;
  }
  return score;
}

function storySignals(text: string): number {
  let score = 0;
  if (/\bwhy i\b/i.test(text)) score += 4;
  if (/\bwhat happened after\b/i.test(text)) score += 4;
  if (/\bthe mistake that\b/i.test(text)) score += 4;
  if (/\bhow one\b/i.test(text) && /\b(?:saved|changed|fixed|nearly)\b/i.test(text)) {
    score += 4;
  }
  if (/\b(?:i switched|why i (?:stopped|quit|left|switched))\b/i.test(text)) {
    score += 3;
  }
  if (/\bafter \d+ years\b/i.test(text)) score += 3;
  if (/\bhow i\b/i.test(text)) score += 3;
  if (/\bi (?:stopped|learned|almost|nearly)\b/i.test(text)) score += 2;
  if (/\bmy (?:first year|restaurant|kitchen)\b/i.test(text) && /\b(?:after|mistake|saved|shut)\b/i.test(text)) {
    score += 2;
  }
  return score;
}

function frameworkSignals(text: string): number {
  let score = 0;
  if (/\b(?:\d+|two|three|four|five|six)[- ]part framework\b/i.test(text)) {
    score += 4;
  }
  if (/\bthe framework i use\b/i.test(text)) score += 4;
  if (/\bdecision framework\b/i.test(text)) score += 3;
  if (/\bframework for\b/i.test(text)) score += 3;
  if (
    /\bframework\b/i.test(text) &&
    /\b(?:decide|deciding|whether|choose|choosing)\b/i.test(text)
  ) {
    score += 2;
  }
  return score;
}

function breakdownSignals(
  text: string,
  hasExplicitList: boolean
): number {
  let score = hasExplicitList ? 4 : 0;
  if (
    /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:reasons?|mistakes?|signs?|ways?|tips?|lessons?)\b/i.test(
      text
    )
  ) {
    score += 3;
  }
  return score;
}

function resolveIntent(
  scores: CarouselSourceFormatIntentResult["scores"]
): Pick<CarouselSourceFormatIntentResult, "format" | "strength"> {
  const ranked = (
    Object.entries(scores) as Array<
      [Exclude<CarouselSourceFormatIntent, "ambiguous">, number]
    >
  ).sort((a, b) => b[1] - a[1]);
  const [topFormat, topScore] = ranked[0]!;
  const secondScore = ranked[1]?.[1] ?? 0;

  if (topScore < 3) {
    return { format: "ambiguous", strength: "weak" };
  }

  // Narrative core beats a weaker contrast signal on the same prompt.
  if (scores.story >= 3 && scores.story >= scores.comparison) {
    return {
      format: "story",
      strength: scores.story >= 5 ? "strong" : "moderate",
    };
  }

  // Named list and framework contracts beat a leftover contrast phrase.
  if (scores.breakdown >= 3 && scores.breakdown >= topScore) {
    return {
      format: "breakdown",
      strength: scores.breakdown >= 5 ? "strong" : "moderate",
    };
  }
  if (
    scores.framework >= 3 &&
    scores.framework > scores.comparison &&
    scores.framework >= scores.story
  ) {
    return {
      format: "framework",
      strength: scores.framework >= 5 ? "strong" : "moderate",
    };
  }

  if (topScore === secondScore) {
    return { format: "ambiguous", strength: "weak" };
  }

  return {
    format: topFormat,
    strength: topScore >= 5 ? "strong" : "moderate",
  };
}

export function inferCarouselSourceFormatIntent(
  sourceContent: string
): CarouselSourceFormatIntentResult {
  const text = normalizeSource(sourceContent);
  const listContract = detectExplicitCarouselListContract(text);
  const scores = {
    comparison: comparisonSignals(text),
    story: storySignals(text),
    breakdown: breakdownSignals(text, Boolean(listContract?.explicitListContract)),
    framework: frameworkSignals(text),
  };
  const resolved = resolveIntent(scores);
  return { ...resolved, scores };
}

function fitBoostFor(
  strength: CarouselSourceFormatIntentStrength
): { relevance: number; visualPotential: number } | null {
  if (strength === "strong") return STRONG_FIT_BOOST;
  if (strength === "moderate") return MODERATE_FIT_BOOST;
  return null;
}

export function applyCarouselSourceFormatFitToBrief<T extends NormalizedCarouselBrief>(
  brief: T,
  intent: CarouselSourceFormatIntentResult
): T {
  if (intent.format === "ambiguous") return brief;
  const boost = fitBoostFor(intent.strength);
  if (!boost) return brief;
  const format = brief.contentFormat as CarouselContentFormat;
  if (format !== intent.format) return brief;

  const nextScores = scoreCarouselCreativeBrief({
    relevance: brief.scores.relevance + boost.relevance,
    usefulness: brief.scores.usefulness,
    specificity: brief.scores.specificity,
    visualPotential: brief.scores.visualPotential + boost.visualPotential,
    factualSafety: brief.scores.factualSafety,
    originality: brief.scores.originality,
  });
  return { ...brief, scores: nextScores };
}

export function applyCarouselSourceFormatFitToBriefs<T extends NormalizedCarouselBrief>(
  briefs: T[],
  sourceContent: string
): T[] {
  const intent = inferCarouselSourceFormatIntent(sourceContent);
  return briefs.map((brief) => applyCarouselSourceFormatFitToBrief(brief, intent));
}
