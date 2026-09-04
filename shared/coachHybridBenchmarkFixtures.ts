import type { CoachIdeaSpecificity } from "@shared/coachIdeaSpecificity";

export type CoachHybridGoldSpecificity = CoachIdeaSpecificity;

export type CoachHybridBenchmarkFixture = {
  id: string;
  goldSpecificity: CoachHybridGoldSpecificity;
  rawIdea: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string;
};

export const COACH_HYBRID_BENCHMARK_FIXTURES: CoachHybridBenchmarkFixture[] = [
  {
    id: "vague-menus",
    goldSpecificity: "vague",
    rawIdea: "make a Reel about restaurant menus",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "vague-burnout",
    goldSpecificity: "vague",
    rawIdea: "make content about burnout",
    niche: "Creator wellness and consistency",
    targetAudience: "Creators and small business owners",
  },
  {
    id: "vague-candles",
    goldSpecificity: "vague",
    rawIdea: "I sell candles and need content",
    niche: "Home fragrance and small product brands",
    targetAudience: "Candle brand owners and makers",
  },
  {
    id: "vague-equipment",
    goldSpecificity: "vague",
    rawIdea: "make something about restaurant equipment",
    niche: "Restaurant equipment and restaurant education",
    targetAudience: "New and growing restaurant owners",
  },
  {
    id: "vague-growth",
    goldSpecificity: "vague",
    rawIdea: "help me talk about social media growth",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to grow on Reels",
  },
  {
    id: "vague-labor",
    goldSpecificity: "vague",
    rawIdea: "Make something about why restaurants struggle with labor.",
    niche: "Restaurant operations",
    targetAudience: "Restaurant owners and general managers",
  },
  {
    id: "vague-spyreels",
    goldSpecificity: "vague",
    rawIdea: "Make a Reel about SpyReels for creators.",
    niche: "Short-form content growth",
    targetAudience: "Creators and small business owners making Reels",
    brandDescription: "SpyReels helps creators study viral content patterns and make stronger short-form content.",
  },
  {
    id: "mod-oversized-menus",
    goldSpecificity: "moderately_specific",
    rawIdea: "explain why oversized restaurant menus create operational problems",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "mod-winning-hooks",
    goldSpecificity: "moderately_specific",
    rawIdea: "show creators why studying winning hooks matters",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to improve Reel performance",
  },
  {
    id: "mod-prep-flow",
    goldSpecificity: "moderately_specific",
    rawIdea: "explain why restaurants should measure prep flow before buying equipment",
    niche: "Restaurant equipment and operations",
    targetAudience: "Independent restaurant owners opening or remodeling a kitchen",
  },
  {
    id: "mod-menu-consistency",
    goldSpecificity: "moderately_specific",
    rawIdea: "Make a contrarian Reel: a bigger menu can reduce kitchen consistency because each extra item adds prep and training complexity. Do not invent statistics. Give one takeaway, not a list of tips.",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "mod-packaging",
    goldSpecificity: "moderately_specific",
    rawIdea: "Explain why a delivery-focused restaurant should standardize packaging before spending more on ads. Do not claim this guarantees more sales. Focus on consistency after the order is placed, and end by telling the owner to test one full delivery order themselves.",
    niche: "Restaurant growth and operations",
    targetAudience: "Restaurant owners growing delivery sales",
  },
  {
    id: "mod-ticket-times",
    goldSpecificity: "moderately_specific",
    rawIdea: "Show restaurant owners why ticket times spike during weekend brunch",
    niche: "Restaurant operations",
    targetAudience: "Restaurant owners and general managers",
  },
  {
    id: "mod-one-hook",
    goldSpecificity: "moderately_specific",
    rawIdea: "Explain why creators should study one winning hook pattern before posting more Reels",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to grow on Reels",
  },
  {
    id: "high-spyreels-story",
    goldSpecificity: "highly_specific",
    rawIdea: "Tell the story of SpyReels as a tool that helps creators find useful patterns in viral Reels. Do not say 'copy competitors' and do not name SpyReels until the final sentence.",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to improve Reel performance",
    brandDescription: "SpyReels is a creator research and content ideation product.",
  },
  {
    id: "high-menu-staff",
    goldSpecificity: "highly_specific",
    rawIdea: "Make a 30-second talking-head Reel arguing that restaurant owners should reduce menu size before increasing kitchen staff. Open with \"Your kitchen doesn't need another employee.\" Do not discuss food cost. End by telling them to audit their menu complexity.",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "high-prep-flow-full",
    goldSpecificity: "highly_specific",
    rawIdea: "Make a 35-second talking-head Reel explaining why restaurant owners should measure prep flow before buying equipment. Do not talk about price or financing. End with one action: map the path from fridge to prep table to cook line.",
    niche: "Restaurant equipment and operations",
    targetAudience: "Independent restaurant owners opening or remodeling a kitchen",
  },
  {
    id: "high-prep-flow-hook",
    goldSpecificity: "highly_specific",
    rawIdea: "Make a talking-head Reel explaining that restaurant owners should measure prep flow before buying equipment. Do not discuss financing or equipment pricing. Open by challenging the idea that new equipment automatically fixes a slow kitchen.",
    niche: "Restaurant equipment and operations",
    targetAudience: "Independent restaurant owners opening or remodeling a kitchen",
  },
  {
    id: "high-candles-delayed",
    goldSpecificity: "highly_specific",
    rawIdea: "Make a 30-second talking-head Reel arguing that home-fragrance buyers should smell a candle in the room they will actually use it before judging throw. Open with \"Stop sniffing the lid.\" Do not discuss wholesale pricing. Do not name Emberwick until the final sentence. End by telling them to test one scent in the room it is meant for.",
    niche: "Home fragrance and small product brands",
    targetAudience: "Candle buyers and small candle brand owners",
    brandDescription: "Emberwick makes small-batch room candles.",
  },
  {
    id: "high-burnout-cta",
    goldSpecificity: "highly_specific",
    rawIdea: "Make a talking-head Reel arguing that creators should cut posting volume before they add more tools. Open with \"Your burnout is not a scheduling problem.\" Do not discuss algorithms. End by telling them to publish one fewer Reel this week.",
    niche: "Creator wellness and consistency",
    targetAudience: "Creators feeling pressure to post daily",
  },
  {
    id: "high-equipment-audit",
    goldSpecificity: "highly_specific",
    rawIdea: "Make a 30-second talking-head Reel arguing that new restaurant owners should audit unused station space before buying another prep table. Open with \"Your kitchen is already too full.\" Do not discuss equipment financing. End by telling them to mark every unused foot of stainless steel.",
    niche: "Restaurant equipment and restaurant education",
    targetAudience: "New restaurant owners buying kitchen equipment",
  },
];

export const COACH_HYBRID_FALSE_POSITIVE_PROBES: Array<{
  id: string;
  rawIdea: string;
  mustNotBe: "highly_specific";
}> = [
  {
    id: "fp-long-vague",
    rawIdea:
      "I have been thinking a lot about restaurant menus lately and I want a Reel that covers the whole topic in a useful way. It should be good, feel premium, and do not make it boring. I also want people to understand why menus matter in general and maybe mention guests, owners, and kitchens if that helps. Please make it comprehensive.",
    mustNotBe: "highly_specific",
  },
  {
    id: "fp-format-weak-hook",
    rawIdea:
      "Make a 30-second talking-head Reel about restaurant menus. Open with a question. End by telling them to follow for more tips.",
    mustNotBe: "highly_specific",
  },
  {
    id: "fp-talking-head-vague",
    rawIdea: "Make a talking-head Reel about burnout. Do not make it boring.",
    mustNotBe: "highly_specific",
  },
  {
    id: "fp-comprehensive-equipment",
    rawIdea:
      "I want a detailed Reel about restaurant equipment covering everything owners need to know about buying, installing, and training staff. Make it comprehensive and useful.",
    mustNotBe: "highly_specific",
  },
];
