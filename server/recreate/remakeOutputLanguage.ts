/**
 * Remake scripts are for the creator to speak on camera.
 * Source reels may be any language; output defaults to English until we
 * expose a per-user remake language setting.
 */

export const DEFAULT_REMAKE_OUTPUT_LANGUAGE = "English";

export function buildRemakeOutputLanguageRules(
  outputLanguage: string = DEFAULT_REMAKE_OUTPUT_LANGUAGE
): string {
  const lang = outputLanguage.trim() || DEFAULT_REMAKE_OUTPUT_LANGUAGE;
  return `**OUTPUT LANGUAGE (HARD RULE):**
- Write the entire spoken script in ${lang} only.
- The source transcript/caption may be in another language. Use it only for topic, structure, pacing, and mechanics.
- Do not leave the remake in the source language.
- Do not mix languages unless the creator direction explicitly asks for a short quoted phrase.
- Delivery cues in [brackets] stay in ${lang}.`;
}

export function remakeOutputLanguageSystemClause(
  outputLanguage: string = DEFAULT_REMAKE_OUTPUT_LANGUAGE
): string {
  const lang = outputLanguage.trim() || DEFAULT_REMAKE_OUTPUT_LANGUAGE;
  return `Always write the spoken remake script in ${lang}, even when the source transcript is in another language.`;
}
