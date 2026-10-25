/**
 * Closed content taxonomy. The niche model must pick one of these labels, or
 * unknown. Pool names are the indexed Viral Posts niches that already exist.
 * A taxonomy value with no pool does not fall through to Business.
 */
export type ContentCategory = {
  slug: string;
  label: string;
  /** Indexed pool niche, or null when no pool exists. A name is not permission to route. */
  pool: string | null;
  /** The six restaurant content pillars live under the business pool. */
  restaurantPillars: boolean;
  /** True only when those indexed pillars are the same subject as this category. */
  supplyMatched: boolean;
};

export const CONTENT_TAXONOMY: readonly ContentCategory[] = [
  { slug: "real_estate", label: "Real Estate", pool: "Real Estate", restaurantPillars: false, supplyMatched: true },
  { slug: "fitness", label: "Fitness", pool: "Health & Fitness", restaurantPillars: false, supplyMatched: true },
  { slug: "food", label: "Food", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "beauty", label: "Beauty", pool: "Beauty", restaurantPillars: false, supplyMatched: true },
  { slug: "business", label: "Business", pool: "Business & Entrepreneurship", restaurantPillars: false, supplyMatched: false },
  { slug: "finance", label: "Finance", pool: "Personal Finance", restaurantPillars: false, supplyMatched: true },
  { slug: "marketing", label: "Marketing", pool: "Business & Entrepreneurship", restaurantPillars: false, supplyMatched: false },
  { slug: "parenting", label: "Parenting", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "travel", label: "Travel", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "fashion", label: "Fashion", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "tech", label: "Tech", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "education", label: "Education", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "lifestyle", label: "Lifestyle", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "spirituality", label: "Spirituality", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "entertainment", label: "Entertainment", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "outdoors", label: "Outdoors", pool: null, restaurantPillars: false, supplyMatched: false },
  { slug: "hospitality", label: "Hospitality", pool: "Business & Entrepreneurship", restaurantPillars: true, supplyMatched: true },
];

/** Labels already stored before the model chose from CONTENT_TAXONOMY. Not offered to the model. */
const LEGACY_CATEGORY_ALIASES: ReadonlyArray<{ match: string; slug: string }> = [
  { match: "business & entrepreneurship", slug: "business" },
  { match: "business and entrepreneurship", slug: "business" },
  { match: "restaurants & cafes", slug: "hospitality" },
  { match: "restaurants and cafes", slug: "hospitality" },
  { match: "health & fitness", slug: "fitness" },
  { match: "health and fitness", slug: "fitness" },
  { match: "beauty & skincare", slug: "beauty" },
  { match: "beauty and skincare", slug: "beauty" },
  { match: "personal finance", slug: "finance" },
  { match: "make money online", slug: "finance" },
  { match: "marketing & sales", slug: "marketing" },
  { match: "marketing and sales", slug: "marketing" },
  { match: "tech and ai", slug: "tech" },
  { match: "tech & ai", slug: "tech" },
  { match: "personal_finance", slug: "finance" },
  { match: "tech_ai", slug: "tech" },
];

const UNKNOWN = new Set(["", "unknown", "unmatched", "none", "n/a", "na"]);

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function contentTaxonomyLabels(): string[] {
  return CONTENT_TAXONOMY.map(category => category.label);
}

/** A known taxonomy value, including a legacy stored label. Unknown stays null. */
export function resolveContentCategory(value: string | null | undefined): ContentCategory | null {
  const text = norm(value ?? "");
  if (UNKNOWN.has(text)) return null;
  const direct = CONTENT_TAXONOMY.find(
    category => norm(category.label) === text || category.slug === text.replace(/[\s-]+/g, "_")
  );
  if (direct) return direct;
  const alias = LEGACY_CATEGORY_ALIASES.find(row => row.match === text);
  if (!alias) return null;
  return CONTENT_TAXONOMY.find(category => category.slug === alias.slug) ?? null;
}

/**
 * Indexed pool a category may read. Unverified and missing categories return null.
 * This does not create a pool, refresh one, or fall back to Business.
 * Home and the daily feed do not call this until that supply is checked against rows.
 */
export function poolNicheForCategory(value: string | null | undefined): string | null {
  const category = resolveContentCategory(value);
  if (!category?.supplyMatched || !category.pool) return null;
  return category.pool;
}

export function categorySelectsRestaurantPillars(value: string | null | undefined): boolean {
  const category = resolveContentCategory(value);
  return Boolean(category?.supplyMatched && category.restaurantPillars);
}
