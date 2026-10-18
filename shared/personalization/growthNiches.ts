/** "I don't post yet" niche choices (Figma edge-case frame 1078:1011). Shared so the server can validate. */
export const GROWTH_NICHE_OPTIONS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "fitness", label: "Fitness" },
  { slug: "personal_finance", label: "Personal finance" },
  { slug: "business", label: "Business" },
  { slug: "food", label: "Food" },
  { slug: "beauty", label: "Beauty" },
  { slug: "tech_ai", label: "Tech and AI" },
  { slug: "real_estate", label: "Real estate" },
  { slug: "travel", label: "Travel" },
  { slug: "other", label: "Other" },
];

/** Free-text niche typed by the user -> stable slug. */
export function nicheSlugFromLabel(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "other"
  );
}
