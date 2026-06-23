/** True when onboarding text is specific enough to route without a follow-up question. */
export function isOnboardingDescriptionClearEnough(description: string): boolean {
  const t = description.trim().toLowerCase();
  if (t.length < 8) return false;

  if (
    /\bmy (restaurant|cafe|bar|hotel|resort|venue|bakery|bistro|diner|airbnb|shop|salon|gym|studio|clinic)\b/.test(
      t
    ) &&
    (/\b(in|at|near|from|located)\s+[a-z]{2,}/.test(t) ||
      /\b(houston|austin|dallas|miami|chicago|nyc|la|brooklyn|london|toronto)\b/.test(t) ||
      t.split(/\s+/).length >= 5)
  ) {
    return true;
  }

  if (
    /\b(real estate|first.?time (home)?buyer|buying (a )?home|home buying|mortgage|realtor)\b/.test(t) &&
    (t.split(/\s+/).length >= 4 ||
      /\b(houston|austin|dallas|miami|chicago|nyc|la|brooklyn|london|toronto)\b/.test(t))
  ) {
    return true;
  }

  if (/\b(in|near|around)\s+[a-z]{2,}/.test(t) && t.split(/\s+/).length >= 5) {
    return true;
  }

  if (/\b(for|helping|teaching|coaching|selling to|creators who|people who)\s+[a-z]/.test(t) && t.split(/\s+/).length >= 6) {
    return true;
  }

  if (/\b(i create|i make|i sell|i run|i own|i post|content about)\b/.test(t) && t.split(/\s+/).length >= 7) {
    return true;
  }

  return false;
}

const KEYWORD_SLUG_RULES: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /\b(real estate|first.?time buyer|buying (a )?home|home buying|mortgage|realtor|listing)\b/i, slug: "real-estate" },
  { pattern: /\b(restaurant|cafe|diner|bar|food|chef|menu)\b/i, slug: "restaurants-cafes" },
  { pattern: /\b(hotel|resort|hospitality|guest|travel|tourist)\b/i, slug: "travel" },
  { pattern: /\b(fitness|workout|gym|health)\b/i, slug: "health-fitness" },
  { pattern: /\b(skincare|beauty|makeup|acne)\b/i, slug: "beauty-skincare" },
  { pattern: /\b(coach|freelanc|business|entrepreneur|startup)\b/i, slug: "business-entrepreneurship" },
  { pattern: /\b(money|income|side hustle|make money)\b/i, slug: "make-money-online" },
  { pattern: /\b(finance|invest|budget|saving)\b/i, slug: "personal-finance" },
  { pattern: /\b(marketing|ads|social media growth)\b/i, slug: "marketing-sales" },
];

/** Keyword fallback when AI niche routing fails or times out. */
export function inferOnboardingSlugsFromDescription(description: string): string[] {
  const slugs: string[] = [];
  for (const rule of KEYWORD_SLUG_RULES) {
    if (rule.pattern.test(description) && !slugs.includes(rule.slug)) {
      slugs.push(rule.slug);
    }
    if (slugs.length >= 3) break;
  }
  if (slugs.length === 0) slugs.push("business-entrepreneurship");
  return slugs.slice(0, 3);
}
