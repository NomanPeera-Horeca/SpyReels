/**
 * Niche and language suggestions for the goal step.
 *
 * Niche: the featured-creator catalog is checked first (no model call).
 * A short model call runs only when the catalog does not match.
 * Language: detected from the profile text. Empty text is not guessed.
 */
import { z } from "zod";
import { inferNicheFromText } from "@shared/creatorContextInference";
import type { CreatorEvidence } from "./evidence";
import { UNTRUSTED_DATA_RULE } from "./evidence";
import {
  claimsPerformance,
  copiesSourceText,
  sanitizeCopy,
  wordCount,
} from "./guards";
import {
  callStructured,
  type LlmInvoker,
  type LlmUsage,
} from "./structuredLlm";

export type LanguageSuggestion = { code: string; label: string };
export type NicheSuggestion = { slug: string; label: string };

const LANGUAGE_RULES: { code: string; label: string; pattern: RegExp }[] = [
  { code: "pt", label: "Portuguese", pattern: /\b(não|voce|você|obrigado|restaurante)\b/gi },
  { code: "es", label: "Spanish", pattern: /\b(el|los|las|para|restaurante|cocina|también)\b/gi },
  { code: "fr", label: "French", pattern: /\b(les|des|une|pour|dans|avec|restaurant)\b/gi },
  { code: "de", label: "German", pattern: /\b(und|der|die|das|nicht|für|restaurant)\b/gi },
];

/** Language of the profile text, or null when there is not enough text to tell. */
export function detectContentLanguage(text: string): LanguageSuggestion | null {
  const t = text.trim();
  if (t.length < 12) return null;
  if (/[\u0600-\u06FF]/.test(t)) return { code: "ar", label: "Arabic" };
  if (/[\u0900-\u097F]/.test(t)) return { code: "hi", label: "Hindi" };
  if (/[\u3040-\u30FF]/.test(t)) return { code: "ja", label: "Japanese" };
  if (/[\uAC00-\uD7AF]/.test(t)) return { code: "ko", label: "Korean" };
  let best: LanguageSuggestion | null = null;
  let bestHits = 2;
  for (const rule of LANGUAGE_RULES) {
    const hits = t.match(rule.pattern)?.length ?? 0;
    if (hits > bestHits) {
      best = { code: rule.code, label: rule.label };
      bestHits = hits;
    }
  }
  if (best) return best;
  if (/[a-z]/i.test(t)) return { code: "en", label: "English" };
  return null;
}

export function catalogNiche(text: string): NicheSuggestion | null {
  const hit = inferNicheFromText(text);
  return hit ? { slug: hit.slug, label: hit.label } : null;
}

function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return s || "general";
}

const NICHE_SCHEMA = {
  type: "object",
  properties: { label: { type: "string" } },
  required: ["label"],
  additionalProperties: false,
};

/**
 * Short niche label when the catalog has no match. Returns null on provider
 * failure so onboarding can continue.
 */
export async function inferNicheLabel(input: {
  evidence: CreatorEvidence;
  invoker?: LlmInvoker;
  timeoutMs?: number;
}): Promise<{ niche: NicheSuggestion | null; usage: LlmUsage | null }> {
  try {
    const { value, usage } = await callStructured({
      operation: "personalization_niche",
      system: [
        "Name the creator's content niche in 1 to 4 words.",
        "A niche is a category, not a biography and not a goal.",
        "No numbers and no performance claims.",
        UNTRUSTED_DATA_RULE,
      ].join("\n"),
      user: input.evidence.snippets.map(s => s.text).join("\n").slice(0, 1200),
      schemaName: "content_niche",
      schema: NICHE_SCHEMA,
      parse: raw => {
        const shape = z.object({ label: z.string() }).safeParse(raw);
        if (!shape.success)
          return { ok: false as const, reason: "output did not match the schema" };
        const label = sanitizeCopy(shape.data.label).replace(/\.$/, "");
        if (!label || wordCount(label) > 4 || label.length > 40)
          return { ok: false as const, reason: "niche label is empty or too long" };
        if (claimsPerformance(label))
          return { ok: false as const, reason: "niche must not claim performance" };
        if (copiesSourceText(label, input.evidence.declaredText))
          return { ok: false as const, reason: "niche copies the biography" };
        const catalog = catalogNiche(label);
        return {
          ok: true as const,
          value: catalog ?? { slug: slugify(label), label },
        };
      },
      invoker: input.invoker,
      timeoutMs: input.timeoutMs ?? 12_000,
      maxTokens: 80,
    });
    return { niche: value, usage };
  } catch {
    return { niche: null, usage: null };
  }
}
