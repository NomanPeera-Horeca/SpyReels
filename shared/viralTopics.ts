/**
 * Starting topic list for the shared viral library (approved by the founder
 * on 2026-11-01). Every viral or rising library video gets 1-3 of these, and
 * every creator's niche, pillars and sub-topics are matched to them. When a
 * creator's pillar fits none of them, a new topic is added at runtime
 * (source "user"); this list is only the start.
 *
 * Category slugs match shared/personalization/contentTaxonomy.ts.
 */

export type ViralTopicSeed = { slug: string; label: string; category: string };

const STARTER: Record<string, string[]> = {
  tech: [
    "AI tools", "ChatGPT & AI prompts", "iPhone & Apple news", "Android & phone reviews",
    "gadget unboxing", "laptop & PC setup", "coding tips", "tech news",
    "apps & productivity tools", "smart home", "cybersecurity tips", "gaming tech",
  ],
  food: [
    "quick recipes", "meal prep", "healthy eating", "baking & desserts", "street food",
    "food reviews", "cooking hacks", "budget meals", "vegan & plant-based", "home chef tips",
    "coffee & drinks", "grilling & BBQ",
  ],
  hospitality: [
    "restaurant marketing", "menu pricing", "food cost control", "staff hiring & training",
    "restaurant operations", "opening a restaurant", "customer experience",
    "hotel & hospitality tips", "café business", "delivery & online orders",
    "restaurant reviews from owners", "bar & beverage business",
  ],
  business: [
    "starting a business", "side hustles", "small business tips", "entrepreneur mindset",
    "sales tips", "leadership", "productivity", "e-commerce", "freelancing", "franchise",
    "business growth stories", "hiring & teams",
  ],
  marketing: [
    "social media marketing", "content strategy", "personal branding", "Instagram growth",
    "TikTok growth", "YouTube growth", "copywriting", "email marketing", "ads & paid marketing",
    "SEO", "influencer marketing", "video editing tips",
  ],
  finance: [
    "investing basics", "stock market", "crypto", "saving money", "budgeting", "credit & debt",
    "passive income", "real estate investing", "retirement", "money mindset", "financial news",
    "taxes",
  ],
  real_estate: [
    "home buying tips", "real estate agent tips", "property tours", "house flipping",
    "rental property", "mortgage tips", "luxury homes", "real estate marketing", "home staging",
    "first-time buyers", "commercial real estate", "market updates",
  ],
  fitness: [
    "home workouts", "gym workouts", "weight loss", "muscle building", "running",
    "yoga & stretching", "nutrition for fitness", "fitness motivation", "women's fitness",
    "calisthenics", "sports training", "before & after transformations",
  ],
  beauty: [
    "skincare routines", "makeup tutorials", "haircare", "nails", "beauty product reviews",
    "anti-aging", "men's grooming", "natural beauty", "hairstyles", "fragrance", "beauty hacks",
    "salon & beauty business",
  ],
  fashion: [
    "outfit ideas", "styling tips", "streetwear", "luxury fashion", "budget fashion",
    "men's fashion", "women's fashion", "sneakers", "fashion hauls", "sustainable fashion",
    "accessories", "modest fashion",
  ],
  travel: [
    "travel destinations", "budget travel", "travel hacks", "luxury travel", "solo travel",
    "hotel reviews", "road trips", "travel vlogs", "family travel", "hidden gems", "travel food",
    "digital nomad life",
  ],
  education: [
    "study tips", "language learning", "career advice", "exam prep", "science explained",
    "history facts", "maths tips", "online courses", "teaching tips", "job interview tips",
    "personal development", "book summaries",
  ],
  lifestyle: [
    "daily routines", "home decor", "organization & cleaning", "minimalism", "self-care",
    "relationships", "productivity habits", "day in my life", "morning routines", "life hacks",
    "home renovation", "pets",
  ],
  parenting: [
    "baby tips", "toddler activities", "parenting hacks", "pregnancy", "mom life", "dad life",
    "kids education", "family routines", "kids' meals", "newborn care", "teen parenting",
    "family vlogs",
  ],
  spirituality: [
    "meditation", "mindfulness", "manifestation", "faith & religion", "motivation & quotes",
    "mental health", "astrology", "gratitude", "journaling", "stoicism", "self-love", "healing",
  ],
  entertainment: [
    "comedy skits", "pranks", "music covers", "dance trends", "movie & TV reviews",
    "celebrity news", "memes & trends", "storytelling", "podcast clips", "reactions", "gaming",
    "challenges",
  ],
  outdoors: [
    "hiking", "camping", "fishing", "hunting", "gardening", "van life",
    "surfing & water sports", "nature & wildlife", "survival skills", "cycling", "climbing",
    "outdoor gear reviews",
  ],
};

/** Stable slug from a label: "ChatGPT & AI prompts" -> "chatgpt-and-ai-prompts". */
export function topicSlug(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const VIRAL_TOPIC_CATEGORIES = Object.keys(STARTER);

export const STARTER_VIRAL_TOPICS: ViralTopicSeed[] = Object.entries(STARTER).flatMap(
  ([category, labels]) => labels.map(label => ({ slug: topicSlug(label), label, category }))
);
