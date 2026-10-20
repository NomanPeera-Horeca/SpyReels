/**
 * Content language from profile and caption text.
 * Returns null when the text is too short or does not clearly match a language.
 * Latin letters alone are not treated as English.
 */

export type ContentLanguage = { code: string; label: string };

const LANGUAGE_RULES: { code: string; label: string; pattern: RegExp }[] = [
  { code: "pt", label: "Portuguese", pattern: /\b(não|voce|você|obrigado|restaurante|para|você)\b/gi },
  { code: "es", label: "Spanish", pattern: /\b(el|los|las|para|restaurante|cocina|también|una|que)\b/gi },
  { code: "fr", label: "French", pattern: /\b(les|des|une|pour|dans|avec|restaurant|vous)\b/gi },
  { code: "de", label: "German", pattern: /\b(und|der|die|das|nicht|für|restaurant|ich)\b/gi },
  { code: "en", label: "English", pattern: /\b(the|and|you|your|with|this|that|for|from|our|are|was|have|what|or)\b/gi },
];

/** Enough repeated function words to name a language. One shared word is not enough. */
const MIN_HITS = 3;

export function detectContentLanguage(text: string): ContentLanguage | null {
  const t = text.trim();
  if (t.length < 12) return null;
  if (/[\u0600-\u06FF]/.test(t)) return { code: "ar", label: "Arabic" };
  if (/[\u0900-\u097F]/.test(t)) return { code: "hi", label: "Hindi" };
  if (/[\u3040-\u30FF]/.test(t)) return { code: "ja", label: "Japanese" };
  if (/[\uAC00-\uD7AF]/.test(t)) return { code: "ko", label: "Korean" };

  let best: ContentLanguage | null = null;
  let bestHits = MIN_HITS - 1;
  for (const rule of LANGUAGE_RULES) {
    const hits = t.match(rule.pattern)?.length ?? 0;
    if (hits > bestHits) {
      best = { code: rule.code, label: rule.label };
      bestHits = hits;
    }
  }
  return best;
}
