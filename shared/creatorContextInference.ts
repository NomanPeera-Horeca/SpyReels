const NICHE_RULES: Array<{ pattern: RegExp; slug: string; label: string }> = [
  {
    pattern:
      /\b(real estate|realtor|mortgage|home buyer|first.?time|first home|buying (a )?home|buying home|home buying|listing|open house)\b/i,
    slug: "real-estate",
    label: "Real Estate",
  },
  {
    pattern: /\b(restaurant|cafe|diner|bar|food|chef|menu|hospitality)\b/i,
    slug: "restaurants-cafes",
    label: "Restaurants & Cafes",
  },
  { pattern: /\b(hotel|resort|airbnb|bnb|travel|tourist)\b/i, slug: "travel", label: "Travel" },
  { pattern: /\b(fitness|workout|gym|health)\b/i, slug: "health-fitness", label: "Health & Fitness" },
  { pattern: /\b(skincare|beauty|makeup|acne)\b/i, slug: "beauty-skincare", label: "Beauty & Skincare" },
  {
    pattern: /\b(coach|freelanc|business|entrepreneur|startup)\b/i,
    slug: "business-entrepreneurship",
    label: "Business & Entrepreneurship",
  },
  { pattern: /\b(money|income|side hustle|make money)\b/i, slug: "make-money-online", label: "Make Money Online" },
  { pattern: /\b(finance|invest|budget|saving)\b/i, slug: "personal-finance", label: "Personal Finance" },
  { pattern: /\b(marketing|ads|social media growth)\b/i, slug: "marketing-sales", label: "Marketing & Sales" },
  {
    pattern: /\b(offer|selling|sell more|belief shift|mindset shift|conversion|clients?|leads?)\b/i,
    slug: "marketing-sales",
    label: "Marketing & Sales",
  },
];

const HOSPITALITY_RE =
  /\b(guest|hotel|resort|hospitality|check-in|checkout|restaurant|cafe|diner|venue|airbnb|bnb|stay|lodging|traveler|traveller|tourist)\b/i;

const DUAL_AUDIENCE_HEDGE_RE =
  /\b(either .+ or|guests or operators|operators or guests|owners or customers|customers or owners|peers or customers|both audiences|aspiring .+ or .+ seeking)\b/i;

const PERSONAL_CREATOR_STORY_RE =
  /\b(i made|my mistake|mistakes i|what i learned|when i|how i|growing my|built my|scaled my|my page|my account|my channel|my brand)\b/i;

export type InferredNiche = { slug: string; label: string };
export type InferredAudience = {
  id: string;
  label: string;
  type: "b2c" | "b2b" | "creator_peers" | "other";
};

export function inferNicheFromText(text: string): InferredNiche | null {
  const t = text.trim();
  if (!t) return null;
  for (const rule of NICHE_RULES) {
    if (rule.pattern.test(t)) return { slug: rule.slug, label: rule.label };
  }
  if (/\bmy (restaurant|cafe|bar|hotel|resort|venue|shop|salon|gym|studio|clinic)\b/i.test(t)) {
    return { slug: "restaurants-cafes", label: "Restaurants & Cafes" };
  }
  return null;
}

export function inferAudienceFromText(text: string): InferredAudience | null {
  const t = text.trim();
  if (!t) return null;

  if (
    /\b(first.?time(\s+home)?\s*(buyer|buyers)?|first home buyer|home buyer|buying (a )?home|buying home|new homeowner)\b/i.test(
      t
    )
  ) {
    return {
      id: "customers",
      label: "First-time home buyers",
      type: "b2c",
    };
  }

  if (PERSONAL_CREATOR_STORY_RE.test(t)) {
    return {
      id: "creator_peers",
      label: "Other creators or beginners in my niche",
      type: "creator_peers",
    };
  }

  if (/\b(my offer|start selling|made my offer|belief shift|selling more|get clients)\b/i.test(t)) {
    return {
      id: "customers",
      label: "My customers or audience",
      type: "b2c",
    };
  }

  if (HOSPITALITY_RE.test(t) || /\bmy (restaurant|cafe|bar|hotel|resort|venue)\b/i.test(t)) {
    return {
      id: "guests",
      label: "End guests, diners, or travelers",
      type: "b2c",
    };
  }

  if (/\b(for busy moms|for beginners|for freelancers|for entrepreneurs|for women|for men)\b/i.test(t)) {
    const match = t.match(
      /\bfor\s+(busy moms|beginners|freelancers|entrepreneurs|women|men|first[- ]time[^,.]*)/i
    );
    const label = match?.[1]
      ? match[1].charAt(0).toUpperCase() + match[1].slice(1)
      : "My customers or audience";
    return { id: "customers", label, type: "b2c" };
  }

  if (
    /\b(hotel owners|restaurant owners|operators|property managers|business owners|for owners)\b/i.test(
      t
    )
  ) {
    return {
      id: "operators",
      label: "Other business owners or operators in my industry",
      type: "b2b",
    };
  }

  if (
    /\b(you should|if you are|if you're|stop doing|start doing)\b/i.test(t) &&
    !/\b(i |my )/i.test(t)
  ) {
    return {
      id: "customers",
      label: "My customers or audience",
      type: "b2c",
    };
  }

  return null;
}

/** Both niche and target audience are identifiable. No follow-up needed. */
export function isNicheAndAudienceClear(text: string): boolean {
  return inferNicheFromText(text) !== null && inferAudienceFromText(text) !== null;
}

/** Ask a follow-up only when niche or audience (or both) are genuinely unclear. */
export function shouldAskCreatorContextQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return true;
  if (DUAL_AUDIENCE_HEDGE_RE.test(t)) return true;
  if (isNicheAndAudienceClear(t)) return false;
  return inferNicheFromText(t) === null || inferAudienceFromText(t) === null;
}

export function inferOnboardingSlugsFromDescription(description: string): string[] {
  const niche = inferNicheFromText(description);
  const slugs: string[] = niche ? [niche.slug] : [];
  if (slugs.length === 0) slugs.push("business-entrepreneurship");
  return slugs.slice(0, 3);
}
