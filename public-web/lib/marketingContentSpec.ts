/**
 * Figma Decision 32 / Text Rules B — content-spec character limits.
 * CI fails with the slot name and measured length when a slot exceeds its limit.
 *
 * Never rewrite copy to pass this gate. If owner-approved copy must exceed a limit,
 * add its slot id to PROTECTED_COPY_SLOTS with reason "protected copy, owner-approved".
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

/**
 * Slots that may exceed Figma limits without failing CI.
 * Reason must stay "protected copy, owner-approved".
 */
export const PROTECTED_COPY_SLOTS: Readonly<Record<string, "protected copy, owner-approved">> = {
  "instagram.hero.lead": "protected copy, owner-approved",
  /** Locked Figma title; same string on every breakpoint (34 > cardTitle 30). */
  "shared.integrations.aiTitle": "protected copy, owner-approved",
};

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
    if (slot in PROTECTED_COPY_SLOTS) {
      continue;
    }
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
