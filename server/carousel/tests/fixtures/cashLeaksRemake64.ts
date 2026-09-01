import {
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
  type CarouselCopySlotValues,
} from "@shared/carouselStudio";

/** Safe fields from production remake 64 selected brief (index 2). */
export const CASH_LEAKS_REMAKE_64_BRIEF: CarouselCreativeBrief = {
  schemaVersion: 2,
  isLegacy: false,
  id: "brief_3",
  kicker: "Framework",
  title: "The 5 Cash Leaks Draining Small Businesses (And How to Plug Them)",
  description: "Name five cash leaks and show a matching plug for each one.",
  estimatedSlideCount: 12,
  topic: "small business cash flow",
  inferredAudience: "small business owners",
  audienceReasoning: "The source asks why small businesses run out of cash.",
  contentGoal: "saves",
  contentFormat: "framework",
  angleType: "how_to",
  hook: "Five quiet leaks are draining your business bank account. Here is how to find and fix each one.",
  corePromise:
    "Readers will walk away with a named leak and a matching fix they can act on immediately.",
  centralInsight:
    "Every cash flow problem in a small business traces back to one of five controllable leaks, and each has a practical plug.",
  keyPoints: [
    {
      title: "Leak 1: Invoice Timing",
      purpose: "Identifies the most common and immediately fixable cash flow leak.",
      explanation:
        "Sending invoices late or on loose terms delays cash receipt by weeks or months.",
    },
    {
      title: "Fix 1: Shorten Your Payment Cycle",
      purpose: "Pairs a concrete action directly with the preceding leak.",
      explanation:
        "Switch to upfront deposits, shorter net terms, or automated invoice reminders to accelerate cash in.",
    },
    {
      title: "Leak 2: Inventory Overstocking",
      purpose: "Addresses a cash trap specific to product businesses.",
      explanation:
        "Ordering more stock than near-term demand requires traps cash in unsold goods.",
    },
    {
      title: "Fix 2: Demand-Led Ordering",
      purpose: "Gives product business owners a decision rule, not just advice.",
      explanation:
        "Use recent sales data to set a reorder threshold that matches actual demand rather than optimistic projections.",
    },
    {
      title: "Leak 3: Unreviewed Subscriptions",
      purpose: "Names a small but overlooked cash drain that is immediately actionable.",
      explanation:
        "Monthly software, tools, and service subscriptions accumulate and often go unused.",
    },
    {
      title: "Leak 4: Premature Hiring",
      purpose: "Addresses a growth-stage trap that catches many expanding businesses.",
      explanation:
        "Adding payroll before revenue can support it creates a fixed cost that outlasts the optimism that prompted it.",
    },
    {
      title: "Leak 5: No Cash Reserve",
      purpose: "Frames the reserve not as a luxury but as a structural necessity.",
      explanation:
        "Operating without a buffer means any dip in revenue immediately becomes an existential problem.",
    },
    {
      title: "The Weekly Cash Flow Check",
      purpose: "Provides a single repeatable practice that reinforces all five fixes.",
      explanation:
        "A simple habit of reviewing cash in, cash out, and cash on hand every week catches leaks before they become crises.",
    },
  ],
  slideOutline: [
    {
      role: "hook",
      position: 1,
      objective:
        "Lead with the five-leak premise and promise a fix for each one to drive immediate interest.",
      recommendedVisual: "text",
    },
    {
      role: "context",
      position: 2,
      objective:
        "Distinguish cash flow from profit to frame why these leaks are invisible to most owners.",
      recommendedVisual: "comparison",
    },
    {
      role: "framework",
      position: 3,
      objective:
        "Introduce Leak 1 (invoice timing) and explain why delayed invoicing delays cash receipt.",
      recommendedVisual: "timeline",
    },
    {
      role: "insight",
      position: 4,
      objective:
        "Present Fix 1: specific tactics for shortening payment cycles and collecting faster.",
      recommendedVisual: "checklist",
    },
    {
      role: "framework",
      position: 5,
      objective:
        "Introduce Leak 2 (inventory overstocking) and show how excess stock freezes cash.",
      recommendedVisual: "diagram",
    },
    {
      role: "insight",
      position: 6,
      objective:
        "Present Fix 2: demand-led ordering using recent sales data as a reorder guide.",
      recommendedVisual: "data",
    },
    {
      role: "framework",
      position: 7,
      objective:
        "Introduce Leak 3 (unreviewed subscriptions) and prompt owners to audit recurring charges.",
      recommendedVisual: "checklist",
    },
    {
      role: "framework",
      position: 8,
      objective:
        "Introduce Leak 4 (premature hiring) and explain the payroll-revenue timing trap.",
      recommendedVisual: "text",
    },
    {
      role: "framework",
      position: 9,
      objective:
        "Introduce Leak 5 (no cash reserve) and explain how to size a basic operating buffer.",
      recommendedVisual: "data",
    },
    {
      role: "takeaway",
      position: 10,
      objective:
        "Present the weekly cash flow check habit as the single practice that catches all five leaks early.",
      recommendedVisual: "checklist",
    },
    {
      role: "comparison",
      position: 11,
      objective:
        "Show a side-by-side of a business with all five leaks active versus one with all five plugged.",
      recommendedVisual: "comparison",
    },
    {
      role: "cta",
      position: 12,
      objective:
        "Direct readers to screenshot the five leaks, audit their business this week, and share with their accountant or business partner.",
      recommendedVisual: "text",
    },
  ],
  layoutFamily: "framework",
  visualDirection: "Simple numbered breakdown cards.",
  imageDirection: "Neutral desk photos.",
  claimRisk: "medium",
  researchMode: "claim_verification",
  evidenceRequirements: [
    "Verify that upfront deposits and short net terms are standard and enforceable in small business service contracts",
    "Confirm that unused SaaS subscriptions are a documented and common small business expense category",
    "Check standard guidance on recommended cash reserve amounts for small businesses",
    "Verify that weekly cash flow review is a recognized small business financial practice",
  ],
  prohibitedClaims: [
    "Do not claim a specific percentage of businesses fail due to any single leak",
    "Do not guarantee that plugging all five leaks will prevent business failure",
    "Do not state that premature hiring is the leading cause of small business closure without a verified source",
    "Do not promise a specific cash improvement from any individual tactic",
  ],
  ctaDirection:
    "Tell readers to screenshot the five leaks, audit their own business this week, and share the post with their accountant or business partner.",
  scores: scoreCarouselCreativeBrief({
    relevance: 96,
    usefulness: 96,
    specificity: 93,
    visualPotential: 92,
    factualSafety: 80,
    originality: 78,
  }),
  confidence: 0.93,
};

/** Exact generated titles/bodies from production remake 64, plus copy-call intent metadata. */
export const CASH_LEAKS_REMAKE_64_VALUES: CarouselCopySlotValues = {
  slide_01: {
    kicker: "CASH FLOW",
    headline: "5 Leaks Draining Your Business",
    subhead:
      "You may be profitable on paper but still run dry. Here are the five reasons why.",
    slideIntent: "content",
  },
  slide_02: {
    kicker: "01",
    headline: "Leak 1: Invoice Timing",
    body: "Sending invoices late or on loose terms delays your cash by weeks. The work is done but the money hasn't arrived.",
    slideIntent: "content",
  },
  slide_03: {
    kicker: "02",
    headline: "Fix 1: Shorter Pay Cycles",
    body: "Use upfront deposits, tighter net terms, and automated reminders. Get paid faster without chasing every client.",
    slideIntent: "content",
  },
  slide_04: {
    kicker: "03",
    headline: "Leak 2: Inventory Overstock",
    body: "Ordering more than demand requires traps cash in unsold goods sitting on your shelves instead of in your account.",
    slideIntent: "content",
  },
  slide_05: {
    kicker: "04",
    headline: "Fix 2: Demand-Led Ordering",
    body: "Use recent sales data to set a reorder threshold. Match your orders to actual demand, not optimistic projections.",
    slideIntent: "content",
  },
  slide_06: {
    kicker: "05",
    headline: "Leak 3: Unused Subscriptions",
    body: "Software and service subscriptions pile up fast. Many go unused for months, quietly draining your account every cycle.",
    slideIntent: "content",
  },
  slide_07: {
    kicker: "06",
    headline: "Leak 4: Premature Hiring",
    body: "Adding payroll before revenue supports it creates a fixed cost that outlasts the optimism that prompted the hire.",
    slideIntent: "content",
  },
  slide_08: {
    kicker: "07",
    headline: "Leak 5: No Cash Reserve",
    body: "No buffer means any revenue dip becomes an immediate crisis. A reserve is not a luxury, it is a structural need.",
    slideIntent: "content",
  },
  slide_09: {
    kicker: "08",
    headline: "The Weekly Cash Check",
    body: "Review cash in, cash out, and cash on hand every week. One simple habit catches leaks before they become crises.",
    slideIntent: "transition",
  },
  slide_10: {
    kicker: "09",
    headline: "Five Leaks vs. Five Plugs",
    body: "All five leaks active means constant pressure. All five plugged means predictable cash and far fewer emergencies.",
    slideIntent: "content",
  },
  slide_11: {
    kicker: "10",
    headline: "Which Leak Hits You Most?",
    body: "Most owners have at least two of these running right now. Audit each one this week and see where your cash is going.",
    slideIntent: "closing",
    closingType: "question",
  },
  slide_12: {
    headline: "Screenshot and audit this week",
    subhead: "Share with your accountant or business partner today.",
    cta_label: "Save this now",
    slideIntent: "closing",
    closingType: "save",
  },
};

export const CASH_LEAKS_REMAKE_64_SLIDE_IDS = [
  "slide_01",
  "slide_02",
  "slide_03",
  "slide_04",
  "slide_05",
  "slide_06",
  "slide_07",
  "slide_08",
  "slide_09",
  "slide_10",
  "slide_11",
  "slide_12",
];

export const CASH_LEAKS_REMAKE_64_SLIDE_ROLES = [
  "hook",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "list_item",
  "cta",
];

/** User-reported sequence: Fix 1 first, no Leak 1 slide. */
export const CASH_LEAKS_MISSING_LEAK1_VALUES: CarouselCopySlotValues = {
  ...CASH_LEAKS_REMAKE_64_VALUES,
  slide_02: {
    kicker: "01",
    headline: "Fix 1: Shorter Pay Cycles",
    body: "Use upfront deposits, tighter net terms, and automated reminders. Get paid faster without chasing every client.",
    slideIntent: "content",
  },
  slide_03: {
    kicker: "02",
    headline: "Leak 2: Inventory Overstock",
    body: "Ordering more than demand requires traps cash in unsold goods sitting on your shelves instead of in your account.",
    slideIntent: "content",
  },
};

export function validFiveLeakFiveFixBrief(): CarouselCreativeBrief {
  return {
    ...CASH_LEAKS_REMAKE_64_BRIEF,
    id: "brief_valid",
    title: "Five leaks and five plugs",
    hook: "Five cash leaks drain small businesses. Here is the matching plug for each one.",
    keyPoints: [
      {
        title: "Leak 1: Invoice Timing",
        explanation: "Late invoices delay cash.",
        purpose: "Name leak 1.",
      },
      {
        title: "Fix 1: Shorter Cycles",
        explanation: "Deposits and tighter terms collect faster.",
        purpose: "Name fix 1.",
      },
      {
        title: "Leak 2: Inventory Overstock",
        explanation: "Excess stock freezes cash.",
        purpose: "Name leak 2.",
      },
      {
        title: "Fix 2: Demand-Led Ordering",
        explanation: "Reorder from recent sales data.",
        purpose: "Name fix 2.",
      },
      {
        title: "Leak 3: Unused Subscriptions",
        explanation: "Recurring tools drain cash.",
        purpose: "Name leak 3.",
      },
      {
        title: "Fix 3: Cancel Unused Tools",
        explanation: "Audit and cut unused software.",
        purpose: "Name fix 3.",
      },
      {
        title: "Leak 4: Premature Hiring",
        explanation: "Payroll can outrun revenue.",
        purpose: "Name leak 4.",
      },
      {
        title: "Fix 4: Hire From Cash",
        explanation: "Add payroll only when cash supports it.",
        purpose: "Name fix 4.",
      },
    ],
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective: "Open on five cash leaks and promise a matching plug for each leak.",
        recommendedVisual: "text",
      },
      {
        position: 2,
        role: "problem",
        objective: "Introduce Leak 1 invoice timing and delayed cash receipt.",
        recommendedVisual: "timeline",
      },
      {
        position: 3,
        role: "insight",
        objective: "Present Fix 1 shorter payment cycles with deposits and reminders.",
        recommendedVisual: "checklist",
      },
      {
        position: 4,
        role: "problem",
        objective: "Introduce Leak 2 inventory overstocking that freezes cash in goods.",
        recommendedVisual: "diagram",
      },
      {
        position: 5,
        role: "insight",
        objective: "Present Fix 2 demand-led ordering from recent sales data.",
        recommendedVisual: "data",
      },
      {
        position: 6,
        role: "problem",
        objective: "Introduce Leak 3 unused subscriptions and recurring charges.",
        recommendedVisual: "checklist",
      },
      {
        position: 7,
        role: "insight",
        objective: "Present Fix 3 cancel unused software after a subscription audit.",
        recommendedVisual: "checklist",
      },
      {
        position: 8,
        role: "problem",
        objective: "Introduce Leak 4 premature hiring and the payroll timing trap.",
        recommendedVisual: "text",
      },
      {
        position: 9,
        role: "insight",
        objective: "Present Fix 4 hire only after cash can support payroll.",
        recommendedVisual: "text",
      },
      {
        position: 10,
        role: "problem",
        objective: "Introduce Leak 5 no cash reserve and the missing operating buffer.",
        recommendedVisual: "data",
      },
      {
        position: 11,
        role: "insight",
        objective: "Present Fix 5 build a basic operating buffer from weekly leftover cash.",
        recommendedVisual: "data",
      },
      {
        position: 12,
        role: "cta",
        objective: "Ask readers to screenshot the five leaks and audit cash this week.",
        recommendedVisual: "text",
      },
    ],
  };
}

export const VALID_FIVE_LEAK_FIVE_FIX_VALUES: CarouselCopySlotValues = {
  slide_01: {
    kicker: "CASH FLOW",
    headline: "Five leaks, five matching plugs",
    subhead: "Each leak has a plug you can use this week.",
    slideIntent: "content",
  },
  slide_02: {
    kicker: "01",
    headline: "Leak 1: Invoice Timing",
    body: "Late invoices delay cash receipt. Work is done, but the money is still sitting with the client.",
    slideIntent: "content",
  },
  slide_03: {
    kicker: "02",
    headline: "Fix 1: Shorter Pay Cycles",
    body: "Use deposits, tighter terms, and reminders so payment cycles collect cash faster.",
    slideIntent: "content",
  },
  slide_04: {
    kicker: "03",
    headline: "Leak 2: Inventory Overstock",
    body: "Overstocking freezes cash in unsold goods. Extra stock is cash you cannot spend.",
    slideIntent: "content",
  },
  slide_05: {
    kicker: "04",
    headline: "Fix 2: Demand-Led Ordering",
    body: "Set reorder points from recent sales data so demand, not hope, decides the next order.",
    slideIntent: "content",
  },
  slide_06: {
    kicker: "05",
    headline: "Leak 3: Unused Subscriptions",
    body: "Unused subscriptions and recurring charges keep leaving the account every month.",
    slideIntent: "content",
  },
  slide_07: {
    kicker: "06",
    headline: "Fix 3: Cancel Unused Tools",
    body: "Audit software this week and cancel unused subscriptions before the next charge.",
    slideIntent: "content",
  },
  slide_08: {
    kicker: "07",
    headline: "Leak 4: Premature Hiring",
    body: "Premature hiring creates a payroll timing trap when revenue cannot support the cost.",
    slideIntent: "content",
  },
  slide_09: {
    kicker: "08",
    headline: "Fix 4: Hire From Cash",
    body: "Add payroll only after cash on hand can support the new hire for several months.",
    slideIntent: "content",
  },
  slide_10: {
    kicker: "09",
    headline: "Leak 5: No Cash Reserve",
    body: "No operating buffer means a quiet week turns into an immediate cash emergency.",
    slideIntent: "content",
  },
  slide_11: {
    kicker: "10",
    headline: "Fix 5: Build a Buffer",
    body: "Park leftover cash each week until a basic operating buffer covers a slow month.",
    slideIntent: "content",
  },
  slide_12: {
    headline: "Screenshot the five leaks",
    subhead: "Audit cash this week and keep the matching plugs nearby.",
    cta_label: "Save this list",
    slideIntent: "closing",
    closingType: "save",
  },
};
