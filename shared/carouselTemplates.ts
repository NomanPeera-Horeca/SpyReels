/**
 * Curated Instagram carousel remake templates.
 * Hand-authored catalog: fixed layout + viral structure; AI rewrites only slot text.
 */

export const CAROUSEL_LAYOUT_IDS = [
  "hook_bold_center",
  "list_item_numbered",
  "cta_bold_center",
  "hook_photo_top",
  "photo_caption_bubble",
  "notebook_cover",
  "notebook_list_item",
  "list_item_warm_numbered",
  "quote_tweet_card",
  "excuse_grid_4",
  "excuse_split_stack",
  "stat_split_stack",
  "photo_quote_bubbles",
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
  "body_callout",
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

export const CAROUSEL_DECORATION_TYPES = [
  "none",
  "dots",
  "hexagons",
  "lightning",
  "circles",
  "steps",
  "arrow",
] as const;
export type CarouselDecorationType = (typeof CAROUSEL_DECORATION_TYPES)[number];

export const CAROUSEL_BACKGROUND_PATTERNS = ["none", "grid"] as const;
export type CarouselBackgroundPattern = (typeof CAROUSEL_BACKGROUND_PATTERNS)[number];

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
  /** Optional fixed decorative background pattern. Baked into the template, never user-selectable. */
  decoration?: CarouselDecorationType;
  /**
   * Text alignment for layouts that support it (currently hook_bold_center).
   * Undefined defaults to "center" so existing templates stay unchanged.
   */
  textAlign?: "center" | "left";
  /**
   * Optional surface pattern behind slide content (e.g. notebook grid).
   * Undefined / "none" = solid colors.background only.
   */
  backgroundPattern?: CarouselBackgroundPattern;
};

export type CarouselImageSlot = {
  /** Stable within the slide, e.g. "photo". */
  id: string;
  /** Shown in UI ("Photo"). */
  label: string;
  /**
   * Search/generation hint describing what this photo should show, in
   * niche-agnostic terms (e.g. "a person working at a desk"). Used both as
   * a stock photo search query and as an AI image generation prompt seed.
   * Niche context gets appended at resolve time.
   */
  searchQueryHint: string;
  /**
   * Static Pexels (or CDN) URL used for library cards and unreade previews
   * so photo regions are never empty before remake. Remake replaces this
   * with upload / niche-matched Pexels / AI.
   */
  defaultImageUrl?: string;
};

/** Curated Pexels preview URLs for catalog photo slots (display only until remake). */
export const CAROUSEL_STOCK_PREVIEW = {
  headshot:
    "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=800",
  celebrate:
    "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800",
  laptopFrustrated:
    "https://images.pexels.com/photos/4065876/pexels-photo-4065876.jpeg?auto=compress&cs=tinysrgb&w=800",
  morningCoffee:
    "https://images.pexels.com/photos/374885/pexels-photo-374885.jpeg?auto=compress&cs=tinysrgb&w=800",
  athletic:
    "https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg?auto=compress&cs=tinysrgb&w=800",
  analytics:
    "https://images.pexels.com/photos/590022/pexels-photo-590022.jpeg?auto=compress&cs=tinysrgb&w=800",
  deskPro:
    "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=800",
  homeStretch:
    "https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg?auto=compress&cs=tinysrgb&w=800",
  beach:
    "https://images.pexels.com/photos/457882/pexels-photo-457882.jpeg?auto=compress&cs=tinysrgb&w=800",
  coding:
    "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=800",
  cafeCreator:
    "https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=800",
  booksStack:
    "https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=800",
  warmPortrait:
    "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=800",
  warmSmile:
    "https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=800",
  phoneFocus:
    "https://images.pexels.com/photos/607812/pexels-photo-607812.jpeg?auto=compress&cs=tinysrgb&w=800",
  carLifestyle:
    "https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg?auto=compress&cs=tinysrgb&w=800",
  laptopGrind:
    "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=800",
  celebration:
    "https://images.pexels.com/photos/3184192/pexels-photo-3184192.jpeg?auto=compress&cs=tinysrgb&w=800",
  stressedWork:
    "https://images.pexels.com/photos/3756679/pexels-photo-3756679.jpeg?auto=compress&cs=tinysrgb&w=800",
  successPose:
    "https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=800",
  lateNight:
    "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=800",
  finishStrong:
    "https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=800",
} as const;

/**
 * Preview / remake image map.
 * - Single-slot slides: slideId -> url string (legacy)
 * - Multi-slot slides: slideId -> { slotId: url }
 */
export type CarouselImageUrlMap = Record<string, string | Record<string, string>>;

export function normalizeSlideImages(
  entry: string | Record<string, string> | undefined
): { imageUrl?: string; imageUrlsBySlot?: Record<string, string> } {
  if (!entry) return {};
  if (typeof entry === "string") return { imageUrl: entry };
  const values = Object.values(entry);
  return {
    imageUrl: values[0],
    imageUrlsBySlot: entry,
  };
}

/**
 * Preview image map for library cards / unreade dialog: uses each slide's
 * defaultImageUrl. When shareCoverImage is set, the first available URL is
 * copied onto every slide id.
 */
export function resolveTemplatePreviewImageUrls(
  template: CarouselTemplate
): CarouselImageUrlMap {
  const urls: CarouselImageUrlMap = {};
  for (const slide of template.slides) {
    const slots = slide.imageSlots;
    if (!slots?.length) continue;
    if (slots.length === 1) {
      if (slots[0].defaultImageUrl) {
        urls[slide.id] = slots[0].defaultImageUrl;
      }
      continue;
    }
    const bySlot: Record<string, string> = {};
    for (const slot of slots) {
      if (slot.defaultImageUrl) bySlot[slot.id] = slot.defaultImageUrl;
    }
    if (Object.keys(bySlot).length > 0) {
      urls[slide.id] = bySlot;
    }
  }
  if (template.shareCoverImage) {
    const first = Object.values(urls)[0];
    const coverUrl = typeof first === "string" ? first : first ? Object.values(first)[0] : undefined;
    if (coverUrl) {
      for (const slide of template.slides) {
        urls[slide.id] = coverUrl;
      }
    }
  }
  return urls;
}

/**
 * Round-robin assign an upload pool onto template image slots for live preview
 * before remake. Remake replaces this with AI placement.
 */
export function assignImagePoolRoundRobin(
  template: CarouselTemplate,
  pool: string[]
): CarouselImageUrlMap {
  if (pool.length === 0) return {};
  const urls: CarouselImageUrlMap = {};
  let i = 0;
  for (const slide of template.slides) {
    const slots = slide.imageSlots;
    if (!slots?.length) continue;
    if (slots.length === 1) {
      urls[slide.id] = pool[i % pool.length];
      i += 1;
      continue;
    }
    const bySlot: Record<string, string> = {};
    for (const slot of slots) {
      bySlot[slot.id] = pool[i % pool.length];
      i += 1;
    }
    urls[slide.id] = bySlot;
  }
  return urls;
}

export type CarouselSlideSpec = {
  /** Stable within the template, e.g. "slide_01". */
  id: string;
  role: CarouselSlideRole;
  /** Why this beat works in the viral formula (guides text rewrite). */
  viralWhy: string;
  layoutId: CarouselLayoutId;
  slots: CarouselTextSlot[];
  /** Optional photo region(s) for this slide. Most slides have none. */
  imageSlots?: CarouselImageSlot[];
  /**
   * Breakdown/listicle family metadata from Composition IR.
   * Absent on legacy catalog templates. Renderer uses this to pick a treatment.
   */
  composition?: {
    family: "breakdown_listicle" | "story_narrative" | "comparison";
    sequence?: {
      kind: string;
      index: number;
      side?: "problem" | "solution";
    } | null;
    position?: number;
    totalSlides?: number;
    archetype: string;
    treatment: string;
    semanticRole: string;
    listItemIndex: number | null;
  };
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
  /**
   * When true, resolve/upload one cover photo and reuse that same URL on
   * every slide (Style A photo-caption carousels). imageSlots usually only
   * on slide_01; remake + renderer propagate the URL.
   */
  shareCoverImage?: boolean;
  /**
   * When true, user uploads a photo pool (min 2 recommended). Remake AI
   * assigns each pool photo to image slots using slide text context.
   * With an empty pool, each slot uses Pexels → AI as usual.
   */
  imagePoolAssign?: boolean;
};

/** Filled slot text keyed by CarouselTextSlot.id */
export type CarouselSlotValues = Record<string, string>;

export const CAROUSEL_TEMPLATE_FIVE_MISTAKES: CarouselTemplate = {
  id: "five_mistakes_listicle",
  name: "5 Mistakes Listicle",
  sourceAttribution:
    "Inspired by high-performing creator education carousels (listicle format)",
  description:
    "A seven-slide listicle: bold hook, five numbered mistake slides, then a save/follow CTA. Structure stays fixed; only slot text is rewritten per niche.",
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
        "Middle items deepen the pattern. Keep each one one idea, concrete enough to screenshot.",
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
      role: "list_item",
      viralWhy:
        "Fourth beat should reveal a mistake the viewer doesn't know they're making. Specificity here builds authority.",
      layoutId: "list_item_numbered",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Number",
          budget: { min: 1, max: 3 },
          defaultText: "04",
        },
        {
          id: "headline",
          role: "headline",
          label: "Mistake title",
          budget: { min: 14, max: 40 },
          defaultText: "Posting without a clear next step",
        },
        {
          id: "body",
          role: "body",
          label: "Why it hurts",
          budget: { min: 50, max: 140 },
          defaultText:
            "Viewers who finish with nowhere to go just scroll on. Every post needs one obvious next action.",
        },
      ],
    },
    {
      id: "slide_06",
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
          defaultText: "05",
        },
        {
          id: "headline",
          role: "headline",
          label: "Mistake title",
          budget: { min: 14, max: 40 },
          defaultText: "Chasing every trend instead of a system",
        },
        {
          id: "body",
          role: "body",
          label: "Why it hurts",
          budget: { min: 50, max: 140 },
          defaultText:
            "Trend-hopping resets your learning curve every week. A repeatable system compounds instead.",
        },
      ],
    },
    {
      id: "slide_07",
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

export const CAROUSEL_TEMPLATE_CHECKLIST_3_SIGNS: CarouselTemplate = {
  id: "checklist_3_signs",
  name: "3 Signs Checklist",
  sourceAttribution:
    "Inspired by high-performing creator diagnostic/checklist carousels.",
  description:
    "A five-slide checklist: hook, three self-check signs, then a save/follow CTA.",
  active: true,
  sortOrder: 2,
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
      viralWhy: "Diagnostic hooks work because the reader self-identifies before they even swipe. 'Signs you' is a proven pattern.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "SELF-CHECK" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "3 signs you're stuck" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Check these before you blame the algorithm." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First check should be the most common and easiest to self-diagnose.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Sign title", budget: { min: 14, max: 40 }, defaultText: "You post and disappear" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "No reply, no follow-up, no reason to come back. Engagement dies in the first hour without you." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle check deepens the diagnostic pattern with a concrete, screenshot-worthy sign.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Sign title", budget: { min: 14, max: 40 }, defaultText: "Every post looks the same" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "Same format, same pace, same energy. The algorithm and the audience both stop noticing you." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Last check should be the one that surprises even experienced people in the niche.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Sign title", budget: { min: 14, max: 40 }, defaultText: "You're guessing what works" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "No numbers, no pattern-tracking. Without data every post is a fresh guess instead of a repeatable win." },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next post" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly checks that actually move the needle." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_MYTH_5_BUSTED: CarouselTemplate = {
  id: "myth_5_busted",
  name: "5 Myths Busted",
  sourceAttribution:
    "Inspired by high-performing myth-vs-reality creator carousels.",
  description:
    "A seven-slide myth-busting carousel: hook, five myth/reality pairs, then a save/follow CTA.",
  active: true,
  sortOrder: 3,
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
      viralWhy: "Myth-busting hooks trigger curiosity and mild disagreement, both of which drive comments.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "MYTH BUSTING" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "5 myths killing your results" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Most of what you've heard is outdated or just wrong." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First myth should be the most widely believed one so more people feel the 'wait, what?' reaction.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: post more, grow faster" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: volume without a hook just buries your best content under your worst. Quality wins the algorithm." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle myth reinforces the pattern with a specific, disprovable claim.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: you need viral luck" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: consistent reach is a system, not a lottery ticket. Structure beats luck over time." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern; keep each pair concrete and specific to the niche.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: bigger following, bigger sales" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: a small, specific audience that trusts you converts better than a large, generic one." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Fourth myth should be the one that trips up even people who think they know better.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: perfect quality wins" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: raw and timely usually outperforms polished and late. Speed beats perfection online." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Last myth should be the most contrarian, so the carousel peaks right before the CTA.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: algorithms hate small accounts" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: the algorithm rewards engagement rate, not follower count. Small accounts can outperform big ones." },
      ],
    },
    {
      id: "slide_07",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you believe another myth" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly myth-busting that's actually accurate." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_COMPARISON_OLD_VS_NEW: CarouselTemplate = {
  id: "comparison_old_vs_new",
  name: "Old Way vs New Way",
  sourceAttribution:
    "Inspired by high-performing before/after and old-way/new-way creator carousels.",
  description:
    "A six-slide comparison carousel: hook, four old-way/new-way contrasts, then a save/follow CTA.",
  active: true,
  sortOrder: 4,
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
      viralWhy: "Old-way/new-way framing signals a shortcut is coming, which is highly swipeable.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "LEVEL UP" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "The old way vs the new way" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "What used to work is quietly costing you now." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First contrast should be the most universally recognized old habit.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Guessing vs testing" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way guesses what the audience wants. The new way tests small and lets data decide." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle contrast deepens the pattern with a specific, practical example.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "One-size-fits-all vs targeted" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way talks to everyone. The new way speaks directly to the one person most likely to act." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern; keep each contrast concrete and niche-specific.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Reactive vs planned" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way scrambles last minute. The new way runs on a simple plan set the week before." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Last contrast should be the one that reframes the reader's whole approach.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Chasing trends vs owning a system" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way jumps to every new trend. The new way builds one system that compounds over months." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you go the old way again" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly upgrades that actually stick." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_LISTICLE_7_MISTAKES: CarouselTemplate = {
  id: "listicle_7_mistakes",
  name: "7 Mistakes Listicle",
  sourceAttribution:
    "Inspired by high-performing creator education listicle carousels.",
  description:
    "A nine-slide listicle: hook, seven numbered mistake slides, then a save/follow CTA.",
  active: true,
  sortOrder: 5,
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
      viralWhy: "A higher item count (7) signals depth and completeness, good for a save-worthy reference post.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "REFERENCE" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "7 mistakes costing you growth" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Save this. You'll want to check it again next month." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First mistake should be the most common, painful one.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "No clear first line" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "The first line decides if anyone keeps reading. A weak opener kills everything after it." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "Too many ideas per post" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "One idea, one post. Stacking ideas dilutes the takeaway and confuses the algorithm's signal." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "Posting on a random schedule" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "Inconsistent timing makes it harder for the audience and the algorithm to build a habit around you." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "Ignoring your own numbers" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "Your past posts already show what works. Skipping that data means repeating the same mistakes." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "No call to action" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "Viewers who finish with nowhere to go just scroll on. Every post needs one obvious next step." },
      ],
    },
    {
      id: "slide_07",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "06" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "Copying instead of adapting" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "Copying a format without the underlying reason it worked usually just copies the underperformance too." },
      ],
    },
    {
      id: "slide_08",
      role: "list_item",
      viralWhy: "Last mistake should be the surprising one so the carousel peaks before the CTA.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "07" },
        { id: "headline", role: "headline", label: "Mistake title", budget: { min: 14, max: 40 }, defaultText: "Quitting right before it compounds" },
        { id: "body", role: "body", label: "Why it hurts", budget: { min: 50, max: 140 }, defaultText: "Most growth is invisible until it isn't. Stopping at week 8 throws away the momentum week 9 would have used." },
      ],
    },
    {
      id: "slide_09",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next post" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly breakdowns that actually ship." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_CHECKLIST_BEFORE_YOU_START: CarouselTemplate = {
  id: "checklist_before_you_start",
  name: "Before You Start Checklist",
  sourceAttribution:
    "Inspired by high-performing prep/readiness checklist creator carousels.",
  description:
    "A seven-slide checklist: hook, five prep items, then a save/follow CTA.",
  active: true,
  sortOrder: 6,
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
      viralWhy: "'Before you start' framing targets people about to make a decision, a high-intent moment.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "PREP LIST" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Before you start, check this" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Five things to sort out before you spend another dollar." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First item is the most-skipped step that causes the most regret.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Know your real budget" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "Not just the sticker price. Factor in the ongoing costs that show up after the first month." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Get a second opinion" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "One expert's view can miss a blind spot a second one catches immediately." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Check the fine print" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "The details you skip reading are usually the ones that cost you later." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Have a backup plan" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "If the first option falls through, know exactly what you'll do next instead of scrambling." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Last item should be the one people don't expect to see on the list.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Set a hard decision deadline" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "Without a deadline, research turns into stalling. Give yourself a date and commit to it." },
      ],
    },
    {
      id: "slide_07",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next decision" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for checklists that save you from expensive mistakes." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_COMPARISON_THIS_OR_THAT: CarouselTemplate = {
  id: "comparison_this_or_that",
  name: "This or That",
  sourceAttribution:
    "Inspired by high-performing decision-framework creator carousels.",
  description:
    "A six-slide comparison carousel: hook, four this-or-that decision slides, then a save/follow CTA.",
  active: true,
  sortOrder: 7,
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
      viralWhy: "Decision-framework hooks work because the reader immediately tries to guess the answer.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "DECIDE FASTER" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "This or that: pick right every time" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Four common decisions, answered clearly." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First decision should be one nearly everyone in the niche is currently facing.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Decision", budget: { min: 14, max: 40 }, defaultText: "Go broad or go niche?" },
        { id: "body", role: "body", label: "The answer", budget: { min: 50, max: 140 }, defaultText: "Go niche. A smaller, specific audience converts better than a broad one that never quite connects." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Decision", budget: { min: 14, max: 40 }, defaultText: "Post daily or post well?" },
        { id: "body", role: "body", label: "The answer", budget: { min: 50, max: 140 }, defaultText: "Post well. One strong post beats seven mediocre ones for both reach and trust." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Decision", budget: { min: 14, max: 40 }, defaultText: "Chase trends or build a system?" },
        { id: "body", role: "body", label: "The answer", budget: { min: 50, max: 140 }, defaultText: "Build a system. Trends fade in days; a system compounds for months." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Last decision should be the most counterintuitive answer of the set.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Decision", budget: { min: 14, max: 40 }, defaultText: "Fix everything or fix one thing?" },
        { id: "body", role: "body", label: "The answer", budget: { min: 50, max: 140 }, defaultText: "Fix one thing. Trying to fix everything at once means nothing actually gets fixed." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this for your next decision" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly decisions made simple." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_LISTICLE_3_NOBODY_TELLS_YOU: CarouselTemplate = {
  id: "listicle_3_nobody_tells_you",
  name: "3 Things Nobody Tells You",
  sourceAttribution:
    "Inspired by high-performing insider-truth creator carousels.",
  description:
    "A five-slide listicle: hook, three insider-truth items, then a save/follow CTA.",
  active: true,
  sortOrder: 8,
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
      viralWhy: "'Nobody tells you' framing promises insider knowledge, which drives high save rates.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "INSIDER TRUTH" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "3 things nobody tells you" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "The parts everyone skips when they explain how this actually works." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First truth should feel like it's revealing something the reader suspected but never heard confirmed.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "The first 90 days feel like nothing" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Most of the visible results are back-loaded. The quiet early weeks are still doing real work underneath." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle truth deepens the pattern with a specific, relatable detail.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "Most of it isn't glamorous" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The highlight reel skips the repetitive, boring work that actually built the result." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Last truth should be the most surprising or contrarian one.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "You'll want to quit right before it works" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The point of maximum doubt usually lands right before the compounding kicks in." },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this for when you doubt it" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for the parts nobody else tells you." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_MYTH_VS_REALITY_DEEP_DIVE: CarouselTemplate = {
  id: "myth_vs_reality_deep_dive",
  name: "Myth vs Reality",
  sourceAttribution:
    "Inspired by high-performing single-topic myth-vs-reality creator carousels.",
  description:
    "A five-slide myth-busting carousel: hook, three myth/reality pairs on one topic, then a save/follow CTA.",
  active: true,
  sortOrder: 9,
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
      viralWhy: "Narrower single-topic myth-busting builds authority on one specific claim rather than spreading thin.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "SET STRAIGHT" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Let's set the record straight" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "One topic, three myths, the actual truth." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First pair should target the most-repeated version of the myth.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: it's too late to start" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: most people who 'started early' just made more early mistakes. Starting well matters more than starting first." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern with a second widely-held version of the myth.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: you need to go all in" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: small, consistent effort beats a burnout sprint almost every time." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Last pair should be the most contrarian and memorable.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Myth", budget: { min: 14, max: 40 }, defaultText: "Myth: experts never struggle" },
        { id: "body", role: "body", label: "Reality", budget: { min: 50, max: 140 }, defaultText: "Reality: experts just got faster at recognizing and fixing the struggle. It never fully goes away." },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this to set the record straight" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more myths, actually corrected." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_COMPARISON_BEGINNER_VS_PRO: CarouselTemplate = {
  id: "comparison_beginner_vs_pro",
  name: "Beginner vs Pro Checklist",
  sourceAttribution:
    "Inspired by high-performing tier-comparison creator carousels.",
  description:
    "A six-slide comparison carousel: hook, four beginner-vs-pro contrasts, then a save/follow CTA.",
  active: true,
  sortOrder: 10,
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
      viralWhy: "Tier-comparison hooks appeal to aspiration; readers want to see themselves move from one column to the other.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "LEVEL CHECK" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Beginner vs pro: what changes" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Four shifts that separate the two." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First contrast should be the most visible, easiest-to-recognize difference.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Beginners chase tools, pros chase clarity" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "More tools rarely fix an unclear goal. Pros simplify first, then add tools only where needed." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle contrast deepens the pattern with a habit-level difference.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Beginners react, pros review" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Pros build in a weekly review to catch patterns beginners only notice months later." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Beginners copy, pros adapt" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Pros take what works elsewhere and reshape it for their own audience instead of copying it directly." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Last contrast should be the mindset-level shift that ties the others together.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Beginners want speed, pros want a system" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Speed without a system burns out fast. A system keeps producing results long after motivation fades." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this to level up faster" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for the shifts that actually move you forward." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_LISTICLE_4_RED_FLAGS: CarouselTemplate = {
  id: "listicle_4_red_flags",
  name: "4 Red Flags",
  sourceAttribution:
    "Inspired by high-performing warning-sign creator carousels.",
  description:
    "A six-slide listicle: hook, four numbered warning-sign slides, then a save/follow CTA.",
  active: true,
  sortOrder: 11,
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
      viralWhy: "'Red flags' framing triggers protective instinct, driving both saves and shares to warn others.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "WATCH FOR THIS" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "4 red flags to walk away from" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Spot these before they cost you time or money." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First flag should be the most common one people overlook.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Flag title", budget: { min: 14, max: 40 }, defaultText: "Vague answers to direct questions" },
        { id: "body", role: "body", label: "Why it's a flag", budget: { min: 50, max: 140 }, defaultText: "A clear question deserves a clear answer. Dodging specifics is usually hiding something." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle flag deepens the pattern with a specific, relatable scenario.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Flag title", budget: { min: 14, max: 40 }, defaultText: "Pressure to decide immediately" },
        { id: "body", role: "body", label: "Why it's a flag", budget: { min: 50, max: 140 }, defaultText: "Legitimate opportunities can survive you sleeping on it. Urgency is often manufactured, not real." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Flag title", budget: { min: 14, max: 40 }, defaultText: "No proof, just promises" },
        { id: "body", role: "body", label: "Why it's a flag", budget: { min: 50, max: 140 }, defaultText: "Results should be showable. If nothing concrete backs the claim, the claim isn't reliable." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Last flag should be the most surprising one so the carousel peaks before the CTA.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Flag title", budget: { min: 14, max: 40 }, defaultText: "They avoid your worst-case question" },
        { id: "body", role: "body", label: "Why it's a flag", budget: { min: 50, max: 140 }, defaultText: "Anyone confident in what they offer can talk through the downside. Dodging it is the biggest tell." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next decision" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow so you catch the flags before they catch you." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_CHECKLIST_DAILY: CarouselTemplate = {
  id: "checklist_daily",
  name: "Daily Checklist",
  sourceAttribution:
    "Inspired by high-performing daily routine creator carousels.",
  description:
    "An eight-slide checklist: hook, six routine items, then a save/follow CTA.",
  active: true,
  sortOrder: 12,
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
      viralWhy: "Routine reveals are highly save-worthy because they're a repeatable reference, not a one-time read.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "DAILY ROUTINE" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "My daily checklist" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "The six things I check every single day, no exceptions." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First item should be the very first thing done each day, setting a real sequence.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Check yesterday's numbers first" },
        { id: "body", role: "body", label: "Why it's on the list", budget: { min: 50, max: 140 }, defaultText: "Starting with data instead of opinion keeps the whole day grounded in what's actually working." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the sequence.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Reply before you post" },
        { id: "body", role: "body", label: "Why it's on the list", budget: { min: 50, max: 140 }, defaultText: "Replying first keeps the relationship side of the work from getting skipped for new content." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the sequence.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Batch tomorrow's content today" },
        { id: "body", role: "body", label: "Why it's on the list", budget: { min: 50, max: 140 }, defaultText: "Working a day ahead removes the daily panic of what to post right now." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Continue the sequence.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Protect one deep work block" },
        { id: "body", role: "body", label: "Why it's on the list", budget: { min: 50, max: 140 }, defaultText: "One uninterrupted hour beats four hours of constantly switching between tasks." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Continue the sequence.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Review, don't just react" },
        { id: "body", role: "body", label: "Why it's on the list", budget: { min: 50, max: 140 }, defaultText: "A short end-of-day review catches patterns that get missed in the middle of the rush." },
      ],
    },
    {
      id: "slide_07",
      role: "list_item",
      viralWhy: "Last item should be the one that surprises people, showing the routine isn't all hustle.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "06" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "Actually stop for the day" },
        { id: "body", role: "body", label: "Why it's on the list", budget: { min: 50, max: 140 }, defaultText: "A defined stopping point protects the energy needed to show up consistently tomorrow." },
      ],
    },
    {
      id: "slide_08",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this and try it tomorrow" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more routines that actually hold up." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_COMPARISON_MISTAKE_VS_FIX: CarouselTemplate = {
  id: "comparison_mistake_vs_fix",
  name: "Expensive Mistake vs Cheap Fix",
  sourceAttribution:
    "Inspired by high-performing problem/solution creator carousels.",
  description:
    "A six-slide comparison carousel: hook, four expensive-mistake/cheap-fix pairs, then a save/follow CTA.",
  active: true,
  sortOrder: 13,
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
      viralWhy: "Cost-framing hooks tap directly into loss aversion, one of the strongest drivers of saves.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "SAVE MONEY" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Expensive mistake, cheap fix" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Four costly problems and the simple fix for each one." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First pair should be the most universally expensive mistake in the niche.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Mistake", budget: { min: 14, max: 40 }, defaultText: "Buying the biggest option first" },
        { id: "body", role: "body", label: "Cheap fix", budget: { min: 50, max: 140 }, defaultText: "Fix: start with the smallest version that solves today's problem, then upgrade once it's proven." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Mistake", budget: { min: 14, max: 40 }, defaultText: "Skipping the maintenance step" },
        { id: "body", role: "body", label: "Cheap fix", budget: { min: 50, max: 140 }, defaultText: "Fix: a 10-minute weekly check now prevents a costly emergency fix later." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Mistake", budget: { min: 14, max: 40 }, defaultText: "Ignoring the small complaint" },
        { id: "body", role: "body", label: "Cheap fix", budget: { min: 50, max: 140 }, defaultText: "Fix: address the small complaint fast. It's always cheaper than the bigger one it becomes." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Last pair should be the one that surprises even experienced people.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Mistake", budget: { min: 14, max: 40 }, defaultText: "Doing it all yourself to save cash" },
        { id: "body", role: "body", label: "Cheap fix", budget: { min: 50, max: 140 }, defaultText: "Fix: your time has a cost too. Sometimes paying for help is the actual cheap option." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before it costs you" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more fixes that save real money." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_MYTH_6_TRUTHS: CarouselTemplate = {
  id: "myth_6_truths",
  name: "6 Truths About Your Niche",
  sourceAttribution:
    "Inspired by high-performing blunt-truth creator carousels.",
  description:
    "An eight-slide myth-busting carousel: hook, six blunt-truth items, then a save/follow CTA.",
  active: true,
  sortOrder: 14,
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
      viralWhy: "Blunt-truth framing signals no-fluff honesty, which builds trust and drives shares.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "NO FLUFF" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "6 truths nobody wants to say" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Blunt, honest, and probably not what you want to hear." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First truth should be the one that's most commonly sugarcoated.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "It's slower than everyone says" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Highlight reels compress months into a minute. The real timeline is slower and messier than it looks." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "Comparison will slow you down" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Watching everyone else's pace instead of your own is one of the biggest hidden time-wasters." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "Motivation won't carry you" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Systems carry you on the days motivation doesn't show up. Relying on feeling motivated is a plan that fails." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "Not everyone will get it" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Trying to please everyone waters down the message enough that it stops resonating with anyone." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "The boring work is the real work" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The unglamorous, repetitive parts are usually what actually moves the result forward." },
      ],
    },
    {
      id: "slide_07",
      role: "list_item",
      viralWhy: "Last truth should be the most contrarian, so the carousel peaks before the CTA.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "06" },
        { id: "headline", role: "headline", label: "Truth title", budget: { min: 14, max: 40 }, defaultText: "You'll outgrow your first plan" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Your first plan is a starting point, not a permanent structure. Expect to rebuild it as you learn." },
      ],
    },
    {
      id: "slide_08",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this for when you need it straight" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more no-fluff truths." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_CHECKLIST_READY_TO_LAUNCH: CarouselTemplate = {
  id: "checklist_ready_to_launch",
  name: "Ready-to-Launch Checklist",
  sourceAttribution:
    "Inspired by high-performing launch-readiness creator carousels.",
  description:
    "A seven-slide checklist: hook, five launch-readiness items, then a save/follow CTA.",
  active: true,
  sortOrder: 15,
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
      viralWhy: "Launch-readiness checklists target people at a specific, high-intent moment right before a decision.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "LAUNCH READY" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Are you actually ready to launch?" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Five checks before you go live." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First check is the most-skipped step people regret skipping.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "The offer is clear in one sentence" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "If you can't explain it in one sentence, your audience definitely can't either." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "You've tested it on 5 real people" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "Real reactions catch problems your own assumptions never will." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "The first step is dead simple" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "If step one takes real effort, most people quit before they ever get to step two." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Continue the pattern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "You have a plan for the first complaint" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "The first complaint will come. Deciding how you'll respond now beats reacting in a panic later." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Last check should be the one people don't expect to see, showing real launch experience.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Item title", budget: { min: 14, max: 40 }, defaultText: "You're okay if week one is quiet" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "Most launches build slowly. Expecting quiet at first keeps you from quitting too early." },
      ],
    },
    {
      id: "slide_07",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you hit launch" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more checklists before you go live." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_QUOTE_CALLOUT_BOLD: CarouselTemplate = {
  id: "quote_callout_bold",
  name: "Quote Callout",
  sourceAttribution:
    "Inspired by high-performing tweet-style quote carousels (Hormozi-format).",
  description:
    "Tweet-style quote cards: circular avatar, name, verified badge, and handle above a bold left-aligned statement. Flat white background, no decoration. One slide equals one thought. Same avatar on every slide.",
  active: true,
  sortOrder: 39,
  shareCoverImage: true,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#FFFFFF",
      foreground: "#0F1419",
      accent: "#1D9BF0",
      muted: "#536471",
    },
    radiusPx: 0,
    aspectRatio: "1:1",
    decoration: "none",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Open with a sharp accountability quote. The tweet-style header makes the statement feel personal and authoritative.",
      layoutId: "quote_tweet_card",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Quote",
          budget: { min: 40, max: 140 },
          defaultText:
            "The wrong person needs you to stay small so they feel comfortable. The right person pushes you to grow into your best self.",
        },
      ],
      imageSlots: [
        {
          id: "avatar",
          label: "Profile photo",
          searchQueryHint:
            "professional headshot portrait of a confident creator, clean background",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.headshot,
        },
      ],
    },
    {
      id: "slide_02",
      role: "problem",
      viralWhy: "Name the relationship standard in one blunt line readers will screenshot.",
      layoutId: "quote_tweet_card",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Quote",
          budget: { min: 40, max: 140 },
          defaultText:
            "Marry someone who calls you out when they see you're not living up to your full potential.",
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Reframe accountability as love, not criticism.",
      layoutId: "quote_tweet_card",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Quote",
          budget: { min: 40, max: 140 },
          defaultText:
            "Holding your partner accountable to achieving their full potential is the deepest form of love.",
        },
      ],
    },
    {
      id: "slide_04",
      role: "example",
      viralWhy: "Contrast past-focused people with future-focused people in two short beats.",
      layoutId: "quote_tweet_card",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Quote",
          budget: { min: 40, max: 140 },
          defaultText:
            "Get around people who talk about future you. Get away from people who talk about past you.",
        },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with a high-agency line about who belongs in your circle.",
      layoutId: "quote_tweet_card",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Quote",
          budget: { min: 40, max: 140 },
          defaultText:
            "Make friends with people who get mad at you when they see you're not living up to your potential.",
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_PSYCHOLOGY_INSIGHT_MINIMAL: CarouselTemplate = {
  id: "psychology_insight_minimal",
  name: "Uncomfortable Truth (Minimal)",
  sourceAttribution:
    "Inspired by high-performing black-and-white narrative insight carousels (psychology/self-improvement format).",
  description:
    "A five-slide narrative insight carousel: a bold uncomfortable-truth hook, three flowing insight slides (not numbered as a list), then a save/follow CTA. Pure black-on-white, no color accents.",
  active: true,
  sortOrder: 16,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#FFFFFF",
      foreground: "#111111",
      accent: "#111111",
      muted: "#6B7280",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "An uncomfortable-truth hook creates tension the reader wants resolved, and the stark black-and-white design signals 'no fluff' honesty before they read a word.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "UNCOMFORTABLE TRUTH" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Advice that stung but fixed everything" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "This one insight changed how I approach the work." },
      ],
    },
    {
      id: "slide_02",
      role: "problem",
      viralWhy:
        "Name the problem the reader already senses but hasn't said out loud. Recognition builds trust before the reframe lands.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Insight title", budget: { min: 14, max: 40 }, defaultText: "You already know the problem" },
        { id: "body", role: "body", label: "The insight", budget: { min: 50, max: 140 }, defaultText: "Deep down you've sensed it for a while. The discomfort isn't confusion, it's avoidance." },
      ],
    },
    {
      id: "slide_03",
      role: "problem",
      viralWhy:
        "Explain why the discomfort exists. This is the beat that makes the reader feel understood, not lectured.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Insight title", budget: { min: 14, max: 40 }, defaultText: "Comfort was never the goal" },
        { id: "body", role: "body", label: "The insight", budget: { min: 50, max: 140 }, defaultText: "Staying comfortable protects you from failing, but it also protects you from ever finding out what works." },
      ],
    },
    {
      id: "slide_04",
      role: "example",
      viralWhy:
        "Land the reframe with a concrete, specific example so the insight feels earned, not generic.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Insight title", budget: { min: 14, max: 40 }, defaultText: "The reframe that actually worked" },
        { id: "body", role: "body", label: "The insight", budget: { min: 50, max: 140 }, defaultText: "Instead of asking 'how do I feel better,' start asking 'what would this look like if it were easy.'" },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this for the next uncomfortable truth" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more honest reframes, no fluff." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_CHECKLIST_3_SIGNS_MINIMAL: CarouselTemplate = {
  id: "checklist_3_signs_minimal",
  name: "3 Signs Checklist (Minimal)",
  sourceAttribution:
    "Same structure as '3 Signs Checklist', restyled in a pure black-and-white minimal design for a cleaner, no-color aesthetic.",
  description:
    "A five-slide checklist: hook, three self-check signs, then a save/follow CTA. Pure black-on-white, no color accents.",
  active: true,
  sortOrder: 17,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#FFFFFF",
      foreground: "#111111",
      accent: "#111111",
      muted: "#6B7280",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Diagnostic hooks work because the reader self-identifies before they even swipe.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "SELF-CHECK" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "3 signs you're stuck" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Check these before you blame the algorithm." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First check should be the most common and easiest to self-diagnose.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Sign title", budget: { min: 14, max: 40 }, defaultText: "You post and disappear" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "No reply, no follow-up, no reason to come back. Engagement dies in the first hour without you." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle check deepens the diagnostic pattern with a concrete, screenshot-worthy sign.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Sign title", budget: { min: 14, max: 40 }, defaultText: "Every post looks the same" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "Same format, same pace, same energy. The algorithm and the audience both stop noticing you." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Last check should be the one that surprises even experienced people in the niche.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Sign title", budget: { min: 14, max: 40 }, defaultText: "You're guessing what works" },
        { id: "body", role: "body", label: "Why it matters", budget: { min: 50, max: 140 }, defaultText: "No numbers, no pattern-tracking. Without data every post is a fresh guess instead of a repeatable win." },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next post" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly checks that actually move the needle." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_COMPARISON_OLD_VS_NEW_MINIMAL: CarouselTemplate = {
  id: "comparison_old_vs_new_minimal",
  name: "Old Way vs New Way (Minimal)",
  sourceAttribution:
    "Same structure as 'Old Way vs New Way', restyled in a pure black-and-white minimal design for a cleaner, no-color aesthetic.",
  description:
    "A six-slide comparison carousel: hook, four old-way/new-way contrasts, then a save/follow CTA. Pure black-on-white, no color accents.",
  active: true,
  sortOrder: 18,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#FFFFFF",
      foreground: "#111111",
      accent: "#111111",
      muted: "#6B7280",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Old-way/new-way framing signals a shortcut is coming, which is highly swipeable.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "LEVEL UP" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "The old way vs the new way" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "What used to work is quietly costing you now." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First contrast should be the most universally recognized old habit.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Guessing vs testing" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way guesses what the audience wants. The new way tests small and lets data decide." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Middle contrast deepens the pattern with a specific, practical example.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "One-size-fits-all vs targeted" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way talks to everyone. The new way speaks directly to the one person most likely to act." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Continue the pattern; keep each contrast concrete and niche-specific.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Reactive vs planned" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way scrambles last minute. The new way runs on a simple plan set the week before." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Last contrast should be the one that reframes the reader's whole approach.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Contrast", budget: { min: 14, max: 40 }, defaultText: "Chasing trends vs owning a system" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "The old way jumps to every new trend. The new way builds one system that compounds over months." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you go the old way again" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for weekly upgrades that actually stick." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_QA_SINGLE_QUESTION: CarouselTemplate = {
  id: "qa_single_question",
  name: "Answer This One Question",
  sourceAttribution:
    "Inspired by high-performing single-question deep-dive creator carousels.",
  description:
    "A six-slide Q&A carousel: hook posing one specific question, four answer-facet slides, then a save/follow CTA. Navy palette.",
  active: true,
  sortOrder: 19,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#0B1E33",
      foreground: "#F4F1EA",
      accent: "#5B9BD5",
      muted: "#8FA6BD",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "A single sharp question hook creates an open loop the reader wants closed, more compelling than a vague topic tease.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "THE REAL ANSWER" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Why does nothing seem to work?" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "One question, answered properly, no fluff." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First answer-facet should address the most common assumption behind the question.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Facet title", budget: { min: 14, max: 40 }, defaultText: "It's not what you think" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Most people assume the obvious cause. The real answer is usually one step further back." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Second facet deepens the answer with a concrete mechanism, not just a restatement.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Facet title", budget: { min: 14, max: 40 }, defaultText: "Here's the actual mechanism" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "This is the part that actually explains why the pattern keeps repeating." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Third facet addresses the natural follow-up question the reader is now asking.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Facet title", budget: { min: 14, max: 40 }, defaultText: "So what changes now?" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Once you see the real cause, the fix is usually smaller and faster than expected." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Final facet should be the most actionable, giving the reader something to do today.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Facet title", budget: { min: 14, max: 40 }, defaultText: "Start with this today" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "One small change this week beats a perfect plan you never start." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you ask again" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for straight answers to the questions that actually matter." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_HOWTO_STEP_BY_STEP: CarouselTemplate = {
  id: "howto_step_by_step",
  name: "Do This Step by Step",
  sourceAttribution:
    "Inspired by high-performing step-by-step how-to creator carousels.",
  description:
    "A seven-slide how-to carousel: hook, five sequential action steps, then a save/follow CTA. Forest palette.",
  active: true,
  sortOrder: 20,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#0F1F17",
      foreground: "#F4F1EA",
      accent: "#4CAF7D",
      muted: "#8FA69B",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "A step-count promise ('do this in 5 steps') signals a concrete, followable process, not vague advice.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "FOLLOW ALONG" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Do this in 5 simple steps" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "No fluff, just the exact sequence that works." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "Step one should be the easiest possible entry point so nobody feels stuck before starting.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Step number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Step title", budget: { min: 14, max: 40 }, defaultText: "Write down the end goal" },
        { id: "body", role: "body", label: "Instruction", budget: { min: 50, max: 140 }, defaultText: "Be specific. A fuzzy goal produces a fuzzy result every time." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Step two builds directly on step one, keeping the sequence logical.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Step number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Step title", budget: { min: 14, max: 40 }, defaultText: "Break it into 3 milestones" },
        { id: "body", role: "body", label: "Instruction", budget: { min: 50, max: 140 }, defaultText: "Three checkpoints keep momentum visible instead of one distant finish line." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Step three is usually the one people skip - call it out directly.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Step number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Step title", budget: { min: 14, max: 40 }, defaultText: "Set a hard deadline for milestone one" },
        { id: "body", role: "body", label: "Instruction", budget: { min: 50, max: 140 }, defaultText: "Without a date, milestone one quietly becomes 'eventually.'" },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Step four addresses the point where most people quit.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Step number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Step title", budget: { min: 14, max: 40 }, defaultText: "Review progress every Friday" },
        { id: "body", role: "body", label: "Instruction", budget: { min: 50, max: 140 }, defaultText: "A weekly check-in catches drift before it becomes a full derail." },
      ],
    },
    {
      id: "slide_06",
      role: "list_item",
      viralWhy: "Final step should be the payoff step, tying back to the original goal from slide one.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Step number", budget: { min: 1, max: 3 }, defaultText: "05" },
        { id: "headline", role: "headline", label: "Step title", budget: { min: 14, max: 40 }, defaultText: "Repeat the cycle, not the plan" },
        { id: "body", role: "body", label: "Instruction", budget: { min: 50, max: 140 }, defaultText: "The system carries you further than any single plan ever could." },
      ],
    },
    {
      id: "slide_07",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you start" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more step-by-step systems that actually work." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_BEFORE_AFTER_TRANSFORMATION: CarouselTemplate = {
  id: "before_after_transformation",
  name: "My Before and After",
  sourceAttribution:
    "Inspired by high-performing personal-transformation creator carousels.",
  description:
    "A five-slide transformation carousel: hook, before state, turning point, after state, then a save/follow CTA. Warm palette.",
  active: true,
  sortOrder: 21,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#241512",
      foreground: "#F4F1EA",
      accent: "#E07856",
      muted: "#B89A8E",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "A personal transformation claim (not an industry-wide comparison) creates curiosity about a specific, relatable result.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "MY TRANSFORMATION" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "6 months ago I almost quit" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Here's exactly what changed, step by step." },
      ],
    },
    {
      id: "slide_02",
      role: "problem",
      viralWhy: "The 'before' slide needs to be specific and a little vulnerable so it reads as real, not a highlight reel.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Beat title", budget: { min: 14, max: 40 }, defaultText: "Where I actually started" },
        { id: "body", role: "body", label: "Detail", budget: { min: 50, max: 140 }, defaultText: "No plan, no system, just showing up inconsistently and hoping something would click." },
      ],
    },
    {
      id: "slide_03",
      role: "problem",
      viralWhy: "The turning point is the emotional core of the story - name the specific moment or decision.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Beat title", budget: { min: 14, max: 40 }, defaultText: "The moment it shifted" },
        { id: "body", role: "body", label: "Detail", budget: { min: 50, max: 140 }, defaultText: "One specific decision changed everything after that, not motivation, a decision." },
      ],
    },
    {
      id: "slide_04",
      role: "example",
      viralWhy: "The 'after' slide should show the tangible result without overselling - specificity builds credibility.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Beat title", budget: { min: 14, max: 40 }, defaultText: "Where I am now" },
        { id: "body", role: "body", label: "Detail", budget: { min: 50, max: 140 }, defaultText: "Not perfect, but consistent, and consistent beats perfect every time." },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this if you're where I started" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for the real, unfiltered version of this journey." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_OBJECTIONS_HANDLED: CarouselTemplate = {
  id: "objections_handled",
  name: "You Might Be Thinking...",
  sourceAttribution:
    "Inspired by high-performing objection-handling creator carousels.",
  description:
    "A six-slide objection-handling carousel: hook, four objection/rebuttal pairs, then a save/follow CTA. Rose palette.",
  active: true,
  sortOrder: 22,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#241018",
      foreground: "#F4F1EA",
      accent: "#E0668C",
      muted: "#B08A9A",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Naming the reader's unspoken objection directly disarms skepticism before they scroll past.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "LET'S ADDRESS IT" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "You might be thinking this won't work" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Fair. Let's go through the real objections one by one." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First objection should be the most common, most obvious one people already have in mind.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Objection", budget: { min: 14, max: 40 }, defaultText: "\"I don't have time for this\"" },
        { id: "body", role: "body", label: "Rebuttal", budget: { min: 50, max: 140 }, defaultText: "This takes less time than the problem it's currently costing you every week." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Second objection should target a cost or risk concern.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Objection", budget: { min: 14, max: 40 }, defaultText: "\"It's too expensive\"" },
        { id: "body", role: "body", label: "Rebuttal", budget: { min: 50, max: 140 }, defaultText: "Compare it to what doing nothing is already costing, most people never run that math." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Third objection should target self-doubt, the internal version of resistance.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Objection", budget: { min: 14, max: 40 }, defaultText: "\"I've tried things like this before\"" },
        { id: "body", role: "body", label: "Rebuttal", budget: { min: 50, max: 140 }, defaultText: "Most past attempts failed on execution, not the idea itself. This time the system carries you." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Final objection should be the most skeptical, contrarian one, leaving the reader with nothing left to push back on.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "04" },
        { id: "headline", role: "headline", label: "Objection", budget: { min: 14, max: 40 }, defaultText: "\"This is probably just hype\"" },
        { id: "body", role: "body", label: "Rebuttal", budget: { min: 50, max: 140 }, defaultText: "Healthy skepticism is fair, judge it on the actual results, not the pitch." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next objection" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more straight answers to the doubts that hold people back." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_STAT_LED_REVEAL: CarouselTemplate = {
  id: "stat_led_reveal",
  name: "The Numbers Don't Lie",
  sourceAttribution:
    "Inspired by high-performing data-reveal creator carousels.",
  description:
    "A six-slide stat-led carousel: hook, four striking-number reveal slides (the number IS the kicker), then a save/follow CTA. Ocean teal palette.",
  active: true,
  sortOrder: 23,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#0A2323",
      foreground: "#F4F1EA",
      accent: "#3FBFBF",
      muted: "#7FA8A8",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Leading with 'the numbers' framing signals hard evidence is coming, not opinion, which earns attention from skeptical scrollers.",
      layoutId: "hook_bold_center",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "DATA, NOT OPINION" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "The numbers don't lie" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Four stats that change how you should think about this." },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "Note for the remake AI: the kicker slot here is the STAT ITSELF (e.g. '73%', '3X', '10K'), not a sequence number. Lead with the most surprising stat first.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Stat", budget: { min: 1, max: 3 }, defaultText: "73%" },
        { id: "headline", role: "headline", label: "What it means", budget: { min: 14, max: 40 }, defaultText: "of people never revisit this" },
        { id: "body", role: "body", label: "Context", budget: { min: 50, max: 140 }, defaultText: "Once the initial excitement fades, most people quietly stop before the results show up." },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Second stat should reinforce the pattern with a different angle on the same underlying truth.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Stat", budget: { min: 1, max: 3 }, defaultText: "3X" },
        { id: "headline", role: "headline", label: "What it means", budget: { min: 14, max: 40 }, defaultText: "more likely to stick with a system" },
        { id: "body", role: "body", label: "Context", budget: { min: 50, max: 140 }, defaultText: "People with a repeatable system outlast people relying on willpower alone by a wide margin." },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Third stat should be the one that surprises even people already familiar with the topic.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Stat", budget: { min: 1, max: 3 }, defaultText: "90" },
        { id: "headline", role: "headline", label: "What it means", budget: { min: 14, max: 40 }, defaultText: "days is the real average, not 30" },
        { id: "body", role: "body", label: "Context", budget: { min: 50, max: 140 }, defaultText: "The '30 days' number gets repeated everywhere, but the honest average is much longer." },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Final stat should be the most actionable, pointing directly at what to do with this information.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Stat", budget: { min: 1, max: 3 }, defaultText: "1" },
        { id: "headline", role: "headline", label: "What it means", budget: { min: 14, max: 40 }, defaultText: "small change beats ten big ones" },
        { id: "body", role: "body", label: "Context", budget: { min: 50, max: 140 }, defaultText: "One change you actually keep beats an ambitious plan you abandon in week two." },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you argue with the data" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more numbers that actually change how you think." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_PHOTO_STORY_TEST: CarouselTemplate = {
  id: "photo_story_test",
  name: "Real Result Story",
  sourceAttribution:
    "Test template proving photo slot support: upload your own photo, or SpyReels finds/generates one for you.",
  description:
    "A four-slide personal-result story: a photo hook, two story beats, then a save/follow CTA. Upload your own photo for the hook, or let SpyReels find or generate one.",
  active: true,
  sortOrder: 30,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#1A1A2E",
      foreground: "#F4F1EA",
      accent: "#E94560",
      muted: "#9A9AB0",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "A real photo in the hook builds immediate credibility for a personal-result story, more than text alone.",
      layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "REAL RESULT" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "This is what changed" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "One year of consistency, one photo tells the story." },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Photo",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.celebrate,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "First beat sets up where things started, grounding the story before the payoff.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Beat title", budget: { min: 14, max: 40 }, defaultText: "Where I started" },
        { id: "body", role: "body", label: "Detail", budget: { min: 50, max: 140 }, defaultText: "No plan, no system, just showing up inconsistently and hoping something would click." },
      ],
    },
    {
      id: "slide_03",
      role: "example",
      viralWhy: "Second beat delivers the payoff, tying directly back to the photo shown in the hook.",
      layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Beat title", budget: { min: 14, max: 40 }, defaultText: "What actually changed" },
        { id: "body", role: "body", label: "Detail", budget: { min: 50, max: 140 }, defaultText: "One small, repeatable habit did more than any big overhaul ever did." },
      ],
    },
    {
      id: "slide_04",
      role: "cta",
      viralWhy: "Close with one clear action plus a soft identity line.",
      layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this if you're where I started" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for the real, unfiltered version of this journey." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_CONTENT_IGNORED: CarouselTemplate = {
  id: "content_ignored_dots",
  name: "Why Your Content Gets Ignored",
  sourceAttribution: "Inspired by high-performing dot-pattern creator carousels.",
  description: "A five-slide carousel: photo hook, three fix slides, then a save/follow CTA. Dark green, dot pattern.",
  active: true,
  sortOrder: 31,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#0D1610", foreground: "#F4F1EA", accent: "#A8FF60", muted: "#7FA88F" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "dots",
  },
  slides: [
    {
      id: "slide_01", role: "hook",
      viralWhy: "Naming the exact frustration (content being ignored) is a strong pattern-interrupt hook.",
      layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "POSTING, NOBODY CARES?" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Why your content gets ignored" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "The algorithm isn't broken. Here are the fixes that actually move the needle." },
      ],
      imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a person looking frustrated at a laptop", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.laptopFrustrated }],
    },
    { id: "slide_02", role: "list_item", viralWhy: "First fix targets the most common mistake.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Fix title", budget: { min: 14, max: 40 }, defaultText: "Stop selling, start helping" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Nobody likes being sold to constantly. Build trust first, monetize later." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second fix deepens the pattern.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Fix title", budget: { min: 14, max: 40 }, defaultText: "Hook in 3 seconds" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "People decide fast. Your first line must shock, relate, or promise value immediately." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Final fix is the most actionable, testable step.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Fix title", budget: { min: 14, max: 40 }, defaultText: "Test one change this week" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Pick one fix, try it for 5 posts, track what happens. Growth is iteration, not inspiration." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next post" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more fixes that actually move the needle." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_MORNING_HABITS: CarouselTemplate = {
  id: "morning_habits_steps",
  name: "3 Simple Morning Habits",
  sourceAttribution: "Inspired by high-performing step-pattern habit creator carousels.",
  description: "A five-slide carousel: photo hook, three habit slides, then a save/follow CTA. Teal, step pattern.",
  active: true,
  sortOrder: 32,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#0B2B2E", foreground: "#F4F1EA", accent: "#4FD1C5", muted: "#7FA8A0" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "steps",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "A specific habit-count promise with a personal-testing angle builds credibility.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "100 DAYS TESTED" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "3 simple habits for better mornings" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "What I discovered after 100 days of testing. Ready to level up?" },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a calm morning routine, coffee and sunrise", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.morningCoffee }] },
    { id: "slide_02", role: "list_item", viralWhy: "First habit is the easiest to adopt immediately.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Habit title", budget: { min: 14, max: 40 }, defaultText: "Hydrate before caffeine" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Drink water before coffee to boost metabolism, then move for 10 minutes to increase focus." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second habit builds on the morning momentum.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Habit title", budget: { min: 14, max: 40 }, defaultText: "Plan your top 3 priorities" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Time blocking increases productivity and gives your brain clear direction and purpose." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Third habit is the payoff step that ties the morning together.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Habit title", budget: { min: 14, max: 40 }, defaultText: "Master one habit at a time" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Build momentum by mastering one habit first, then add the next. You have everything you need." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before tomorrow morning" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more habits that actually stick." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_WORKOUT_TRANSFORM: CarouselTemplate = {
  id: "workout_transform_lightning",
  name: "What Happens When You Start Moving",
  sourceAttribution: "Inspired by high-performing lightning-pattern fitness creator carousels.",
  description: "A five-slide carousel: photo hook, three benefit slides, then a save/follow CTA. Red/orange, lightning pattern.",
  active: true,
  sortOrder: 33,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#2B0F0F", foreground: "#F4F1EA", accent: "#FF6B4A", muted: "#C99B8F" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "lightning",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "A question hook about a specific transformation invites the reader to imagine their own result.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "STRENGTH FROM WITHIN" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "What happens when you start moving?" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "What if consistent exercise could transform your body and mind?" },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a person running or lifting weights, athletic", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.athletic }] },
    { id: "slide_02", role: "list_item", viralWhy: "First benefit is the most visible, physical payoff.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Benefit title", budget: { min: 14, max: 40 }, defaultText: "Muscles get stronger" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "When you lift regularly, your body transforms. Energy levels skyrocket every single day." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second benefit shifts to the mental payoff, broadening appeal.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Benefit title", budget: { min: 14, max: 40 }, defaultText: "Mental health improves" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Regular movement releases endorphins naturally. Your mind becomes clearer and sharper." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Third beat reframes the goal as sustainable, not overwhelming.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Benefit title", budget: { min: 14, max: 40 }, defaultText: "One workout at a time" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Progress over perfection. Your strength grows with every single session, not all at once." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Start your first workout today" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more ways to build momentum, one session at a time." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_FUNNEL_LEAKS: CarouselTemplate = {
  id: "funnel_leaks_circles",
  name: "Why Your Funnel Isn't Converting",
  sourceAttribution: "Inspired by high-performing light-theme marketing creator carousels.",
  description: "A five-slide carousel: photo hook, three leak-fix slides, then a save/follow CTA. Light mint, soft circles.",
  active: true,
  sortOrder: 34,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#EAF7F0", foreground: "#0F2E23", accent: "#2FBF71", muted: "#5C8A73" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "circles",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "'Invisible leaks' framing creates urgency around a hidden, ongoing cost.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "THE INVISIBLE LEAKS" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Why your funnel isn't converting" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Most funnels fail at the same predictable points. Here's how to fix yours." },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a professional reviewing analytics on a laptop", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.analytics }] },
    { id: "slide_02", role: "list_item", viralWhy: "First leak targets the most common structural mistake.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Leak title", budget: { min: 14, max: 40 }, defaultText: "Too many options" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Every extra button or choice reduces action. Give visitors one clear path forward." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second leak addresses timing, a frequently overlooked factor.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Leak title", budget: { min: 14, max: 40 }, defaultText: "Slow follow-up" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Leads go cold within hours, not days. Fast follow-up shows you value their time." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Third leak reframes small fixes as high-leverage, not overwhelming.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Leak title", budget: { min: 14, max: 40 }, defaultText: "Ignoring the small fixes" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Simplify your landing page and speed up follow-ups today. Small fixes create big wins." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next launch" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more funnel fixes that actually convert." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_CAREER_MOVES: CarouselTemplate = {
  id: "career_moves_hexagons",
  name: "Career Moves Nobody Teaches",
  sourceAttribution: "Inspired by high-performing hexagon-pattern career creator carousels.",
  description: "A five-slide carousel: photo hook, three career-move slides, then a save/follow CTA. Copper/brown, hexagon pattern.",
  active: true,
  sortOrder: 35,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#241512", foreground: "#F4F1EA", accent: "#C97B4A", muted: "#B89A8E" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "hexagons",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "'Nobody teaches' framing promises insider knowledge that competitors won't share.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "BUILD YOUR CASE" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Career moves nobody teaches" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Promotions don't happen to people who wait quietly. Here's what actually gets you noticed." },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a professional working confidently at a desk", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.deskPro }] },
    { id: "slide_02", role: "list_item", viralWhy: "First move is the most overlooked, low-effort habit.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Move title", budget: { min: 14, max: 40 }, defaultText: "Document your wins weekly" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Review time needs receipts, not memories. Managers forget, your documentation doesn't." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second move builds visibility, a common growth blocker.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Move title", budget: { min: 14, max: 40 }, defaultText: "Learn in public" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Teaching others positions you as the go-to. Visibility beats expertise when climbing." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Third move ties the pattern into a consistent daily habit.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Move title", budget: { min: 14, max: 40 }, defaultText: "Build your case daily" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "You're not bragging when you're tracking. You're building the story of why you deserve more." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next review" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more career moves nobody talks about." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_FITNESS_CLEAN: CarouselTemplate = {
  id: "fitness_clean_light",
  name: "Fitness Without the Overwhelm",
  sourceAttribution: "Inspired by high-performing clean light-theme fitness creator carousels.",
  description: "A five-slide carousel: photo hook, three simple-fitness slides, then a save/follow CTA. Clean white, no decoration.",
  active: true,
  sortOrder: 36,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#FFFFFF", foreground: "#16213E", accent: "#2B6CFF", muted: "#6B7A99" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "none",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "Naming the exact feeling ('overwhelm') that stops people from starting builds instant recognition.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "START HERE" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Fitness without the overwhelm" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "You don't need a perfect plan. You need a sustainable one." },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a person stretching or exercising at home, approachable", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.homeStretch }] },
    { id: "slide_02", role: "list_item", viralWhy: "First beat lowers the bar for what counts as a real workout.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Tip title", budget: { min: 14, max: 40 }, defaultText: "Consistency beats intensity" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "10 minutes daily beats 2-hour sessions you skip. Build the habit, let your body adapt." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second beat simplifies a common source of overwhelm: nutrition.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Tip title", budget: { min: 14, max: 40 }, defaultText: "Hit protein first" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Focus on hitting your protein goal before worrying about anything else. Keep it simple." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Third beat closes the loop on comparison, a major source of quitting.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Tip title", budget: { min: 14, max: 40 }, defaultText: "Your body, your pace" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Stop comparing your chapter one to someone's chapter twenty. Focus on being 1% better." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you skip today" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more simple, sustainable fitness." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_TRAVEL_BUCKET_LIST: CarouselTemplate = {
  id: "travel_bucket_list_circles",
  name: "5 Iconic Islands to Visit",
  sourceAttribution: "Inspired by high-performing radial-pattern travel creator carousels.",
  description: "A five-slide carousel: photo hook, three destination slides, then a save/follow CTA. Dark red, radial circles.",
  active: true,
  sortOrder: 37,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#1A0F0F", foreground: "#F4F1EA", accent: "#D9704A", muted: "#B08A7A" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "circles",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "'Gold standard' framing signals a curated, trustworthy list worth saving.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "GOLD STANDARD" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "5 most iconic islands to visit" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "These destinations are topping the charts for a reason." },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a tropical island beach with turquoise water", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.beach }] },
    { id: "slide_02", role: "list_item", viralWhy: "First destination should be the most universally recognized.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Destination", budget: { min: 14, max: 40 }, defaultText: "Bali and Santorini" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Bali blends lush jungles with spiritual temples, while Santorini defines Mediterranean luxury." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second destination targets a different traveler intent (romance/luxury).", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Destination", budget: { min: 14, max: 40 }, defaultText: "The Maldives and Bora Bora" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "For dreamiest turquoise waters and private villa seclusion, both offer a once-in-a-lifetime backdrop." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Final destination broadens appeal beyond typical honeymoon spots.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Destination", budget: { min: 14, max: 40 }, defaultText: "St. Lucia, Caribbean" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "A top honeymoon pick with iconic volcanic peaks, blending relaxation and thrill." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before you book your trip" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more bucket-list destinations worth the trip." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};

export const CAROUSEL_TEMPLATE_CLEAN_CODE: CarouselTemplate = {
  id: "clean_code_circles",
  name: "Why Your Code Is Hard to Maintain",
  sourceAttribution: "Inspired by high-performing corner-circle tech/dev creator carousels.",
  description: "A five-slide carousel: photo hook, three code-quality slides, then a save/follow CTA. Navy/blue, corner circles.",
  active: true,
  sortOrder: 38,
  design: {
    fontFamily: { display: '"Fraunces", Georgia, serif', body: '"DM Sans", system-ui, sans-serif' },
    colors: { background: "#10151F", foreground: "#F4F1EA", accent: "#4FA8E8", muted: "#7FA0C0" },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "circles",
  },
  slides: [
    { id: "slide_01", role: "hook", viralWhy: "Naming a specific pain (hard-to-maintain code) speaks directly to a developer's daily frustration.", layoutId: "hook_photo_top",
      slots: [
        { id: "kicker", role: "kicker", label: "Kicker", budget: { min: 8, max: 22 }, defaultText: "SIMPLE FIXES" },
        { id: "headline", role: "headline", label: "Headline", budget: { min: 18, max: 48 }, defaultText: "Why your code is hard to maintain" },
        { id: "subhead", role: "subhead", label: "Subhead", budget: { min: 28, max: 90 }, defaultText: "Technical debt starts small. Here's how to keep your code readable and scalable." },
      ], imageSlots: [{ id: "photo", label: "Photo", searchQueryHint: "a developer working at a computer with code on screen", defaultImageUrl: CAROUSEL_STOCK_PREVIEW.coding }] },
    { id: "slide_02", role: "list_item", viralWhy: "First fix targets the most common trade-off developers make under pressure.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "01" },
        { id: "headline", role: "headline", label: "Fix title", budget: { min: 14, max: 40 }, defaultText: "Clear code over clever code" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Future you will hate past you for that one-liner magic. Write code that explains itself." },
      ] },
    { id: "slide_03", role: "list_item", viralWhy: "Second fix addresses a habit that's easy to skip under deadline pressure.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "02" },
        { id: "headline", role: "headline", label: "Fix title", budget: { min: 14, max: 40 }, defaultText: "Document your decisions" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Your logic makes sense now, but will it in six months? Document why, not just what." },
      ] },
    { id: "slide_04", role: "list_item", viralWhy: "Final fix reframes the habit as a gift to a future collaborator, including yourself.", layoutId: "list_item_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "03" },
        { id: "headline", role: "headline", label: "Fix title", budget: { min: 14, max: 40 }, defaultText: "Clean code is a gift to future you" },
        { id: "body", role: "body", label: "Explanation", budget: { min: 50, max: 140 }, defaultText: "Prioritize readability today and thank yourself tomorrow." },
      ] },
    { id: "slide_05", role: "cta", viralWhy: "Close with one clear action plus a soft identity line.", layoutId: "cta_bold_center",
      slots: [
        { id: "headline", role: "headline", label: "CTA headline", budget: { min: 16, max: 48 }, defaultText: "Save this before your next refactor" },
        { id: "subhead", role: "subhead", label: "CTA subhead", budget: { min: 24, max: 80 }, defaultText: "Follow for more code quality tips that actually stick." },
        { id: "cta_label", role: "cta_label", label: "Button / chip label", budget: { min: 6, max: 22 }, defaultText: "Follow for more" },
      ] },
  ],
};


export const CAROUSEL_TEMPLATE_PHOTO_CAPTION_WARM: CarouselTemplate = {
  id: "photo_caption_warm",
  name: "Photo Caption Warm",
  sourceAttribution:
    "Inspired by high-performing lifestyle creator carousels with photo backgrounds and white caption bubbles.",
  description:
    "A five-slide carousel where the same personal photo fills every slide behind a white rounded caption bubble. Direct, conversational copy. One photo upload (or auto-find) is shared across all slides.",
  active: true,
  sortOrder: 40,
  shareCoverImage: true,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#FFFFFF",
      foreground: "#111111",
      accent: "#111111",
      muted: "#9CA3AF",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "none",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Open with a personal photo and a bold boxed hook that stops the scroll and promises a short list of systems or tips.",
      layoutId: "photo_caption_bubble",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Caption",
          budget: { min: 40, max: 140 },
          defaultText:
            "If I could go back to year one, I'd ignore everything else and just set up these 3 systems.",
        },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Photo",
          searchQueryHint:
            "candid lifestyle selfie of a creator at a cafe table with a laptop, natural daylight",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "Name system one in plain language so the reader self-identifies.",
      layoutId: "photo_caption_bubble",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Caption",
          budget: { min: 40, max: 140 },
          defaultText:
            "1. A no-incentive management system. Constant rewards for basic behavior create entitlement, not consistency.",
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Name system two with a conversational reframe that feels spoken, not corporate.",
      layoutId: "photo_caption_bubble",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Caption",
          budget: { min: 40, max: 140 },
          defaultText:
            "2. A FULL procedures system. Not a one-week intro, then move on. Repeat until it sticks.",
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Name system three and tease why it matters most.",
      layoutId: "photo_caption_bubble",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Caption",
          budget: { min: 40, max: 140 },
          defaultText:
            "3. A daily meeting rhythm that teaches manners and resets the room before chaos starts.",
        },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy: "Close with a save/follow line while keeping the same photo + bubble look.",
      layoutId: "photo_caption_bubble",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Caption",
          budget: { min: 40, max: 140 },
          defaultText:
            "Having all three in place WILL change your day. Save this and follow for the full systems.",
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_NOTEBOOK_TIPS: CarouselTemplate = {
  id: "notebook_tips_grid",
  name: "Notebook Tips",
  sourceAttribution:
    "Inspired by high-performing notebook and graph-paper tip carousels with highlighter accents.",
  description:
    "A six-slide notebook carousel: grid-paper cover with photo and doodle arrow, four yellow-highlighter tip slides, then a save CTA tip. Cover photo only; content slides are text on grid.",
  active: true,
  sortOrder: 41,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#F3F4F6",
      foreground: "#111111",
      accent: "#FDE047",
      muted: "#6B7280",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "arrow",
    backgroundPattern: "grid",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Grid paper plus a bold how-to headline and a cover photo creates a notebook scrapbook feel that invites a swipe.",
      layoutId: "notebook_cover",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Headline",
          budget: { min: 18, max: 64 },
          defaultText: "How to Read A Book Per Week (Even If You're Busy)",
        },
        {
          id: "subhead",
          role: "subhead",
          label: "Swipe line",
          budget: { min: 6, max: 18 },
          defaultText: "Swipe →",
        },
        {
          id: "kicker",
          role: "kicker",
          label: "Arrow label",
          budget: { min: 8, max: 22 },
          defaultText: "start doing this",
        },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Photo",
          searchQueryHint:
            "person holding a tall stack of colorful books, portrait, clean background",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.booksStack,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "Tip one with highlighter title and a short rule the reader can apply today.",
      layoutId: "notebook_list_item",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "1" },
        {
          id: "headline",
          role: "headline",
          label: "Tip title",
          budget: { min: 14, max: 48 },
          defaultText: "Always carry a book with you",
        },
        {
          id: "body",
          role: "body",
          label: "Tip body",
          budget: { min: 50, max: 160 },
          defaultText:
            "Phone dead time becomes reading time. Keep one book in your bag and one by your bed.",
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Tip two challenges a common habit with a concrete alternative.",
      layoutId: "notebook_list_item",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "2" },
        {
          id: "headline",
          role: "headline",
          label: "Tip title",
          budget: { min: 14, max: 48 },
          defaultText: "Read more than one book at a time",
        },
        {
          id: "body",
          role: "body",
          label: "Tip body",
          budget: { min: 50, max: 160 },
          defaultText:
            "When you get stuck, switch genres. A fiction book and a non-fiction book keep momentum.",
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Tip three with a memorable rule of thumb.",
      layoutId: "notebook_list_item",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "3" },
        {
          id: "headline",
          role: "headline",
          label: "Tip title",
          budget: { min: 14, max: 48 },
          defaultText: "Quit bad books faster",
        },
        {
          id: "body",
          role: "body",
          label: "Tip body",
          budget: { min: 50, max: 160 },
          defaultText:
            "The rule: 100 pages minus your age. Life is too short for books that drain you.",
        },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Tip four reinforces identity and social accountability.",
      layoutId: "notebook_list_item",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "4" },
        {
          id: "headline",
          role: "headline",
          label: "Tip title",
          budget: { min: 14, max: 48 },
          defaultText: "Start a book club with friends",
        },
        {
          id: "body",
          role: "body",
          label: "Tip body",
          budget: { min: 50, max: 160 },
          defaultText:
            "Accountability plus discussion means you actually finish. Pick books that solve a real problem you have.",
        },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy: "Close on the same notebook tip layout so the CTA still feels like part of the list.",
      layoutId: "notebook_list_item",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "5" },
        {
          id: "headline",
          role: "headline",
          label: "Tip title",
          budget: { min: 14, max: 48 },
          defaultText: "Save this and start tonight",
        },
        {
          id: "body",
          role: "body",
          label: "Tip body",
          budget: { min: 50, max: 160 },
          defaultText:
            "Follow for more simple systems that compound. Pick one tip and do it before bed.",
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_DIRECT_AND_WARM: CarouselTemplate = {
  id: "direct_and_warm",
  name: "Direct & Warm",
  sourceAttribution:
    "Inspired by high-performing warm-editorial creator carousels.",
  description:
    "Photo cover and closer with numbered, warm-toned advice slides in between. Kraft-grain content slides, underline accent, optional checkmark callouts, and a hand-drawn arrow.",
  active: true,
  sortOrder: 42,
  design: {
    fontFamily: {
      display: '"Fraunces", Georgia, serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#E8DFD0",
      foreground: "#1A1A1A",
      accent: "#C4785A",
      muted: "#6B6660",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
    decoration: "none",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "A warm photo plus a bold hook statement creates an approachable editorial cover that invites a swipe into numbered advice.",
      layoutId: "hook_photo_top",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Kicker",
          budget: { min: 8, max: 22 },
          defaultText: "REAL TALK",
        },
        {
          id: "headline",
          role: "headline",
          label: "Headline",
          budget: { min: 18, max: 64 },
          defaultText: "One-liners I use when things get tense",
        },
        {
          id: "subhead",
          role: "subhead",
          label: "Subhead",
          budget: { min: 28, max: 90 },
          defaultText: "Calm scripts that de-escalate without giving up the boundary.",
        },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Photo",
          searchQueryHint:
            "warm lifestyle portrait of a calm professional outdoors, soft natural light",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.warmPortrait,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "Open with a recognition line that names the emotion before the ask.",
      layoutId: "list_item_warm_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "1" },
        {
          id: "headline",
          role: "headline",
          label: "Heading",
          budget: { min: 14, max: 48 },
          defaultText: "Name the nerve, then invite",
        },
        {
          id: "body",
          role: "body",
          label: "Body",
          budget: { min: 50, max: 160 },
          defaultText:
            "I can see I hit a nerve. Care to share what's going on so we can address it?",
        },
        {
          id: "callout",
          role: "body_callout",
          label: "Callout list",
          budget: { min: 20, max: 120 },
          defaultText: "Stay curious\nSkip the lecture\nAsk one clear question",
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Separate disagreement from disrespect so the boundary feels fair.",
      layoutId: "list_item_warm_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "2" },
        {
          id: "headline",
          role: "headline",
          label: "Heading",
          budget: { min: 14, max: 48 },
          defaultText: "Disagree without unkind",
        },
        {
          id: "body",
          role: "body",
          label: "Body",
          budget: { min: 50, max: 160 },
          defaultText: "It's okay to disagree. It's not okay to be unkind.",
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Offer a reset beat so both people can re-enter the conversation.",
      layoutId: "list_item_warm_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "3" },
        {
          id: "headline",
          role: "headline",
          label: "Heading",
          budget: { min: 14, max: 48 },
          defaultText: "Pause, then try again",
        },
        {
          id: "body",
          role: "body",
          label: "Body",
          budget: { min: 50, max: 160 },
          defaultText: "Let's both take a minute, then try again.",
        },
        {
          id: "callout",
          role: "body_callout",
          label: "Callout list",
          budget: { min: 20, max: 120 },
          defaultText: "Step away briefly\nCome back with one ask\nKeep the tone even",
        },
      ],
    },
    {
      id: "slide_05",
      role: "list_item",
      viralWhy: "Close the list with a collaboration frame instead of a power struggle.",
      layoutId: "list_item_warm_numbered",
      slots: [
        { id: "kicker", role: "kicker", label: "Number", budget: { min: 1, max: 3 }, defaultText: "4" },
        {
          id: "headline",
          role: "headline",
          label: "Heading",
          budget: { min: 14, max: 48 },
          defaultText: "Argue with me or work with me",
        },
        {
          id: "body",
          role: "body",
          label: "Body",
          budget: { min: 50, max: 160 },
          defaultText:
            "Do you want to argue with me or do you want to work with me to figure this out?",
        },
      ],
    },
    {
      id: "slide_06",
      role: "cta",
      viralWhy:
        "Photo closer with a soft CTA keeps the warm editorial feel and invites a comment or save.",
      layoutId: "hook_photo_top",
      slots: [
        {
          id: "kicker",
          role: "kicker",
          label: "Kicker",
          budget: { min: 8, max: 22 },
          defaultText: "WANT MORE?",
        },
        {
          id: "headline",
          role: "headline",
          label: "Headline",
          budget: { min: 16, max: 48 },
          defaultText: "Comment PROMPTS for the full list",
        },
        {
          id: "subhead",
          role: "subhead",
          label: "Subhead",
          budget: { min: 24, max: 80 },
          defaultText: "Save this for the next hard conversation.",
        },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Photo",
          searchQueryHint:
            "warm candid portrait of a creator smiling softly, natural indoor light",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.warmSmile,
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_EXCUSE_REWRITE: CarouselTemplate = {
  id: "excuse_rewrite",
  name: "Excuse Rewrite",
  sourceAttribution:
    "Inspired by high-performing creator carousels that strike through excuses and reframe them.",
  description:
    "Cover is a 2x2 photo grid with strikethrough excuses. Content slides split top (B&W + excuse) and bottom (color + reframe). Upload a photo pool for AI placement, or leave empty for Pexels/AI.",
  active: true,
  sortOrder: 43,
  imagePoolAssign: true,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#000000",
      foreground: "#FFFFFF",
      accent: "#FFFFFF",
      muted: "#2A2A2A",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Four struck-through excuses on a 2x2 photo grid stop the scroll and promise a reframe pattern.",
      layoutId: "excuse_grid_4",
      slots: [
        {
          id: "excuse_tl",
          role: "headline",
          label: "Excuse top left",
          budget: { min: 8, max: 36 },
          defaultText: "I don't have experience.",
        },
        {
          id: "excuse_tr",
          role: "headline",
          label: "Excuse top right",
          budget: { min: 8, max: 36 },
          defaultText: "I'm too busy.",
        },
        {
          id: "excuse_bl",
          role: "headline",
          label: "Excuse bottom left",
          budget: { min: 8, max: 36 },
          defaultText: "I'm stressed.",
        },
        {
          id: "excuse_br",
          role: "headline",
          label: "Excuse bottom right",
          budget: { min: 8, max: 36 },
          defaultText: "I procrastinated.",
        },
      ],
      imageSlots: [
        {
          id: "photo_tl",
          label: "Excuse photo top left",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.stressedWork,
        },
        {
          id: "photo_tr",
          label: "Excuse photo top right",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.phoneFocus,
        },
        {
          id: "photo_bl",
          label: "Excuse photo bottom left",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.lateNight,
        },
        {
          id: "photo_br",
          label: "Excuse photo bottom right",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.carLifestyle,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy:
        "Top half kills the excuse in grayscale; bottom half delivers the confident reframe in color.",
      layoutId: "excuse_split_stack",
      slots: [
        {
          id: "excuse",
          role: "headline",
          label: "Excuse",
          budget: { min: 8, max: 40 },
          defaultText: "I don't have experience.",
        },
        {
          id: "reframe",
          role: "body",
          label: "Reframe",
          budget: { min: 8, max: 40 },
          defaultText: "I'll do what I can.",
        },
      ],
      imageSlots: [
        {
          id: "photo_before",
          label: "Excuse photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.laptopGrind,
        },
        {
          id: "photo_after",
          label: "Reframe photo (after / win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.successPose,
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Second excuse/reframe pair deepens the pattern and keeps swipes going.",
      layoutId: "excuse_split_stack",
      slots: [
        {
          id: "excuse",
          role: "headline",
          label: "Excuse",
          budget: { min: 8, max: 40 },
          defaultText: "I'm stressed.",
        },
        {
          id: "reframe",
          role: "body",
          label: "Reframe",
          budget: { min: 8, max: 40 },
          defaultText: "I'm building something.",
        },
      ],
      imageSlots: [
        {
          id: "photo_before",
          label: "Excuse photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.stressedWork,
        },
        {
          id: "photo_after",
          label: "Reframe photo (after / win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.celebration,
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Third rewrite keeps momentum with a slightly softer, relatable excuse.",
      layoutId: "excuse_split_stack",
      slots: [
        {
          id: "excuse",
          role: "headline",
          label: "Excuse",
          budget: { min: 8, max: 40 },
          defaultText: "I procrastinated.",
        },
        {
          id: "reframe",
          role: "body",
          label: "Reframe",
          budget: { min: 8, max: 40 },
          defaultText: "I'll get it done late.",
        },
      ],
      imageSlots: [
        {
          id: "photo_before",
          label: "Excuse photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.lateNight,
        },
        {
          id: "photo_after",
          label: "Reframe photo (after / win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.finishStrong,
        },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy:
        "Final rewrite doubles as a soft CTA: last excuse dies, identity reframe invites a follow or save.",
      layoutId: "excuse_split_stack",
      slots: [
        {
          id: "excuse",
          role: "headline",
          label: "Excuse",
          budget: { min: 8, max: 40 },
          defaultText: "I'm not ready yet.",
        },
        {
          id: "reframe",
          role: "body",
          label: "Reframe",
          budget: { min: 8, max: 40 },
          defaultText: "I start messy and learn.",
        },
      ],
      imageSlots: [
        {
          id: "photo_before",
          label: "Excuse photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
        },
        {
          id: "photo_after",
          label: "Reframe photo (after / win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.deskPro,
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_AVERAGE_VS_NOT: CarouselTemplate = {
  id: "average_vs_not",
  name: "Average vs Not",
  sourceAttribution:
    "Inspired by high-performing creator carousels that contrast average timelines with impatient expectations.",
  description:
    "Four color split slides: top states the average truth, bottom punches with Not Y. Closer is a full-bleed photo with two white quote bubbles. Optional photo pool with AI placement.",
  active: true,
  sortOrder: 44,
  imagePoolAssign: true,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#000000",
      foreground: "#FFFFFF",
      accent: "#FFFFFF",
      muted: "#2A2A2A",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Opens with a hard average-age fact vs an impatient Not line to stop the scroll.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "average",
          role: "headline",
          label: "Average line",
          budget: { min: 18, max: 56 },
          defaultText: "The average millionaire is 57",
        },
        {
          id: "not_line",
          role: "body",
          label: "Not line",
          budget: { min: 5, max: 28 },
          defaultText: "Not 27",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Success outcome photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.successPose,
        },
        {
          id: "photo_bottom",
          label: "Early grind photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.phoneFocus,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy: "Second average vs Not pair reinforces the patience pattern.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "average",
          role: "headline",
          label: "Average line",
          budget: { min: 18, max: 56 },
          defaultText: "The average CEO is 55",
        },
        {
          id: "not_line",
          role: "body",
          label: "Not line",
          budget: { min: 5, max: 28 },
          defaultText: "Not 25",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Success outcome photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.deskPro,
        },
        {
          id: "photo_bottom",
          label: "Early grind photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.stressedWork,
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy: "Switches from age to mastery time to keep the carousel fresh.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "average",
          role: "headline",
          label: "Average line",
          budget: { min: 18, max: 64 },
          defaultText: "The average expert spends 10 years learning",
        },
        {
          id: "not_line",
          role: "body",
          label: "Not line",
          budget: { min: 5, max: 28 },
          defaultText: "Not 10 weeks",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Success outcome photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.homeStretch,
        },
        {
          id: "photo_bottom",
          label: "Early grind photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.booksStack,
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy: "Business profit timeline lands the patience message before the closer.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "average",
          role: "headline",
          label: "Average line",
          budget: { min: 18, max: 64 },
          defaultText: "The average business turns real profit after 3 years",
        },
        {
          id: "not_line",
          role: "body",
          label: "Not line",
          budget: { min: 5, max: 28 },
          defaultText: "Not 3 months",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Success outcome photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.celebration,
        },
        {
          id: "photo_bottom",
          label: "Early grind photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.laptopGrind,
        },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy:
        "Full-bleed closer with a patience quote and a soft share CTA in white bubbles.",
      layoutId: "photo_quote_bubbles",
      slots: [
        {
          id: "quote",
          role: "headline",
          label: "Quote",
          budget: { min: 40, max: 140 },
          defaultText:
            "People overestimate what they can do in 1 year and underestimate what they can do in 5.",
        },
        {
          id: "cta_label",
          role: "cta_label",
          label: "CTA",
          budget: { min: 12, max: 48 },
          defaultText: "Keep grinding. Share if you agree",
        },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Closer photo (win / reflection)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.beach,
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATE_SAME_SITUATION: CarouselTemplate = {
  id: "same_situation",
  name: "Same Situation",
  sourceAttribution:
    "Inspired by high-performing creator carousels that show two people facing the same constraint with opposite choices.",
  description:
    "Color split slides: top is the soft excuse or condition, bottom echoes So did he / So was he with the disciplined choice. Closer uses two white quote bubbles. Optional photo pool with AI placement.",
  active: true,
  sortOrder: 45,
  imagePoolAssign: true,
  design: {
    fontFamily: {
      display: '"DM Sans", system-ui, sans-serif',
      body: '"DM Sans", system-ui, sans-serif',
    },
    colors: {
      background: "#000000",
      foreground: "#FFFFFF",
      accent: "#FFFFFF",
      muted: "#2A2A2A",
    },
    radiusPx: 0,
    aspectRatio: "4:5",
  },
  slides: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy:
        "Same time constraint, two choices. Top names the limit; bottom must stay a short So did he echo.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "setup",
          role: "headline",
          label: "Setup (excuse / condition)",
          budget: { min: 12, max: 48 },
          defaultText: "He only had 30 minutes.",
        },
        {
          id: "echo",
          role: "body",
          label: "Echo (So did / So was)",
          budget: { min: 8, max: 24 },
          defaultText: "So did he.",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Excuse / comfort photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.lateNight,
        },
        {
          id: "photo_bottom",
          label: "Discipline photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.deskPro,
        },
      ],
    },
    {
      id: "slide_02",
      role: "list_item",
      viralWhy:
        "Same feeling, different outlet. Keep bottom as a short So was he parallel.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "setup",
          role: "headline",
          label: "Setup (excuse / condition)",
          budget: { min: 12, max: 48 },
          defaultText: "He was feeling stressed.",
        },
        {
          id: "echo",
          role: "body",
          label: "Echo (So did / So was)",
          budget: { min: 8, max: 24 },
          defaultText: "So was he.",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Excuse / comfort photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.stressedWork,
        },
        {
          id: "photo_bottom",
          label: "Discipline photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.athletic,
        },
      ],
    },
    {
      id: "slide_03",
      role: "list_item",
      viralWhy:
        "Same long day, opposite finish. Bottom stays a short So did he echo.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "setup",
          role: "headline",
          label: "Setup (excuse / condition)",
          budget: { min: 12, max: 48 },
          defaultText: "He had a long day.",
        },
        {
          id: "echo",
          role: "body",
          label: "Echo (So did / So was)",
          budget: { min: 8, max: 24 },
          defaultText: "So did he.",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Excuse / comfort photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.laptopFrustrated,
        },
        {
          id: "photo_bottom",
          label: "Discipline photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.finishStrong,
        },
      ],
    },
    {
      id: "slide_04",
      role: "list_item",
      viralWhy:
        "Same setback, opposite recovery. Bottom must stay a short So did he echo.",
      layoutId: "stat_split_stack",
      slots: [
        {
          id: "setup",
          role: "headline",
          label: "Setup (excuse / condition)",
          budget: { min: 12, max: 48 },
          defaultText: "He hit a setback.",
        },
        {
          id: "echo",
          role: "body",
          label: "Echo (So did / So was)",
          budget: { min: 8, max: 24 },
          defaultText: "So did he.",
        },
      ],
      imageSlots: [
        {
          id: "photo_top",
          label: "Excuse / comfort photo (before)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.laptopGrind,
        },
        {
          id: "photo_bottom",
          label: "Discipline photo (win)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
        },
      ],
    },
    {
      id: "slide_05",
      role: "cta",
      viralWhy:
        "Closer names the shared struggle then pushes show up anyway with a soft share CTA.",
      layoutId: "photo_quote_bubbles",
      slots: [
        {
          id: "quote",
          role: "headline",
          label: "Quote",
          budget: { min: 24, max: 90 },
          defaultText: "We all deal with the same struggles.",
        },
        {
          id: "cta_label",
          role: "cta_label",
          label: "CTA",
          budget: { min: 12, max: 48 },
          defaultText: "Show up anyway. Share if you agree",
        },
      ],
      imageSlots: [
        {
          id: "photo",
          label: "Closer photo (win / resolve)",
          searchQueryHint: "",
          defaultImageUrl: CAROUSEL_STOCK_PREVIEW.warmPortrait,
        },
      ],
    },
  ],
};

export const CAROUSEL_TEMPLATES: CarouselTemplate[] = [
  CAROUSEL_TEMPLATE_FIVE_MISTAKES,
  CAROUSEL_TEMPLATE_CHECKLIST_3_SIGNS,
  CAROUSEL_TEMPLATE_MYTH_5_BUSTED,
  CAROUSEL_TEMPLATE_COMPARISON_OLD_VS_NEW,
  CAROUSEL_TEMPLATE_LISTICLE_7_MISTAKES,
  CAROUSEL_TEMPLATE_CHECKLIST_BEFORE_YOU_START,
  CAROUSEL_TEMPLATE_COMPARISON_THIS_OR_THAT,
  CAROUSEL_TEMPLATE_LISTICLE_3_NOBODY_TELLS_YOU,
  CAROUSEL_TEMPLATE_MYTH_VS_REALITY_DEEP_DIVE,
  CAROUSEL_TEMPLATE_COMPARISON_BEGINNER_VS_PRO,
  CAROUSEL_TEMPLATE_LISTICLE_4_RED_FLAGS,
  CAROUSEL_TEMPLATE_CHECKLIST_DAILY,
  CAROUSEL_TEMPLATE_COMPARISON_MISTAKE_VS_FIX,
  CAROUSEL_TEMPLATE_MYTH_6_TRUTHS,
  CAROUSEL_TEMPLATE_CHECKLIST_READY_TO_LAUNCH,
  CAROUSEL_TEMPLATE_PSYCHOLOGY_INSIGHT_MINIMAL,
  CAROUSEL_TEMPLATE_CHECKLIST_3_SIGNS_MINIMAL,
  CAROUSEL_TEMPLATE_COMPARISON_OLD_VS_NEW_MINIMAL,
  CAROUSEL_TEMPLATE_QA_SINGLE_QUESTION,
  CAROUSEL_TEMPLATE_HOWTO_STEP_BY_STEP,
  CAROUSEL_TEMPLATE_BEFORE_AFTER_TRANSFORMATION,
  CAROUSEL_TEMPLATE_OBJECTIONS_HANDLED,
  CAROUSEL_TEMPLATE_STAT_LED_REVEAL,
  CAROUSEL_TEMPLATE_PHOTO_STORY_TEST,
  CAROUSEL_TEMPLATE_CONTENT_IGNORED,
  CAROUSEL_TEMPLATE_MORNING_HABITS,
  CAROUSEL_TEMPLATE_WORKOUT_TRANSFORM,
  CAROUSEL_TEMPLATE_FUNNEL_LEAKS,
  CAROUSEL_TEMPLATE_CAREER_MOVES,
  CAROUSEL_TEMPLATE_FITNESS_CLEAN,
  CAROUSEL_TEMPLATE_TRAVEL_BUCKET_LIST,
  CAROUSEL_TEMPLATE_CLEAN_CODE,
  CAROUSEL_TEMPLATE_QUOTE_CALLOUT_BOLD,
  CAROUSEL_TEMPLATE_PHOTO_CAPTION_WARM,
  CAROUSEL_TEMPLATE_NOTEBOOK_TIPS,
  CAROUSEL_TEMPLATE_DIRECT_AND_WARM,
  CAROUSEL_TEMPLATE_EXCUSE_REWRITE,
  CAROUSEL_TEMPLATE_AVERAGE_VS_NOT,
  CAROUSEL_TEMPLATE_SAME_SITUATION,
];

export const CAROUSEL_TEMPLATES_BY_ID = new Map(
  CAROUSEL_TEMPLATES.map((template) => [template.id, template])
);
