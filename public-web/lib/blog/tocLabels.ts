export const MEEDRO_TOC_LABELS = [
  "Why creators search",
  "What to look for",
  "SpyReels workflow fit",
  "Pricing snapshot",
  "When to stay on Meedro",
  "How to switch",
  "Switching checklist",
  "How SpyReels maps",
  "Common mistakes",
] as const;

const MEEDRO_TOC_MATCHERS: ReadonlyArray<{
  label: (typeof MEEDRO_TOC_LABELS)[number];
  match: RegExp;
}> = [
  { label: "Why creators search", match: /why creators search/i },
  { label: "What to look for", match: /what to look for/i },
  { label: "SpyReels workflow fit", match: /workflow fit|spyreels as a meedro/i },
  { label: "Pricing snapshot", match: /pricing snapshot/i },
  { label: "When to stay on Meedro", match: /when to stay on meedro/i },
  { label: "How to switch", match: /how to switch from meedro/i },
  { label: "Switching checklist", match: /checklist/i },
  { label: "How SpyReels maps", match: /how spyreels maps/i },
  { label: "Common mistakes", match: /common mistakes/i },
];

const MAX_LABEL = 30;

export function truncateTocLabel(text: string, max = MAX_LABEL): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const slice = cleaned.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 12) {
    return slice.slice(0, lastSpace).replace(/[.,:;!?-]+$/, "");
  }
  return slice.trim().replace(/[.,:;!?-]+$/, "");
}

export function shortTocLabel(heading: string, slug: string, _index: number): string {
  if (slug === "guide-meedro-alternative") {
    const hit = MEEDRO_TOC_MATCHERS.find((entry) => entry.match.test(heading));
    if (hit) return hit.label;
  }
  return truncateTocLabel(heading);
}
