/**
 * Starter questions for creators the AI cannot read: "I don't post yet", or a
 * linked profile with almost nothing public (no real bio, under 3 posts).
 * The answers are the creator's own words. They are saved as the trusted
 * brand description (plus their audience as a confirmed audience), so the
 * Goal, Audience and Pillar steps build on them instead of guessing.
 *
 * Questions 1 and 2 come from the original onboarding; question 3 is new.
 */
import { ONBOARDING_AUDIENCE_CHIPS, ONBOARDING_NICHE_CHIPS } from "../onboardingFlow";

export const STARTER_TOPIC_CHIPS = ONBOARDING_NICHE_CHIPS;
export const STARTER_AUDIENCE_CHIPS = ONBOARDING_AUDIENCE_CHIPS;

export const CONTENT_PURPOSES = [
  "grow_audience",
  "get_clients",
  "sell_product",
  "personal_brand",
  "share_entertain",
] as const;
export type ContentPurpose = (typeof CONTENT_PURPOSES)[number];

export const CONTENT_PURPOSE_OPTIONS: ReadonlyArray<{
  value: ContentPurpose;
  label: string;
  /** Completes "I want my content to ..." in the saved description. */
  phrase: string;
}> = [
  { value: "grow_audience", label: "Grow an audience", phrase: "grow an audience" },
  { value: "get_clients", label: "Get clients", phrase: "bring me clients for my services" },
  { value: "sell_product", label: "Sell my product", phrase: "sell my own product" },
  { value: "personal_brand", label: "Build my personal brand", phrase: "build my personal brand" },
  { value: "share_entertain", label: "Share and entertain", phrase: "share my life and entertain people" },
];

export const STARTER_TOPIC_MAX = 120;
export const STARTER_AUDIENCE_MAX = 120;
/** Matches the brand description evidence clip. */
export const STARTER_DESCRIPTION_MAX = 400;

export type StarterAnswers = {
  topic?: string | null;
  audience?: string | null;
  purpose?: ContentPurpose | null;
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sentence = (s: string) => s.replace(/[.!?\s]+$/, "");

/** The creator's answers as one plain description, in their own words. Empty when nothing was answered. */
export function composeStarterDescription(a: StarterAnswers): string {
  const topic = sentence(clean(a.topic).slice(0, STARTER_TOPIC_MAX));
  const audience = sentence(clean(a.audience).slice(0, STARTER_AUDIENCE_MAX));
  const purpose = CONTENT_PURPOSE_OPTIONS.find(o => o.value === a.purpose)?.phrase ?? "";
  const parts = [
    topic ? `I create content about ${topic}.` : "",
    audience ? `I make it for ${audience}.` : "",
    purpose ? `I want my content to ${purpose}.` : "",
  ].filter(Boolean);
  return parts.join(" ").slice(0, STARTER_DESCRIPTION_MAX);
}

export function hasStarterAnswer(a: StarterAnswers): boolean {
  return composeStarterDescription(a).length > 0;
}

/** A bio this short says nothing the AI can use ("🇺🇸", "Hi", a single word). */
const MIN_USEFUL_BIO_CHARS = 15;
/** Below this many posts there is no pattern to read. */
const MIN_READABLE_POSTS = 3;

/**
 * Ask the starter questions when there is nothing to read: always for "I
 * don't post yet", and for a linked profile with no useful bio and fewer than
 * three posts. Never ask again once the creator has written a description.
 */
export function needsStarterQuestions(input: {
  profileStatus: string | null | undefined;
  bio: string | null | undefined;
  postCount: number | null | undefined;
  hasCreatorDescription: boolean;
}): boolean {
  if (input.hasCreatorDescription) return false;
  if (input.profileStatus === "not_posting_yet") return true;
  const bioUseful = clean(input.bio).length >= MIN_USEFUL_BIO_CHARS;
  const posts = input.postCount ?? 0;
  return !bioUseful && posts < MIN_READABLE_POSTS;
}
