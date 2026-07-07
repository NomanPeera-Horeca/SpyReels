import { ONBOARDING_NICHES } from "@/data/onboardingNiches";
import {
  inferOnboardingSlugsFromDescription,
  shouldAskCreatorContextQuestion,
} from "@shared/onboardingDescription";
import { routeNiche as routeNichePrompt } from "./ai/prompts/niche-routing";

function onboardingSlugForNicheName(name: string): string | null {
  const trimmed = name.trim();
  const hit = ONBOARDING_NICHES.find(
    (n) => n.name === trimmed || n.name.toLowerCase() === trimmed.toLowerCase()
  );
  return hit?.slug ?? null;
}

function selectedSlugsFromNicheRouting(result: {
  primary_niche: string;
  secondary_niches: string[];
}): string[] {
  const slugs: string[] = [];
  const primary = onboardingSlugForNicheName(result.primary_niche);
  if (primary) slugs.push(primary);
  for (const secondary of result.secondary_niches) {
    if (slugs.length >= 3) break;
    const slug = onboardingSlugForNicheName(secondary);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  if (slugs.length === 0) {
    slugs.push("business-entrepreneurship");
  }
  return slugs.slice(0, 3);
}

function detectHospitalityB2CContext(description: string): string | null {
  const d = description.toLowerCase();

  const b2cPatterns = [
    /\bmy (hotel|motel|resort|boutique hotel|bed and breakfast|b&b|airbnb|bnb)\b/,
    /\bmy (restaurant|cafe|coffee shop|bistro|brasserie|diner|eatery|bar|pub|tavern|lounge|rooftop bar|speakeasy)\b/,
    /\bmy (venue|event space|wedding venue|banquet hall)\b/,
    /\b(we (are|run|own|operate)|i (run|own|operate)) a (hotel|resort|restaurant|cafe|bar|venue|spa)\b/,
    /content (for|about) (our |my )?(guests|visitors|diners|customers|travellers|tourists)/,
    /show(ing)? (guests|visitors|diners|people) (around|what|how|why)/,
    /attract (guests|visitors|diners|tourists|customers) (to|for)/,
    /\b(guest experience|guest journey|dining experience|hotel experience)\b/,
  ];

  const b2bPatterns = [
    /sell(ing)? to (hotels|restaurants|operators|hospitality businesses)/,
    /\b(hospitality software|hotel management system|pos system|restaurant tech|property management)\b/,
    /\b(wholesale|distributor|supplier)\b.*\b(hotel|restaurant)\b/,
    /\b(hotel|restaurant) owner(s)?\b.*\b(buy|purchase|invest|subscribe)\b/,
  ];

  const hasB2CSignal = b2cPatterns.some((p) => p.test(d));
  const hasB2BSignal = b2bPatterns.some((p) => p.test(d));

  if (hasB2CSignal && !hasB2BSignal) {
    return "This creator owns or runs a hospitality or food and beverage venue. They are making content FOR their guests, diners, or visitors to attract and inspire them. They are a B2C creator. Route to Restaurants & Cafes, Travel, Food & Cooking, or similar consumer-facing niches. Do NOT route to Business & Entrepreneurship.";
  }

  return null;
}

function finalizeRouteNicheResponse(
  routed: Awaited<ReturnType<typeof routeNichePrompt>>,
  businessDescription: string
) {
  const slugs = selectedSlugsFromNicheRouting(routed);
  const keywordSlugs = inferOnboardingSlugsFromDescription(businessDescription);
  const useKeywords =
    slugs.length === 0 ||
    (slugs.length === 1 &&
      slugs[0] === "business-entrepreneurship" &&
      keywordSlugs[0] !== "business-entrepreneurship");
  const askFollowUp = shouldAskCreatorContextQuestion(businessDescription);
  const aiQuestion = routed.clarifying_question?.trim() || null;
  return {
    selectedSlugs: useKeywords ? keywordSlugs : slugs,
    confidence: askFollowUp ? routed.confidence : 0.9,
    clarifyingQuestion: askFollowUp && aiQuestion ? aiQuestion : null,
  };
}

export async function routeOnboardingNicheSlugs(businessDescription: string): Promise<string[]> {
  const clarificationContext = detectHospitalityB2CContext(businessDescription);

  try {
    const result = await routeNichePrompt({
      businessDescription,
      clarificationContext,
    });

    if (clarificationContext && result.business_type === "B2B" && result.confidence > 0.5) {
      const correctedResult = await routeNichePrompt({
        businessDescription,
        clarificationContext:
          clarificationContext +
          " IMPORTANT: The user is definitively a B2C creator. business_type must be B2C. Do not route to Business & Entrepreneurship.",
      });
      if (correctedResult.business_type !== "B2B") {
        return finalizeRouteNicheResponse(correctedResult, businessDescription).selectedSlugs;
      }
    }

    return finalizeRouteNicheResponse(result, businessDescription).selectedSlugs;
  } catch (err) {
    console.error("[Onboarding] routeNiche failed, using keyword fallback:", err);
    return inferOnboardingSlugsFromDescription(businessDescription);
  }
}

export function buildFirstOnboardingScriptPrompt(businessDescription: string, targetAudience: string): string {
  return [
    "Write my first viral Instagram Reels script that I can film today.",
    `Niche / topic: ${businessDescription.trim()}.`,
    `Audience: ${targetAudience.trim()}.`,
    "Use talking-head format as a 30-45 second Story Reel (not a short 8-15 second loop).",
    "Scroll-stopping hook in the first 2 seconds.",
    "Include production notes with specific Instagram Reels audio picks.",
  ].join(" ");
}
