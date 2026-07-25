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
];

export const CAROUSEL_TEMPLATES_BY_ID = new Map(
  CAROUSEL_TEMPLATES.map((template) => [template.id, template])
);
