export type CoachSpecificRepeatTag =
  | "delayed_name"
  | "product_cta_only"
  | "product_comparison"
  | "product_demo"
  | "contrarian"
  | "exact_hook"
  | "exact_cta"
  | "story"
  | "educational"
  | "sales"
  | "spyreels"
  | "operator";

export type CoachSpecificRepeatFixture = {
  id: string;
  tags: CoachSpecificRepeatTag[];
  rawIdea: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string;
};

export const COACH_SPECIFIC_REPEAT_FIXTURES: CoachSpecificRepeatFixture[] = [
  {
    id: "spyreels-delayed-story",
    tags: ["spyreels", "delayed_name", "story", "product_cta_only"],
    rawIdea:
      "Tell the story of SpyReels as a tool that helps creators find useful patterns in viral Reels. Do not say 'copy competitors' and do not name SpyReels until the final sentence.",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to improve Reel performance",
    brandDescription: "SpyReels is a creator research and content ideation product.",
  },
  {
    id: "spyreels-cta-only",
    tags: ["spyreels", "delayed_name", "product_cta_only", "exact_cta", "exact_hook"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that creators should study one winning pattern before they post more. Open with \"Stop guessing what to post next.\" Do not name SpyReels until the final sentence. End with: \"Open SpyReels and save one pattern before you film.\"",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to grow on Reels",
    brandDescription: "SpyReels helps creators study viral content patterns.",
  },
  {
    id: "spyreels-vs-scrolling",
    tags: ["spyreels", "product_comparison", "exact_hook", "exact_cta", "contrarian"],
    rawIdea:
      "Make a talking-head Reel arguing that scrolling your own For You page is a weaker research method than studying a saved set of winning Reels. Open with \"Your For You page is not a research plan.\" Do not say 'copy competitors'. End by telling them to save five winning Reels in SpyReels before they write a new hook.",
    niche: "Short-form content growth",
    targetAudience: "Creators who binge-watch instead of researching",
    brandDescription: "SpyReels is a creator research and content ideation product.",
  },
  {
    id: "spyreels-demo-watch",
    tags: ["spyreels", "product_demo", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 35-second talking-head Reel demonstrating how a creator should pause a winning Reel, write the hook in their own words, then check the pattern before filming. Open with \"Watch it like a maker, not a fan.\" Do not claim this guarantees views. End with: \"Do that inside SpyReels on one saved Reel tonight.\"",
    niche: "Short-form content growth",
    targetAudience: "Creators who want a repeatable research habit",
    brandDescription: "SpyReels helps creators study viral content patterns.",
  },
  {
    id: "spyreels-delayed-hook",
    tags: ["spyreels", "delayed_name", "exact_hook", "story"],
    rawIdea:
      "Tell the story of a creator who stopped posting random ideas after they started collecting hooks that already worked. Open with \"I was posting every day and still sounding new.\" Do not discuss follower counts. Do not name SpyReels until the final sentence.",
    niche: "Short-form content growth",
    targetAudience: "Creators stuck in daily posting with weak hooks",
    brandDescription: "SpyReels helps creators find useful patterns in viral Reels.",
  },
  {
    id: "spyreels-no-copy-phrase",
    tags: ["spyreels", "delayed_name", "educational", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel teaching creators that pattern study is not the same as cloning someone else's Reel. Explain that they should steal the tension, not the words. Do not say 'copy competitors' and do not name SpyReels until the final sentence. End by telling them to rewrite one saved hook in their own voice.",
    niche: "Short-form content growth",
    targetAudience: "Creators worried that research looks like copying",
    brandDescription: "SpyReels is a creator research product.",
  },
  {
    id: "kitchen-before-payroll",
    tags: ["operator", "contrarian", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 35-second talking-head Reel arguing that adding staff is often the wrong fix for a slow kitchen. Open with \"Your kitchen may not need another employee.\" Explain that menu complexity and station flow should be audited first. Do not discuss wages or food cost. End with: \"Fix the system before you add payroll.\"",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "menu-staff-exact",
    tags: ["operator", "contrarian", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that restaurant owners should reduce menu size before increasing kitchen staff. Open with \"Your kitchen doesn't need another employee.\" Do not discuss food cost. End by telling them to audit their menu complexity.",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "prep-flow-full",
    tags: ["operator", "educational", "exact_cta"],
    rawIdea:
      "Make a 35-second talking-head Reel explaining why restaurant owners should measure prep flow before buying equipment. Do not talk about price or financing. End with one action: map the path from fridge to prep table to cook line.",
    niche: "Restaurant equipment and operations",
    targetAudience: "Independent restaurant owners opening or remodeling a kitchen",
  },
  {
    id: "equipment-audit",
    tags: ["operator", "contrarian", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that new restaurant owners should audit unused station space before buying another prep table. Open with \"Your kitchen is already too full.\" Do not discuss equipment financing. End by telling them to mark every unused foot of stainless steel.",
    niche: "Restaurant equipment and restaurant education",
    targetAudience: "New restaurant owners buying kitchen equipment",
  },
  {
    id: "ticket-times-contrarian",
    tags: ["operator", "contrarian", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel arguing that weekend brunch ticket times usually spike because the menu asks one station to do too many jobs, not because guests are impatient. Open with \"Brunch is not a guest problem.\" Do not invent statistics. End with: \"Watch the egg station for one Saturday before you rewrite the whole menu.\"",
    niche: "Restaurant operations",
    targetAudience: "Restaurant owners and general managers",
  },
  {
    id: "delivery-photo-standard",
    tags: ["operator", "sales", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that delivery restaurants should photograph the unboxed plate before they spend more on ads. Open with \"Your ads are selling a plate your driver cannot deliver.\" Do not claim this guarantees more orders. End by telling them to order their own number-one item tonight and photograph it on the table.",
    niche: "Restaurant growth and operations",
    targetAudience: "Restaurant owners growing delivery sales",
  },
  {
    id: "emberwick-delayed",
    tags: ["delayed_name", "product_cta_only", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that home-fragrance buyers should smell a candle in the room they will actually use it before judging throw. Open with \"Stop sniffing the lid.\" Do not discuss wholesale pricing. Do not name Emberwick until the final sentence. End by telling them to test one scent in the room it is meant for.",
    niche: "Home fragrance and small product brands",
    targetAudience: "Candle buyers and small candle brand owners",
    brandDescription: "Emberwick makes small-batch room candles.",
  },
  {
    id: "emberwick-vs-cheap-jar",
    tags: ["product_comparison", "sales", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel arguing that a cheaper jar candle often smells loud in the store and disappears in a living room. Open with \"The cheap candle won in the aisle.\" Do not discuss discounts. End with: \"Burn Emberwick in the room you actually live in, then decide.\"",
    niche: "Home fragrance and small product brands",
    targetAudience: "Candle buyers comparing brands",
    brandDescription: "Emberwick makes small-batch room candles.",
  },
  {
    id: "emberwick-demo-room",
    tags: ["product_demo", "exact_hook", "exact_cta", "educational"],
    rawIdea:
      "Make a 35-second talking-head Reel arguing that buyers should test candle throw by lighting it, leaving the room for ten minutes, then walking back in without sniffing the jar. Open with \"If you have to hover over the wax, the room never got the scent.\" Do not invent lab results. End by telling them to run that test with Emberwick in the bedroom tonight.",
    niche: "Home fragrance and small product brands",
    targetAudience: "Candle buyers who think throw is weak",
    brandDescription: "Emberwick makes small-batch room candles.",
  },
  {
    id: "burnout-volume",
    tags: ["educational", "contrarian", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel arguing that creators should cut posting volume before they add more tools. Open with \"Your burnout is not a scheduling problem.\" Do not discuss algorithms. End by telling them to publish one fewer Reel this week.",
    niche: "Creator wellness and consistency",
    targetAudience: "Creators feeling pressure to post daily",
  },
  {
    id: "first-kitchen-story",
    tags: ["story", "operator", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel telling the story of a first-year restaurant owner, arguing that a bigger menu is often the wrong way to impress guests. Open with \"I added twelve dishes to look serious.\" Keep the emotional position as regret turning into a simpler operating rule. Do not invent revenue numbers. End with: \"Cut two dishes this week and watch the line.\"",
    niche: "Restaurant growth and operations",
    targetAudience: "New restaurant owners",
  },
  {
    id: "owner-almost-quit",
    tags: ["story", "operator", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 35-second talking-head Reel telling the story of an owner who almost quit, arguing that station setup is a better first fix than working harder. Open with \"I was ready to hand back the keys.\" Keep the feeling as exhaustion, not hype. Do not discuss loans. End by telling them to sketch the cook's footsteps before they rewrite the schedule.",
    niche: "Restaurant operations",
    targetAudience: "Independent restaurant owners who feel burned out",
  },
  {
    id: "study-one-hook",
    tags: ["educational", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel teaching creators that they should study one winning hook pattern for a week before they invent a new one. Open with \"You do not need another idea. You need one pattern.\" Do not claim this guarantees virality. End with: \"Write five versions of the same hook tonight.\"",
    niche: "Short-form content growth",
    targetAudience: "Creators who keep starting from zero",
  },
  {
    id: "batch-cook-lesson",
    tags: ["educational", "operator", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that restaurant owners should only count Monday sauce batching as finished if Friday's station still has a labeled backup. Open with \"Prep is not finished when the hotel pan is full.\" Do not invent food-cost percentages. End by telling them to check one sauce label at 4pm on Friday.",
    niche: "Restaurant operations",
    targetAudience: "Restaurant owners and kitchen managers",
  },
  {
    id: "packaging-before-ads",
    tags: ["sales", "operator", "exact_cta", "educational"],
    rawIdea:
      "Make a talking-head Reel arguing that a delivery-focused restaurant should standardize packaging before spending more on ads. Open with \"Your ads are buying a first impression your box cannot keep.\" Do not claim this guarantees more sales. End by telling the owner to test one full delivery order themselves.",
    niche: "Restaurant growth and operations",
    targetAudience: "Restaurant owners growing delivery sales",
  },
  {
    id: "soft-sell-no-discount",
    tags: ["sales", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel selling Emberwick without a discount. Argue that buyers should choose the candle that still smells after the first hour, not the one that shouts in the store. Open with \"I am not going to drop the price.\" Do not mention discounts, codes, or percent off. End with: \"Light Emberwick after dinner and see if the room still holds.\"",
    niche: "Home fragrance and small product brands",
    targetAudience: "Candle buyers who wait for sales",
    brandDescription: "Emberwick makes small-batch room candles.",
  },
  {
    id: "objection-price-value",
    tags: ["sales", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a 30-second talking-head Reel arguing that SpyReels is still useful if a creator already watches Reels all day because watching is not collecting. Open with \"Watching is not the same as collecting.\" Do not discuss monthly price or compare plan tiers. End by telling them to save three winning hooks in SpyReels before they film tomorrow.",
    niche: "Short-form content growth",
    targetAudience: "Creators who think more watching equals more research",
    brandDescription: "SpyReels helps creators study viral content patterns.",
  },
  {
    id: "creator-one-pattern",
    tags: ["educational", "spyreels", "exact_hook", "exact_cta"],
    rawIdea:
      "Make a talking-head Reel arguing that creators should pick one niche pattern for seven days instead of chasing every trend they see. Open with \"Your content looks busy because it has no home.\" Do not invent growth percentages. End with: \"Choose one pattern in SpyReels and ignore the rest this week.\"",
    niche: "Short-form content growth",
    targetAudience: "Creators jumping between trends",
    brandDescription: "SpyReels helps creators study viral content patterns.",
  },
];

export function fixtureHasExactInstructionSet(fixture: CoachSpecificRepeatFixture): boolean {
  return (
    fixture.tags.includes("exact_hook") &&
    fixture.tags.includes("exact_cta") &&
    (fixture.tags.includes("contrarian") || fixture.rawIdea.toLowerCase().includes("arguing"))
  );
}
