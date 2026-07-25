/**
 * Curated Instagram carousel remake templates.
 * Hand-authored catalog: fixed layout + viral structure; AI rewrites only slot text.
 */

export const CAROUSEL_LAYOUT_IDS = [
  "hook_bold_center",
  "list_item_numbered",
  "cta_bold_center",
] as const;
export type CarouselLayoutId = (typeof CAROUSEL_LAYOUT_IDS)[number];

export const CAROUSEL_SLIDE_ROLES = [
  "hook",
  "problem",
  "list_item",
  "example",
  "cta",
] as const;
export type CarouselSlideRole = (typeof CAROUSEL_SLIDE_ROLES)[number];

export const CAROUSEL_SLOT_ROLES = [
  "kicker",
  "headline",
  "subhead",
  "body",
  "cta_label",
] as const;
export type CarouselSlotRole = (typeof CAROUSEL_SLOT_ROLES)[number];

export type CarouselCharBudget = {
  min: number;
  max: number;
};

export type CarouselTextSlot = {
  id: string;
  role: CarouselSlotRole;
  /** Shown in UI / prompts ("Headline", "Body"). */
  label: string;
  budget: CarouselCharBudget;
  /** Seed / preview copy. AI rewrite anchors to this tone and length. */
  defaultText: string;
};

export type CarouselDesignTokens = {
  fontFamily: {
    display: string;
    body: string;
  };
  colors: {
    background: string;
    foreground: string;
    accent: string;
    muted: string;
  };
  /** Optional extras (border radius, stroke, etc.). */
  radiusPx?: number;
  /** IG carousel default; keep explicit for renderers. */
  aspectRatio: "4:5" | "1:1" | "9:16";
};

export type CarouselSlideSpec = {
  /** Stable within the template, e.g. "slide_01". */
  id: string;
  role: CarouselSlideRole;
  /** Why this beat works in the viral formula (guides text rewrite). */
  viralWhy: string;
  layoutId: CarouselLayoutId;
  slots: CarouselTextSlot[];
};

export type CarouselTemplate = {
  id: string;
  name: string;
  /** Attribution to the original viral carousel or format inspiration. */
  sourceAttribution: string;
  /** Niche-agnostic: what structure this template encodes. */
  description: string;
  design: CarouselDesignTokens;
  slides: CarouselSlideSpec[];
  /** R2 key for a pre-rendered library thumbnail of the whole carousel. */
  previewImageKey?: string;
  /** When false, hidden from the library without deleting. */
  active: boolean;
  /** Library sort order (ascending). */
  sortOrder: number;
};

/** Filled slot text keyed by CarouselTextSlot.id */
export type CarouselSlotValues = Record<string, string>;

export const CAROUSEL_TEMPLATE_FIVE_MISTAKES: CarouselTemplate = {
  id: "five_mistakes_listicle",
  name: "5 Mistakes Listicle",
  sourceAttribution:
    "Inspired by high-performing creator education carousels (listicle format)",
  description:
    "A five-slide listicle: bold hook, three numbered mistake slides, then a save/follow CTA. Structure stays fixed; only slot text is rewritten per niche.",
  active: true,
  sortOrder: 1,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#0F1419",
      foreground: "#F4F1EA",
      accent: "#E8A54B",
      muted: "#9AA3AD",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Stops the scroll with a numbered promise and a stake. Specific count + pain beats a vague tip.",
      layoutId: "hook_bold_center",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Kicker",
          budget: { min: 8, max: 22 },
          defaultText: "CREATORS",
        },
        {
          id: "headline",
          role: "headline",
          label: "Headline",
          budget: { min: 18, max: 48 },
          defaultText: "5 mistakes killing your reach",
        },
        {
          id: "subhead",
          role: "subhead",
          label: "Subhead",
          budget: { min: 28, max: 90 },
          defaultText: "Fix these before you post another Reel this week.",
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy:
        "First list beat should be the most common, painful mistake so the viewer feels seen and keeps swiping.",
      layoutId: "list_item_numbered",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Number",
          budget: { min: 1, max: 3 },
          defaultText: "01",
        },
        {
          id: "headline",
          role: "headline",
          label: "Mistake title",
          budget: { min: 14, max: 40 },
          defaultText: "Opening with a soft hello",
        },
        {
          id: "body",
          role: "body",
          label: "Why it hurts",
          budget: { min: 50, max: 140 },
          defaultText:
            "The first line is the only free impression. Warm-ups get skipped before the value lands.",
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy:
        "Middle items deepen the pattern. Keep each one one idea, concrete enough to screenshot.",
      layoutId: "list_item_numbered",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Number",
          budget: { min: 1, max: 3 },
          defaultText: "02",
        },
        {
          id: "headline",
          role: "headline",
          label: "Mistake title",
          budget: { min: 14, max: 40 },
          defaultText: "Teaching five tips at once",
        },
        {
          id: "body",
          role: "body",
          label: "Why it hurts",
          budget: { min: 50, max: 140 },
          defaultText:
            "One Reel, one lesson. Stacked tips dilute retention and make the CTA feel random.",
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy:
        "Last list beat should be the surprising one (contrarian or overlooked) so the carousel peaks before the CTA.",
      layoutId: "list_item_numbered",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Number",
          budget: { min: 1, max: 3 },
          defaultText: "03",
        },
        {
          id: "headline",
          role: "headline",
          label: "Mistake title",
          budget: { min: 14, max: 40 },
          defaultText: "No reason to save or send",
        },
        {
          id: "body",
          role: "body",
          label: "Why it hurts",
          budget: { min: 50, max: 140 },
          defaultText:
            "If nothing is bookmark-worthy or DM-worthy, the algorithm never gets a second signal.",
        },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy:
        "Close with one clear action plus a soft identity line. Avoid hard sell; ask for save/follow or a DM keyword.",
      layoutId: "cta_bold_center",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "CTA headline",
          budget: { min: 16, max: 48 },
          defaultText: "Save this before your next post",
        },
        {
          id: "subhead",
          role: "subhead",
          label: "CTA subhead",
          budget: { min: 24, max: 80 },
          defaultText: "Follow for weekly structure breakdowns that actually ship.",
        },
        {
          id: "cta_label",
          role: "cta_label",
          label: "Button / chip label",
          budget: { min: 6, max: 22 },
          defaultText: "Follow for more",
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATES: CarouselTemplate[] = [CAROUSEL_TEMPLATE_FIVE_MISTAKES];

export const CAROUSEL_TEMPLATES_BY_ID = new Map(
  CAROUSEL_TEMPLATES.map((template) => [template.id, template])
);
