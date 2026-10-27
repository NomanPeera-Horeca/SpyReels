/**
 * Niche and language suggestions for the goal step.
 *
 * The short model call names the creator's specific niche.
 * catalogNiche is only the broad discovery category. It must not replace
 * that specific label.
 * Language: detected from the profile text. Empty text is not guessed.
 */
import { z } from "zod";
import { inferNicheFromText } from "@shared/creatorContextInference";
import {
  detectContentLanguage,
  type ContentLanguage,
} from "@shared/personalization/contentLanguage";
import {
  contentTaxonomyLabels,
  resolveContentCategory,
} from "@shared/personalization/contentTaxonomy";
import type { NichePayload } from "@shared/personalization/model";
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

export type LanguageSuggestion = ContentLanguage;
export type NicheSuggestion = { slug: string; label: string };

export { detectContentLanguage };

export function catalogNiche(text: string): NicheSuggestion | null {
  const hit = inferNicheFromText(text);
  return hit ? { slug: hit.slug, label: hit.label } : null;
}

/** Labels produced by the discovery catalog. A specific niche must not be one of these. */
const CATALOG_BUCKETS = new Set([
  "business & entrepreneurship",
  "real estate",
  "restaurants & cafes",
  "travel",
  "health & fitness",
  "beauty & skincare",
  "make money online",
  "personal finance",
  "marketing & sales",
]);

export function isCatalogBucket(label: string): boolean {
  return CATALOG_BUCKETS.has(label.trim().toLowerCase());
}

const PLACEHOLDER_NICHE = new Set([
  "unknown",
  "unmatched",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "not sure",
  "unsure",
  "general",
  "other",
  "unspecified",
  "tbd",
  "placeholder",
]);

/** Model tokens such as <UNKNOWN> are not a niche. */
export function isPlaceholderNiche(label: string): boolean {
  const text = label.trim().toLowerCase().replace(/[<>[\]{}"']/g, "").replace(/\s+/g, " ");
  if (!text) return true;
  if (PLACEHOLDER_NICHE.has(text)) return true;
  return !/[a-z0-9]/i.test(label);
}

/**
 * Keep the typed label. Attach a category only when it is already a taxonomy
 * value. This does not classify free text.
 */
export function nichePayloadForSave(input: {
  slug: string;
  label: string;
  categoryLabel?: string | null;
}): NichePayload {
  const label = input.label.trim();
  const category = resolveContentCategory(input.categoryLabel);
  return {
    slug: input.slug,
    label,
    ...(category ? { categoryLabel: category.label } : {}),
  };
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
  properties: {
    label: { type: "string" },
    category: { type: "string" },
  },
  required: ["label", "category"],
  additionalProperties: false,
};

export const NICHE_PROMPT_VERSION = "niche-v5";

export type InferredNiche = NicheSuggestion & {
  categoryLabel: string | null;
  categorySlug: string | null;
};

/**
 * One call names the specific niche and a taxonomy category.
 * Returns null on provider failure or when the evidence does not support a niche.
 * Never rewrites the specific label into a category.
 */
export async function inferNicheLabel(input: {
  evidence: CreatorEvidence;
  /** Confirmed answer supplied after an unclear profile. Not a second model call. */
  userAnswer?: string | null;
  invoker?: LlmInvoker;
  timeoutMs?: number;
}): Promise<{ niche: InferredNiche | null; usage: LlmUsage | null }> {
  try {
    const profileText = input.evidence.snippets.map(s => s.text).join("\n");
    const answer = input.userAnswer?.trim() ?? "";
    const { value, usage } = await callStructured({
      operation: "personalization_niche",
      system: [
        "Name the specific subject this creator makes content about, and choose one broad category.",
        "The label uses 2 to 6 words and names the specific content subject, creative practice, lived experience, skill, or offer evidenced by the profile.",
        "Personal reflections, observations, storytelling, and everyday experiences are valid content subjects. Do not require a profession, teaching credential, or commercial offer.",
        "If several related subjects are connected by the creator\'s own perspective, use one honest concise combined niche rather than picking an unrelated single subtopic or abstaining.",
        "Match the precision of the actual evidence; do not invent a specialty, location, audience, or expertise.",
        "The label is not a biography, a goal, or a call to action.",
        "Do not use a category name as the label.",
        "Return an empty label and category unknown only when no recognizable content subject or creator perspective is evident. Generic vibes, links, or an empty profile alone are not enough.";
        "Business: sells their own product or service, including equipment or services sold to other businesses. A bookkeeping, tax, or accounting firm is Business.",
        "Do not choose Business for a beauty brand, a comedy or fiction account, or a hiking account.",
        "Hospitality: operates a restaurant, cafe, bar, food truck, bakery, or place to stay.",
        "Food: cooks or teaches recipes. Not a venue operator and not a supplier.",
        "Fitness: coached training, exercise, or sport performance. Hiking, trails, and outdoor trips are Outdoors, not Fitness.",
        "Outdoors: hiking, trails, camping, or nature trips.",
        "Beauty: skincare, makeup, or a beauty brand, including the founder who is building that brand.",
        "Finance: personal money for a consumer, such as budgeting or investing. A firm that sells bookkeeping or tax work is Business, not Finance.",
        "Education: teaches a subject or skill. Comedy, stories, magic, and pet videos are Entertainment, not Education.",
        "Entertainment: comedy, fiction, stories, magic, or pet videos made to entertain.",
        "Use unknown when none of these fit. Do not pick a nearby wrong category.",
        `Category must be one of: ${contentTaxonomyLabels().join(", ")}, or unknown.`,
        "No numbers and no performance claims.",
        UNTRUSTED_DATA_RULE,
      ].join("\n"),
      user: [profileText, answer ? `Creator answer: ${answer}` : ""]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1200),
      schemaName: "content_niche",
      schema: NICHE_SCHEMA,
      parse: raw => {
        const shape = z.object({ label: z.string(), category: z.string() }).safeParse(raw);
        if (!shape.success)
          return { ok: false as const, reason: "output did not match the schema" };
        const label = sanitizeCopy(shape.data.label).replace(/\.$/, "").trim();
        const category = resolveContentCategory(shape.data.category);
        // Empty label plus unknown is a real abstention, not a broken answer.
        if (!label && !category) return { ok: true as const, value: null };
        if (!label || wordCount(label) > 6 || label.length > 60)
          return { ok: false as const, reason: "niche label is empty or too long" };
        if (isPlaceholderNiche(label))
          return { ok: false as const, reason: "niche label is a placeholder" };
        if (isCatalogBucket(label) || resolveContentCategory(label))
          return {
            ok: false as const,
            reason: "niche must name the specific subject, not a broad category",
          };
        if (claimsPerformance(label))
          return { ok: false as const, reason: "niche must not claim performance" };
        if (copiesSourceText(label, input.evidence.declaredText))
          return { ok: false as const, reason: "niche copies the biography" };
        return {
          ok: true as const,
          value: {
            slug: category?.slug ?? slugify(label),
            label,
            categoryLabel: category?.label ?? null,
            categorySlug: category?.slug ?? null,
          },
        };
      },
      invoker: input.invoker,
      timeoutMs: input.timeoutMs ?? 12_000,
      maxTokens: 160,
    });
    return { niche: value, usage };
  } catch {
    return { niche: null, usage: null };
  }
}
