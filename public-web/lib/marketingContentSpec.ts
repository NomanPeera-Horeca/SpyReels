/**
 * Figma Decision 32 / Text Rules B — content-spec character limits.
 * CI fails with the slot name and measured length when a slot exceeds its limit.
 */

export const CONTENT_SPEC_LIMITS = {
  /** Hero H1 and section titles */
  heroOrSectionTitle: 50,
  /** Final CTA title */
  finalCta: 55,
  /** Supporting / body / lead / FAQ description */
  supporting: 120,
  /** FAQ question */
  faqQuestion: 70,
  /** Eyebrow / kicker / category label */
  eyebrow: 30,
  /** Primary / secondary button label (word count) */
  buttonWords: 4,
  /** Card / integration title */
  cardTitle: 30,
  /** Card / integration description */
  cardDescription: 70,
} as const;

export type ContentSpecKind =
  | "heroOrSectionTitle"
  | "finalCta"
  | "supporting"
  | "faqQuestion"
  | "eyebrow"
  | "button"
  | "cardTitle"
  | "cardDescription";

export type MarketingCopySlot = {
  slot: string;
  value: string;
  kind: ContentSpecKind;
};

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** Returns failure lines: "slotName: length N > limit M" (or word count for buttons). */
export function marketingCopySpecFailures(slots: readonly MarketingCopySlot[]): string[] {
  const failures: string[] = [];
  for (const { slot, value, kind } of slots) {
    if (kind === "button") {
      const words = wordCount(value);
      const limit = CONTENT_SPEC_LIMITS.buttonWords;
      if (words > limit) {
        failures.push(`${slot}: ${words} words > ${limit} words (${JSON.stringify(value)})`);
      }
      continue;
    }
    const limit = CONTENT_SPEC_LIMITS[kind];
    if (value.length > limit) {
      failures.push(`${slot}: length ${value.length} > ${limit} (${JSON.stringify(value)})`);
    }
  }
  return failures;
}

export function assertMarketingCopySpec(slots: readonly MarketingCopySlot[]): void {
  const failures = marketingCopySpecFailures(slots);
  if (failures.length > 0) {
    throw new Error(
      `Marketing content-spec failed (${failures.length}):\n${failures.map((line) => `  - ${line}`).join("\n")}`
    );
  }
}
