export type OnboardingNiche = {
  slug: string;
  name: string;
  emoji: string;
};

export const FEATURE_LAUNCH_DATE_ISO = "2026-04-22T00:00:00Z";

export const ONBOARDING_NICHES: OnboardingNiche[] = [
  { slug: "marketing-sales", name: "Marketing & Sales", emoji: "📈" },
  { slug: "business-entrepreneurship", name: "Business & Entrepreneurship", emoji: "💼" },
  { slug: "personal-finance", name: "Personal Finance", emoji: "💵" },
  { slug: "investing-crypto", name: "Investing & Crypto", emoji: "💰" },
  { slug: "real-estate", name: "Real Estate", emoji: "🏠" },
  { slug: "ecommerce-dtc", name: "E-commerce & DTC", emoji: "💸" },
  { slug: "career-jobs", name: "Career & Jobs", emoji: "💼" },
  { slug: "make-money-online", name: "Make Money Online", emoji: "💸" },
  { slug: "ai-tech-creators", name: "AI & Tech Creators", emoji: "🤖" },
  { slug: "content-marketing", name: "Content Marketing", emoji: "✍️" },
  { slug: "faceless-content", name: "Faceless Content", emoji: "🎭" },
  { slug: "photography-videography", name: "Photography & Videography", emoji: "📸" },
  { slug: "tutorials-how-to", name: "Tutorials & How-To", emoji: "🎓" },
  { slug: "fashion-style", name: "Fashion & Style", emoji: "👗" },
  { slug: "beauty-skincare", name: "Beauty & Skincare", emoji: "💄" },
  { slug: "health-fitness", name: "Health & Fitness", emoji: "💪" },
  { slug: "mental-health-mindfulness", name: "Mental Health & Mindfulness", emoji: "🧘" },
  { slug: "food-cooking", name: "Food & Cooking", emoji: "🍳" },
  { slug: "restaurants-cafes", name: "Restaurants & Cafes", emoji: "🍽️" },
  { slug: "travel", name: "Travel", emoji: "✈️" },
  { slug: "home-interior-design", name: "Home & Interior Design", emoji: "🛋️" },
  { slug: "parenting-family", name: "Parenting & Family", emoji: "👶" },
  { slug: "dating-relationships", name: "Dating & Relationships", emoji: "💕" },
  { slug: "pets-animals", name: "Pets & Animals", emoji: "🐕" },
  { slug: "education-teaching", name: "Education & Teaching", emoji: "📚" },
  { slug: "comedy-memes", name: "Comedy & Memes", emoji: "😂" },
  { slug: "music-musicians", name: "Music & Musicians", emoji: "🎵" },
  { slug: "sports-athletes", name: "Sports & Athletes", emoji: "⚽" },
  { slug: "cars-automotive", name: "Cars & Automotive", emoji: "🚗" },
  { slug: "spirituality-astrology", name: "Spirituality & Astrology", emoji: "✨" },
];

export const ONBOARDING_NICHES_BY_SLUG = new Map(
  ONBOARDING_NICHES.map((niche) => [niche.slug, niche])
);
