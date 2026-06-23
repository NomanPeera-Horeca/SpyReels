export type StarterPromptContext = {
  selectedNicheSlugs?: string[] | null;
  businessDescription?: string | null;
  targetAudience?: string | null;
};

const NICHE_LABELS: Record<string, string> = {
  "marketing-sales": "Marketing & Sales",
  "business-entrepreneurship": "Business & Entrepreneurship",
  "personal-finance": "Personal Finance",
  "make-money-online": "Make Money Online",
  "health-fitness": "Health & Fitness",
  "restaurants-cafes": "Restaurants & Cafes",
};

function nicheLabelFromSlug(slug: string): string {
  return (
    NICHE_LABELS[slug] ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const PROMPTS_BY_NICHE: Record<string, string[]> = {
  "business-entrepreneurship": [
    "The one belief shift that finally made my offer start selling",
    "3 mistakes I see new founders make on Instagram that kill trust fast",
    "What I would do in my first 30 days if I had to rebuild my personal brand from zero",
  ],
  "make-money-online": [
    "The income stream I added that finally made my content pay off",
    "3 myths keeping beginners stuck at zero online income",
    "What I'd focus on first if I had to hit $5k/month again from scratch",
  ],
  "marketing-sales": [
    "The hook formula I use when a Reel needs to sell without feeling salesy",
    "3 content mistakes that make followers admire you but never buy",
    "How I'd rebuild my lead flow if I lost every client tomorrow",
  ],
  "personal-finance": [
    "The money habit that changed my net worth more than earning more",
    "3 finance mistakes people in their 20s make on autopilot",
    "What I wish someone told me before my first big investment decision",
  ],
  "health-fitness": [
    "The training mistake that kept me plateaued for months",
    "3 things I stopped doing that finally made fat loss feel easier",
    "What my first 90 days would look like if I had to restart my fitness page",
  ],
  "restaurants-cafes": [
    "The guest moment after seating that quietly decides whether people come back",
    "3 behind-the-scenes details guests feel even when you never mention them",
    "What I'd fix first if repeat visits at my place started dropping",
  ],
};

const DEFAULT_PROMPTS = [
  "One insight my audience keeps asking me to explain better",
  "3 mistakes I made early that slowed my growth way more than I expected",
  "The story moment that finally made people understand what I do",
];

function nicheNames(slugs: string[]): string[] {
  return slugs.map(nicheLabelFromSlug).filter(Boolean);
}

export function buildIdeaStarterPrompts(ctx: StarterPromptContext | null | undefined): string[] {
  const slugs = ctx?.selectedNicheSlugs ?? [];
  if (slugs.length === 0) return DEFAULT_PROMPTS;

  for (const slug of slugs) {
    const prompts = PROMPTS_BY_NICHE[slug];
    if (prompts?.length) return prompts;
  }

  const names = nicheNames(slugs);
  const topic = names[0] ?? "my niche";
  return [
    `One underrated ${topic} tip my audience asks about all the time`,
    `3 mistakes I made early in ${topic} that slowed my growth`,
    `The story that finally made people understand what I do in ${topic}`,
  ];
}

export function buildIdeaStarterHeadline(ctx: StarterPromptContext | null | undefined): string {
  const names = nicheNames(ctx?.selectedNicheSlugs ?? []);
  if (names.length === 0) return "What Reel should we write?";
  if (names.length === 1) return `What ${names[0]} Reel should we write?`;
  return `What Reel should we write for your ${names.slice(0, 2).join(" and ")} audience?`;
}

const CHIP_LABELS = [
  "Mistakes I made early on",
  "Hot take in my niche",
  "Behind the scenes of my work",
];

/** Short chip labels that fill full niche prompts on first visit. */
export function buildIdeaStarterChips(
  ctx: StarterPromptContext | null | undefined
): Array<{ label: string; value: string }> {
  const prompts = buildIdeaStarterPrompts(ctx).slice(0, 3);
  return prompts.map((value, i) => ({
    label: CHIP_LABELS[i] ?? value.slice(0, 32),
    value,
  }));
}
