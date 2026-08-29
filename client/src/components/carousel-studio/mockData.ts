/**
 * MOCK / placeholder data for Carousel Studio UI prototype.
 * Not wired to backend, AI, carousel_remakes, or tRPC.
 */

export type SourceKey = "prompt" | "web" | "youtube" | "remix";

export type StrategyCard = {
  kicker: string;
  title: string;
  body: string;
  best: string;
  slides: string;
  width: string;
};

export type Slide = {
  title: string;
  body: string;
};

export const SOURCE_CONFIG: Record<
  SourceKey,
  { hint: string; sideTitle: string; sideText: string; button: string }
> = {
  prompt: {
    hint: "The AI will propose three genuinely different content directions first.",
    sideTitle: "What Spyreels will do",
    sideText:
      "Turn your rough idea into three different content directions, then generate editable slides optimized for saves, shares, and follower growth.",
    button: "Find the strongest angle →",
  },
  web: {
    hint: "Spyreels will extract the strongest points from the article and turn them into a carousel narrative.",
    sideTitle: "Web article workflow",
    sideText:
      "The system reads the page, finds the strongest takeaways, then writes three save-worthy directions before generating the slides.",
    button: "Turn article into angles →",
  },
  youtube: {
    hint: "Spyreels will use the transcript, timestamps, and strongest talking points from the video.",
    sideTitle: "YouTube workflow",
    sideText:
      "The system turns a long-form video into a sharp carousel by isolating the clearest lessons and rewriting them in your voice.",
    button: "Turn video into angles →",
  },
  remix: {
    hint: "Spyreels will analyze the source post's hook, pacing, and visual pattern, then create original versions for your niche.",
    sideTitle: "Remix workflow",
    sideText:
      "Spyreels studies the successful structure of the imported carousel without copying its wording or visuals. Then it builds original, editable slides for your audience.",
    button: "Analyze structure & generate angles →",
  },
};

/** MOCK strategy directions per source type */
export const STRATEGY_SETS: Record<SourceKey, StrategyCard[]> = {
  prompt: [
    {
      kicker: "Contrarian",
      title: "More sales can make your restaurant poorer.",
      body: "Breaks the assumption that revenue growth automatically means financial health, then explains the cash-flow trap.",
      best: "Shares",
      slides: "9",
      width: "92%",
    },
    {
      kicker: "Framework",
      title: "The 4 numbers every restaurant owner must check weekly.",
      body: "A practical, save-worthy checklist that turns the topic into a repeatable weekly operating habit.",
      best: "Saves",
      slides: "8",
      width: "89%",
    },
    {
      kicker: "Story",
      title: "The restaurant was packed every night and still went bankrupt.",
      body: "A narrative-led carousel that uses tension and a cautionary example to improve completion rate.",
      best: "Completion",
      slides: "10",
      width: "94%",
    },
  ],
  web: [
    {
      kicker: "Summary",
      title: "7 quiet ways restaurants lose profit every week.",
      body: "Condenses the article into a practical list built for saves and easy team sharing.",
      best: "Saves",
      slides: "9",
      width: "90%",
    },
    {
      kicker: "Operator lens",
      title: "What this article gets right about restaurant profit.",
      body: "Reframes the article into a founder-style perspective with more conviction and authority.",
      best: "Authority",
      slides: "8",
      width: "86%",
    },
    {
      kicker: "Contrarian",
      title: "Your sales report can hide what is actually broken.",
      body: "Uses the source material, but turns it into a sharper pattern-interrupt for social.",
      best: "Shares",
      slides: "9",
      width: "93%",
    },
  ],
  youtube: [
    {
      kicker: "Contrarian",
      title: "The biggest lesson from this video: busy restaurants can still go broke.",
      body: "Turns the most striking moment from the video into a strong contrarian social angle.",
      best: "Shares",
      slides: "9",
      width: "92%",
    },
    {
      kicker: "Teach-back",
      title: "What restaurant owners should take away from this 18-minute video.",
      body: "Summarizes the strongest lessons in a clean teaching format built for saves.",
      best: "Saves",
      slides: "8",
      width: "88%",
    },
    {
      kicker: "Founder story",
      title: "If I had to explain this whole video in 8 slides, I'd say this.",
      body: "A more personal, authority-building version that feels like a briefing from an expert.",
      best: "Authority",
      slides: "10",
      width: "91%",
    },
  ],
  remix: [
    {
      kicker: "Structure remix",
      title: "9 images that will change how you see restaurant profit.",
      body: "Keeps the original post's visual-comparison rhythm but replaces the broad life lesson with niche business insight.",
      best: "Saves",
      slides: "9",
      width: "95%",
    },
    {
      kicker: "Contrarian remix",
      title: "A full restaurant is not proof of a good business.",
      body: "Adapts the source post's simple visual logic into a stronger contrarian message for restaurant owners.",
      best: "Shares",
      slides: "8",
      width: "93%",
    },
    {
      kicker: "Founder remix",
      title: "What customers see vs what the owner feels.",
      body: "Uses the source post's emotional contrast pattern and turns it into a founder-level operations lesson.",
      best: "Authority",
      slides: "10",
      width: "90%",
    },
  ],
};

/** MOCK slide decks per source type */
export const SLIDE_SETS: Record<SourceKey, Slide[]> = {
  prompt: [
    {
      title: "More sales can make your restaurant poorer.",
      body: "Revenue feels like growth. But without margin, labor, and cash-flow control, growth can quietly accelerate the damage.",
    },
    {
      title: "The dangerous assumption",
      body: "Most owners watch sales first. Profitable operators watch what is left after every sale.",
    },
    {
      title: "Revenue is not cash",
      body: "Card settlements, supplier terms, payroll timing, refunds, and tax obligations all move on different schedules.",
    },
    {
      title: "The 4 numbers to check weekly",
      body: "Prime cost • Contribution margin • Cash conversion • Accounts payable aging",
    },
    {
      title: "1. Prime cost",
      body: "Labor plus cost of goods sold. Once this climbs too high, extra sales create activity, not profit.",
    },
    {
      title: "2. Contribution margin",
      body: "Know what each menu item contributes after direct cost. High sales from weak-margin items can hurt.",
    },
    {
      title: "3. Cash conversion",
      body: "Measure how quickly sales actually become spendable cash after platform fees, deposits, and chargebacks.",
    },
    {
      title: "4. Payables aging",
      body: "A growing supplier balance can make a busy restaurant look healthy right before the cash crunch.",
    },
    {
      title: "Do not celebrate revenue alone.",
      body: "Save this. Review these four numbers every week before you decide the restaurant is growing.",
    },
  ],
  web: [
    {
      title: "7 quiet ways restaurants lose profit every week",
      body: "This carousel distills the article into the clearest operating lessons restaurant owners should act on.",
    },
    {
      title: "1. Revenue masks waste",
      body: "Higher sales can hide spoilage, labor inefficiency, and discount-heavy volume.",
    },
    {
      title: "2. Prime cost drift",
      body: "Small shifts in labor and food cost compound much faster than most owners expect.",
    },
    {
      title: "3. Menu complexity",
      body: "More options can create more waste, slower tickets, and weaker execution.",
    },
    {
      title: "4. Cash timing",
      body: "Sales and cash are not the same. Deposits, taxes, and supplier terms create delay.",
    },
    {
      title: "5. Weak contribution margin",
      body: "Popular items can still be poor business if they leave too little behind.",
    },
    {
      title: "6. Unseen discounts",
      body: "Promotions often feel like growth while teaching customers to wait for cheaper prices.",
    },
    {
      title: "7. Poor review habits",
      body: "Most problems become expensive because nobody checked them early.",
    },
    {
      title: "Save this article in carousel form",
      body: "Use it in your next weekly operating review.",
    },
  ],
  youtube: [
    {
      title: "Busy restaurants can still go broke.",
      body: "That is the clearest lesson from this video, and most owners only realize it too late.",
    },
    {
      title: "The misleading signal",
      body: "A full dining room creates confidence, but it tells you nothing about margin or cash.",
    },
    {
      title: "What the video explains well",
      body: "Revenue growth can increase labor, stock pressure, and financing needs before profit improves.",
    },
    { title: "Lesson 1", body: "Watch contribution margin, not only gross sales." },
    { title: "Lesson 2", body: "Cash timing matters more than many operators admit." },
    { title: "Lesson 3", body: "A busy team can still be an inefficient team." },
    {
      title: "Lesson 4",
      body: "Growth amplifies the business model you already have.",
    },
    {
      title: "The takeaway",
      body: "The restaurant does not need more activity. It needs more profitable activity.",
    },
    {
      title: "Save this summary",
      body: "If you do not want to rewatch the video, use this carousel as the distilled version.",
    },
  ],
  remix: [
    {
      title: "9 images that will change how you see restaurant profit",
      body: "The dining room can look successful while the business underneath is struggling.",
    },
    {
      title: "A packed dining room",
      body: "What customers see: energy, demand, and a restaurant that looks unstoppable.",
    },
    {
      title: "An empty bank account",
      body: "What the owner feels: payroll, supplier bills, refunds, taxes, and cash arriving too late.",
    },
    {
      title: "More menu items",
      body: "What looks like choice can quietly become waste, slower service, and inconsistent execution.",
    },
    {
      title: "More discounts",
      body: "What feels like marketing can train customers to wait until you cut the price again.",
    },
    {
      title: "Fast service",
      body: "What guests experience in 20 minutes may require months of systems, training, and discipline.",
    },
    {
      title: "Revenue looks impressive",
      body: "Cash flow keeps the restaurant alive. They are not the same thing.",
    },
    {
      title: "Watch what nobody sees",
      body: "Prime cost • contribution margin • cash conversion • payables aging.",
    },
    {
      title: "Profit is built under the surface",
      body: "Save this and review these four numbers before you celebrate your next record month.",
    },
  ],
};

/** MOCK progress step labels per source */
export const PROGRESS_STEPS: Record<SourceKey, string[]> = {
  prompt: [
    "Analyzing the strongest audience angle",
    "Structuring the narrative and swipe flow",
    "Writing slide copy in your brand voice",
    "Choosing layouts and visual direction",
    "Running quality and readability checks",
  ],
  web: [
    "Reading the article and extracting key points",
    "Identifying the strongest social-media angle",
    "Writing concise slide copy",
    "Designing the carousel flow",
    "Running quality and clarity checks",
  ],
  youtube: [
    "Reading the transcript and timestamps",
    "Selecting the strongest talking points",
    "Writing the carousel in your voice",
    "Designing the slide sequence",
    "Running quality and clarity checks",
  ],
  remix: [
    "Reading the source post and preview assets",
    "Detecting the structure, hook, and pacing",
    "Mapping the reusable slide pattern",
    "Rebuilding the concept for your niche",
    "Running originality and quality checks",
  ],
};

/** MOCK default form values */
export const MOCK_DEFAULTS = {
  promptInput:
    "Explain why most restaurants lose money even when sales are growing. Make it practical for independent restaurant owners.",
  webInput: "https://example.com/restaurant-profit-guide",
  youtubeInput: "https://www.youtube.com/watch?v=restaurant-profit",
  remixInput: "https://www.instagram.com/p/proven-carousel/",
  audience: "Independent restaurant owners",
  goal: "Saves & shares",
  pillar: "Restaurant profit & cash flow",
  voice: "Use saved brand voice",
};

export const MOCK_CUSTOMIZE_CHIPS = [
  { id: "brand", label: "Use my brand voice", defaultActive: true },
  { id: "research", label: "Research before writing", defaultActive: true },
  { id: "stats", label: "Include statistics", defaultActive: false },
  { id: "visuals", label: "Create original visuals", defaultActive: true },
  { id: "platforms", label: "Instagram + LinkedIn", defaultActive: true },
] as const;

export type NavPage = "create" | "library" | "downloads" | "performance" | "brand";

export type CreateStep =
  | "input"
  | "sourceAnalysis"
  | "strategy"
  | "progress"
  | "editor";

export type DesignTemplate = "" | "template-green" | "template-orange";
export type Platform = "instagram" | "linkedin";
export type AiQuickAction =
  | "shorter"
  | "stronger"
  | "clearer"
  | "diagram"
  | "evidence"
  | "voice";

export function cloneSlides(source: SourceKey): Slide[] {
  return SLIDE_SETS[source].map((s) => ({ ...s }));
}

export function slugifyFilename(title: string, max = 38): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max) || "spyreels-carousel"
  );
}

export function getPackageCaption(source: SourceKey): string {
  if (source === "remix") {
    return "A packed dining room can hide a dangerous cash-flow problem.\n\nHere are the numbers every restaurant owner should watch before celebrating a record month.\n\nSave this and review it with your manager this week.";
  }
  if (source === "youtube") {
    return "A busy restaurant can still be a weak business. Here are the most important lessons from the video, distilled into one carousel. Save this for your next operating review.";
  }
  if (source === "web") {
    return "This article explains several quiet ways restaurants lose profit. We turned the strongest points into a practical carousel you can use with your team.";
  }
  return "Revenue growth can hide a dangerous cash-flow problem. Here are the numbers every restaurant owner should watch before celebrating a record month. Save this for your next weekly review.";
}

export function getPackageHashtags(source: SourceKey): string[] {
  const common = [
    "#RestaurantBusiness",
    "#RestaurantOwner",
    "#RestaurantProfit",
    "#CashFlow",
    "#RestaurantManagement",
    "#HospitalityBusiness",
    "#SmallBusinessGrowth",
    "#RestaurantTips",
  ];
  if (source === "remix") common.push("#ContentMarketing", "#CarouselPost");
  if (source === "youtube") common.push("#YouTubeToCarousel", "#BusinessLessons");
  if (source === "web") common.push("#ArticleToCarousel", "#BusinessEducation");
  return common;
}
