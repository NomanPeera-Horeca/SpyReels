import { countWords, type CoachScriptSections } from "@shared/coachScriptSections";
import type { CoachScriptMode } from "@shared/coachScriptMode";

/** ~3 spoken words per second (matches ScriptEditor / recreate tooling). */
export const COACH_WORDS_PER_SECOND = 3;

/** Story Reel: ~30-45 seconds. */
export const COACH_STORY_MAX_TOTAL_WORDS = 135;

export const COACH_STORY_SECTION_WORD_LIMITS = {
  hook: 22,
  explain: 32,
  illustrate: 38,
  teach: 22,
  cta: 18,
} as const;

/** Loop Reel: ~8-15 seconds. */
export const COACH_LOOP_MAX_TOTAL_WORDS = 45;

export const COACH_LOOP_SECTION_WORD_LIMITS = {
  hook: 12,
  explain: 10,
  illustrate: 10,
  teach: 8,
  cta: 8,
} as const;

/** @deprecated Use COACH_STORY_MAX_TOTAL_WORDS */
export const COACH_MAX_TOTAL_WORDS = COACH_STORY_MAX_TOTAL_WORDS;

export function coachMaxTotalWords(mode: CoachScriptMode): number {
  return mode === "loop" ? COACH_LOOP_MAX_TOTAL_WORDS : COACH_STORY_MAX_TOTAL_WORDS;
}

export function coachSectionWordLimits(mode: CoachScriptMode) {
  return mode === "loop" ? COACH_LOOP_SECTION_WORD_LIMITS : COACH_STORY_SECTION_WORD_LIMITS;
}

export function coachScriptWordCount(
  hook: string,
  sections: CoachScriptSections
): number {
  return (
    countWords(hook) +
    countWords(sections.explain) +
    countWords(sections.illustrate) +
    countWords(sections.teach) +
    countWords(sections.cta)
  );
}

export function durationLabelFromWordCount(wordCount: number, mode: CoachScriptMode = "story"): string {
  if (wordCount <= 0) {
    return mode === "loop" ? "~12 seconds" : "~30 seconds";
  }
  const seconds = Math.round(wordCount / COACH_WORDS_PER_SECOND);
  if (mode === "loop") {
    const clamped = Math.min(Math.max(seconds, 8), 15);
    return `~${clamped} seconds`;
  }
  const clamped = Math.min(Math.max(seconds, 20), 60);
  return `~${clamped} seconds`;
}

export function coachScriptWithinBudget(
  hook: string,
  sections: CoachScriptSections,
  mode: CoachScriptMode = "story"
): boolean {
  const limits = coachSectionWordLimits(mode);
  const maxTotal = coachMaxTotalWords(mode);
  if (coachScriptWordCount(hook, sections) > maxTotal) return false;
  if (countWords(hook) > limits.hook) return false;
  if (countWords(sections.explain) > limits.explain) return false;
  if (countWords(sections.illustrate) > limits.illustrate) return false;
  if (countWords(sections.teach) > limits.teach) return false;
  if (countWords(sections.cta) > limits.cta) return false;
  return true;
}

export function buildCoachLengthAndHookRules(mode: CoachScriptMode): string {
  const limits = coachSectionWordLimits(mode);
  const maxTotal = coachMaxTotalWords(mode);
  const targetRange =
    mode === "loop" ? "25-40 words target" : "90-130 words target";
  const durationHint =
    mode === "loop"
      ? "8-15 seconds when read aloud"
      : "30-45 seconds when read aloud";

  return `LENGTH (mandatory — ${mode === "loop" ? "Loop Reel" : "Story Reel"}):
- Total spoken words across hook + explain + illustrate + teach + cta: ${targetRange}, NEVER exceed ${maxTotal} words.
- hook: max ${limits.hook} words, max 2 sentences. Open Loop A only. No payoff in sentence one.
- explain: max ${limits.explain} words, max 2 sentences. Open Loop B.
- illustrate: max ${limits.illustrate} words. Close Loop B only.
- teach: max ${limits.teach} words. Close Loop A payoff only. ONE insight.
- cta: max ${limits.cta} words. Loop tie-back plus share or comment CTA.
- estimatedDuration in JSON must match total word count (~${COACH_WORDS_PER_SECOND} words per second, ${durationHint}). Do not lie about duration.

HOOK strength (mandatory — not soft guru copy):
- Use a specific number, sharp question, contrarian claim, or end-result visual. No warm-up.
- Banned soft openers: "Your competitors are...", "Most people...", "Everyone is telling you...", "Here is the thing..."
- Do NOT reveal your best insight in the hook. Save it for teach (~70% mark).
- productionCoach.hookOnScreenText and frame0OnScreenText: required. Max 30 characters, ALL CAPS, frame 0 (first 0.5 sec).
- productionCoach.textOverlay: same phrase or short variant for the hook moment.`;
}

/** Story-mode rules (default). Roll back to pre-retention behavior by using only this constant. */
export const COACH_LENGTH_AND_HOOK_RULES = buildCoachLengthAndHookRules("story");
