import { resolvePrimaryNicheSlug } from "./primaryNiche";

export type StarterPromptContext = {
  selectedNicheSlugs?: string[] | null;
  businessDescription?: string | null;
  targetAudience?: string | null;
};

export type StarterChip = { label: string; value: string };

const CHIPS_BY_NICHE: Record<string, StarterChip[]> = {
  "business-entrepreneurship": [
    {
      label: "Belief shift that sold my offer",
      value: "The one belief shift that finally made my offer start selling",
    },
    {
      label: "Founder mistakes killing trust",
      value: "3 mistakes I see new founders make on Instagram that kill trust fast",
    },
    {
      label: "Rebuild my brand in 30 days",
      value: "What I would do in my first 30 days if I had to rebuild my personal brand from zero",
    },
  ],
  "make-money-online": [
    {
      label: "Income stream that paid off",
      value: "The income stream I added that finally made my content pay off",
    },
    {
      label: "Myths keeping beginners at zero",
      value: "3 myths keeping beginners stuck at zero online income",
    },
    {
      label: "Hit $5k/month from scratch",
      value: "What I'd focus on first if I had to hit $5k/month again from scratch",
    },
  ],
  "marketing-sales": [
    {
      label: "Sell without feeling salesy",
      value: "The hook formula I use when a Reel needs to sell without feeling salesy",
    },
    {
      label: "Admired but never bought",
      value: "3 content mistakes that make followers admire you but never buy",
    },
    {
      label: "Rebuild lead flow tomorrow",
      value: "How I'd rebuild my lead flow if I lost every client tomorrow",
    },
  ],
  "personal-finance": [
    {
      label: "Money habit that moved the needle",
      value: "The money habit that changed my net worth more than earning more",
    },
    {
      label: "20s finance mistakes",
      value: "3 finance mistakes people in their 20s make on autopilot",
    },
    {
      label: "Before my first investment",
      value: "What I wish someone told me before my first big investment decision",
    },
  ],
  "health-fitness": [
    {
      label: "Training mistake that plateaued me",
      value: "The training mistake that kept me plateaued for months",
    },
    {
      label: "What I stopped doing for fat loss",
      value: "3 things I stopped doing that finally made fat loss feel easier",
    },
    {
      label: "Restart my fitness page",
      value: "What my first 90 days would look like if I had to restart my fitness page",
    },
  ],
  "food-cooking": [
    {
      label: "Weeknight shortcut home cooks miss",
      value:
        "The one weeknight cooking shortcut that saves 20 minutes without sacrificing flavor",
    },
    {
      label: "Chicken mistakes adding 20 minutes",
      value:
        "3 mistakes home cooks make with chicken that add 20 extra minutes for no reason",
    },
    {
      label: "First Reel I'd film in my kitchen",
      value:
        "What I'd film first if I had to grow a Food & Cooking Reel page from zero this month",
    },
  ],
  "restaurants-cafes": [
    {
      label: "Guest moment after seating",
      value: "The guest moment after seating that quietly decides whether people come back",
    },
    {
      label: "BTS details guests feel",
      value: "3 behind-the-scenes details guests feel even when you never mention them",
    },
    {
      label: "Fix repeat visits first",
      value: "What I'd fix first if repeat visits at my place started dropping",
    },
  ],
};

const DEFAULT_CHIPS: StarterChip[] = [
  {
    label: "Insight my audience keeps asking for",
    value: "One insight my audience keeps asking me to explain better",
  },
  {
    label: "Mistakes that slowed my growth",
    value: "3 mistakes I made early that slowed my growth way more than I expected",
  },
  {
    label: "Story that explained what I do",
    value: "The story moment that finally made people understand what I do",
  },
];

function chipsForSlug(slug: string): StarterChip[] | null {
  const chips = CHIPS_BY_NICHE[slug];
  return chips?.length ? chips : null;
}

function displayTopicLabel(ctx: StarterPromptContext | null | undefined): string {
  const slug = resolvePrimaryNicheSlug(ctx ?? {});
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildFallbackChips(ctx: StarterPromptContext | null | undefined): StarterChip[] {
  const topic = displayTopicLabel(ctx);
  const audience = ctx?.targetAudience?.trim();
  const audienceClause = audience ? ` for ${audience}` : "";

  return [
    {
      label: `Underrated ${topic} tip`,
      value: `One underrated ${topic} tip my audience${audienceClause} keeps asking about`,
    },
    {
      label: `Early ${topic} mistakes`,
      value: `3 mistakes I made early in ${topic} that slowed my growth`,
    },
    {
      label: `Story that sold what I do`,
      value: `The story that finally made people understand what I do in ${topic}`,
    },
  ];
}

export function buildIdeaStarterChips(
  ctx: StarterPromptContext | null | undefined
): StarterChip[] {
  const slugs = ctx?.selectedNicheSlugs ?? [];
  for (const slug of slugs) {
    const chips = chipsForSlug(slug);
    if (chips) return chips.slice(0, 3);
  }

  const primarySlug = resolvePrimaryNicheSlug(ctx ?? {});
  const primaryChips = chipsForSlug(primarySlug);
  if (primaryChips) return primaryChips.slice(0, 3);

  if (slugs.length > 0 || ctx?.businessDescription?.trim()) {
    return buildFallbackChips(ctx);
  }

  return DEFAULT_CHIPS;
}

/** @deprecated Use buildIdeaStarterChips for label + value pairs. */
export function buildIdeaStarterPrompts(ctx: StarterPromptContext | null | undefined): string[] {
  return buildIdeaStarterChips(ctx).map((chip) => chip.value);
}

export function buildIdeaStarterHeadline(ctx: StarterPromptContext | null | undefined): string {
  const topic = displayTopicLabel(ctx);
  const audience = ctx?.targetAudience?.trim();
  if (audience) {
    return `What ${topic} Reel should we write for ${audience}?`;
  }
  return `What ${topic} Reel should we write?`;
}

export function buildIdeaStarterPanelHeader(ctx: StarterPromptContext | null | undefined): string {
  const topic = displayTopicLabel(ctx);
  return `Ideas for ${topic}`;
}

export function buildIdeaStarterHeroSubhead(ctx: StarterPromptContext | null | undefined): string {
  const topic = displayTopicLabel(ctx);
  const audience = ctx?.targetAudience?.trim();
  if (audience) {
    return `Turn a ${topic} idea into a script tailored for ${audience}.`;
  }
  return `Turn a ${topic} idea into a ready-to-film script.`;
}
