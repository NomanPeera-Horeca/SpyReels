import { countWords, type CoachScriptSections } from "@shared/coachScriptSections";

/** ~3 spoken words per second (matches ScriptEditor / recreate tooling). */
export const COACH_WORDS_PER_SECOND = 3;

export const COACH_MAX_TOTAL_WORDS = 135;

export const COACH_SECTION_WORD_LIMITS = {
  hook: 22,
  explain: 32,
  illustrate: 38,
  teach: 22,
  cta: 18,
} as const;

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

export function durationLabelFromWordCount(wordCount: number): string {
  if (wordCount <= 0) return "~30 seconds";
  const seconds = Math.round(wordCount / COACH_WORDS_PER_SECOND);
  const clamped = Math.min(Math.max(seconds, 20), 60);
  return `~${clamped} seconds`;
}

export function coachScriptWithinBudget(hook: string, sections: CoachScriptSections): boolean {
  if (coachScriptWordCount(hook, sections) > COACH_MAX_TOTAL_WORDS) return false;
  if (countWords(hook) > COACH_SECTION_WORD_LIMITS.hook) return false;
  if (countWords(sections.explain) > COACH_SECTION_WORD_LIMITS.explain) return false;
  if (countWords(sections.illustrate) > COACH_SECTION_WORD_LIMITS.illustrate) return false;
  if (countWords(sections.teach) > COACH_SECTION_WORD_LIMITS.teach) return false;
  if (countWords(sections.cta) > COACH_SECTION_WORD_LIMITS.cta) return false;
  return true;
}

export const COACH_LENGTH_AND_HOOK_RULES = `LENGTH (mandatory — match approved Studio mockup, short Reels only):
- Total spoken words across hook + explain + illustrate + teach + cta: 90-130 words target, NEVER exceed ${COACH_MAX_TOTAL_WORDS} words.
- hook: max ${COACH_SECTION_WORD_LIMITS.hook} words, max 2 sentences. First line must stop the scroll in 2 seconds.
- explain: max ${COACH_SECTION_WORD_LIMITS.explain} words, max 2 sentences
- illustrate: max ${COACH_SECTION_WORD_LIMITS.illustrate} words, one short example only
- teach: max ${COACH_SECTION_WORD_LIMITS.teach} words, ONE action only
- cta: max ${COACH_SECTION_WORD_LIMITS.cta} words
- estimatedDuration in JSON must match total word count (~${COACH_WORDS_PER_SECOND} words per second). Do not label 45 seconds if the script reads longer than 45 seconds aloud.

HOOK strength (mandatory — not soft guru copy):
- Use a specific number, sharp question, or contrarian claim in sentence one. No warm-up.
- Banned soft openers: "Your competitors are...", "Most people...", "Everyone is telling you...", "Here is the thing..."
- Good pattern examples: "I worked 9 to 5 for 3 years before my first $1K on the side." / "Stop guessing Reel ideas every week."
- productionCoach.hookOnScreenText: required. Max 30 characters, ALL CAPS key phrase for first 2 sec on-screen (mockup style).
- productionCoach.textOverlay: same phrase or short variant for the hook moment.`;
