import { extractCoachCreatorConstraints } from "@shared/coachCreatorConstraints";

export type CoachIdeaSpecificity = "vague" | "moderately_specific" | "highly_specific";

export type CoachIdeaSpecificityFeatures = {
  topic: boolean;
  stance: boolean;
  audience: boolean;
  format: boolean;
  hook: boolean;
  storyAngle: boolean;
  constraints: boolean;
  delayedName: boolean;
  cta: boolean;
  tone: boolean;
  structure: boolean;
};

export type CoachIdeaSpecificityResult = {
  features: CoachIdeaSpecificityFeatures;
  directionSignalCount: number;
  score: number;
  classification: CoachIdeaSpecificity;
  reason: string;
};

const FORMAT_RE =
  /\b(talking[- ]head|voiceover|b-?roll|faceless|on camera|30-second|35-second|30 second|35 second|\d{2}-second)\b/i;
const STRONG_HOOK_RE =
  /\b(open with\s+["“]|open by|opening with\s+["“]|start with\s+["“]|start by|hook:)\b/i;
const WEAK_HOOK_RE = /\b(open with (?:a |an |something |some )|start with (?:a |an |something ))\b/i;
const AUDIENCE_RE =
  /\b(owners?|creators?|managers?|guests?|operators?|founders?|viewers?)\b/i;
const STORY_RE = /\b(tell the story|as a story|story of)\b/i;
const CTA_RE = /\b(end with|end by|final (?:line|sentence)|call to action|\bcta\b)\b/i;
const TONE_RE = /\b(contrarian|do not soften|punchy|direct|no hedging)\b/i;
const STRUCTURE_RE =
  /\b(one takeaway|not a list|one action|30-second|35-second|\d{2}-second)\b/i;
const CONSTRAINT_RE =
  /\bdo(?:\s+no|\s*n['’]?)t\s+(?:discuss|talk about|mention|cover|include|say|name|invent|claim)\b/i;
const GENERIC_NEED_RE =
  /\b(need content|make (?:me )?something|help me talk|give me (?:a )?(?:reel|video)|make (?:a )?(?:reel|video|content))\b/i;
const TOPIC_ABOUT_RE = /\b(?:about|explaining|explain|arguing|argue)\b/i;
const TOPIC_NOUN_RE =
  /\b(menus?|burnout|candles?|equipment|labor|growth|packaging|prep flow|hooks?|spyreels|restaurant|kitchen|creator)\b/i;
const SOFT_WHY_RE = /\bwhy\b.+\b(struggle|need help|happens?)\b/i;
const WEAK_SHOULD_RE = /\bshould (?:be|go|feel|sound|look|have|get|make)\b/i;

function hasTopic(text: string): boolean {
  if (TOPIC_ABOUT_RE.test(text) && text.trim().split(/\s+/).length >= 5) return true;
  if (TOPIC_NOUN_RE.test(text)) return true;
  if (GENERIC_NEED_RE.test(text) && TOPIC_NOUN_RE.test(text)) return true;
  return false;
}

function hasStance(text: string): boolean {
  if (/\b(arguing that|argue that|the (?:point|claim|position) is|do not soften|contrarian)\b/i.test(text)) {
    return true;
  }
  if (/\bexplain(?:ing)? why\b/i.test(text) && !SOFT_WHY_RE.test(text)) return true;
  if (/\bshow\b.+\bwhy\b/i.test(text) && !SOFT_WHY_RE.test(text)) return true;
  if (/\bshould\b/i.test(text) && !WEAK_SHOULD_RE.test(text)) return true;
  return false;
}

function hasStrongHook(text: string): boolean {
  if (STRONG_HOOK_RE.test(text)) return true;
  if (/\bopen with\b/i.test(text) && !WEAK_HOOK_RE.test(text)) return true;
  return false;
}

export function classifyCoachIdeaSpecificity(rawIdea: string): CoachIdeaSpecificityResult {
  const text = rawIdea.trim();
  const extracted = extractCoachCreatorConstraints(text);
  const constraints =
    extracted.delayedTerms.length > 0 ||
    extracted.forbiddenTerms.length > 0 ||
    extracted.forbiddenTopics.length > 0 ||
    Boolean(extracted.requiredOpening) ||
    Boolean(extracted.requiredEnding) ||
    CONSTRAINT_RE.test(text);

  const features: CoachIdeaSpecificityFeatures = {
    topic: hasTopic(text),
    stance: hasStance(text),
    audience: AUDIENCE_RE.test(text),
    format: FORMAT_RE.test(text),
    hook: hasStrongHook(text),
    storyAngle: STORY_RE.test(text),
    constraints,
    delayedName: extracted.delayedTerms.length > 0,
    cta: CTA_RE.test(text) || Boolean(extracted.requiredEnding),
    tone: TONE_RE.test(text),
    structure: STRUCTURE_RE.test(text),
  };

  const directionKeys: Array<keyof CoachIdeaSpecificityFeatures> = [
    "stance",
    "format",
    "hook",
    "constraints",
    "cta",
    "structure",
    "storyAngle",
  ];
  const directionSignalCount = directionKeys.filter((key) => features[key]).length;

  const completeBrief =
    (features.format && features.hook && features.stance) ||
    (features.hook && features.cta && features.constraints && features.stance) ||
    (features.format && features.cta && features.stance && features.constraints) ||
    (features.storyAngle && features.delayedName && features.constraints);

  const score =
    directionSignalCount +
    (features.topic ? 1 : 0) +
    (features.audience ? 0.25 : 0) +
    (features.tone ? 0.25 : 0);

  let classification: CoachIdeaSpecificity = "vague";
  let reason = "Too few creative-direction signals. Run strategy.";

  // Skip-strategy requires strong evidence. When uncertain, keep strategy.
  if (
    features.topic &&
    completeBrief &&
    (features.stance || features.delayedName) &&
    directionSignalCount >= 3
  ) {
    classification = "highly_specific";
    reason = "Creator already supplied a complete brief. Strategy skip is eligible for experiment only.";
  } else if (features.topic && features.stance && features.constraints && directionSignalCount >= 4) {
    classification = "highly_specific";
    reason = "Topic, stance, constraints, and at least four direction signals.";
  } else if (features.topic && directionSignalCount >= 1) {
    classification = "moderately_specific";
    reason = "Topic plus some direction, but not a complete brief. Run strategy.";
  }

  return {
    features,
    directionSignalCount,
    score,
    classification,
    reason,
  };
}

export function shouldSkipStrategyForExperiment(rawIdea: string): boolean {
  return classifyCoachIdeaSpecificity(rawIdea).classification === "highly_specific";
}
