// Types for the three-prompt AI pipeline used for personalized
// creator discovery and viral reel translation.
//
// 1. Niche routing: user business description -> niches + audience
// 2. Translation: viral reel + user audience -> adapted script
// 3. Judge: validates translation output before showing to user

// The 25 niches available in SpyReels' curated library.
// These strings must match EXACTLY with the niche grid in onboarding.
export const NICHES = [
  "Marketing & Sales",
  "Business & Entrepreneurship",
  "Personal Finance",
  "Investing & Crypto",
  "Real Estate",
  "E-commerce & DTC",
  "Career & Jobs",
  "Make Money Online",
  "AI & Tech Creators",
  "Content Marketing",
  "Faceless Content",
  "Photography & Videography",
  "Tutorials & How-To",
  "Fashion & Style",
  "Beauty & Skincare",
  "Health & Fitness",
  "Mental Health & Mindfulness",
  "Food & Cooking",
  "Restaurants & Cafes",
  "Travel",
  "Home & Interior Design",
  "Parenting & Family",
  "Dating & Relationships",
  "Pets & Animals",
  "Education & Teaching",
  "Comedy & Memes",
  "Music & Musicians",
  "Sports & Athletes",
  "Cars & Automotive",
  "Spirituality & Astrology",
] as const;

export type Niche = (typeof NICHES)[number];

// ===== PROMPT 1: NICHE ROUTING =====

export interface NicheRoutingInput {
  businessDescription: string;
}

export interface NicheRoutingOutput {
  primary_niche: Niche;
  secondary_niches: Niche[];
  audience: {
    who_they_sell_to: string;
    audience_persona_keywords: string[];
  };
  content_angles: string[];
  business_type: "B2B" | "B2C" | "B2B2C";
  confidence: number;
  explanation: string;
  clarifying_question: string | null;
}

// ===== PROMPT 2: TRANSLATION =====

export interface TranslationInput {
  // From the niche routing step
  userBusinessDescription: string;
  audienceWhoTheySellTo: string;
  audiencePersonaKeywords: string[];
  businessType: "B2B" | "B2C" | "B2B2C";
  // The viral reel
  reelCreatorHandle: string;
  reelOriginalNiche: Niche;
  reelViewCount: number;
  reelEngagementRate: number;
  reelCaption: string;
  reelTranscript: string;
}

export interface TranslationOutput {
  relevance_type: "direct_match" | "pattern_match" | "stretch";
  why_it_went_viral: string;
  why_we_showed_you_this: string;
  translation_logic: string;
  draft_script: {
    hook: string;
    body: string;
    cta: string;
  };
  estimated_difficulty: "easy" | "medium" | "hard";
  filming_note: string;
}

// ===== PROMPT 3: JUDGE =====

export interface JudgeInput {
  // Same context as translation
  userBusinessDescription: string;
  audienceWhoTheySellTo: string;
  audiencePersonaKeywords: string[];
  // The original reel
  reelCreatorHandle: string;
  reelOriginalNiche: Niche;
  reelViewCount: number;
  reelCaption: string;
  reelTranscript: string;
  // The proposed translation to evaluate
  proposedTranslation: TranslationOutput;
}

export interface JudgeOutput {
  decision: "APPROVE" | "REJECT_REGENERATE" | "REJECT_HIDE";
  specificity_score: number;
  authenticity_score: number;
  translation_honesty_score: number;
  hook_quality_score: number;
  filming_feasibility_score: number;
  overall_score: number;
  feedback_for_regeneration: string | null;
  user_facing_explanation: string | null;
}
