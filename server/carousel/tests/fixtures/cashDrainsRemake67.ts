import {
  scoreCarouselCreativeBrief,
  type CarouselCopySlotValues,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";

/** Production remake 67 selected brief: promised 6 cash drains, outlined 5. */
export const CASH_DRAINS_REMAKE_67_BRIEF: CarouselCreativeBrief = {
  schemaVersion: 2,
  isLegacy: false,
  id: "brief_1",
  kicker: "Diagnostic",
  title: "The 6 Silent Cash Drains Killing Small Businesses",
  description:
    "A breakdown carousel that names specific cash flow failure points, giving owners a self-audit lens they can apply immediately.",
  estimatedSlideCount: 9,
  topic: "Why small businesses run out of cash",
  inferredAudience: "Small business owners and early-stage entrepreneurs",
  audienceReasoning:
    "The source is directly about small business cash problems, making owners the obvious primary audience.",
  contentGoal: "saves",
  contentFormat: "breakdown",
  angleType: "diagnostic",
  hook: "Your business is profitable on paper, but your bank account says otherwise. Here is why.",
  corePromise:
    "Readers will identify exactly which cash drain is silently hurting their business right now.",
  centralInsight:
    "Most small businesses do not run out of cash because of low revenue; they run out because of predictable, fixable structural leaks they never learned to spot.",
  keyPoints: [
    {
      title: "Profit vs. Cash Flow Confusion",
      purpose: "Establishes the core misconception that makes all other leaks worse.",
      explanation:
        "Many owners treat net profit on the income statement as available cash, ignoring timing gaps between earning and receiving money.",
    },
    {
      title: "Slow Invoicing and Late Collections",
      purpose: "Identifies the most common operational leak for service businesses.",
      explanation:
        "Delayed invoicing and soft follow-up on overdue accounts creates a gap between work done and cash received.",
    },
    {
      title: "Inventory Tied Up as Dead Stock",
      purpose: "Targets product-based businesses with a specific, relatable drain.",
      explanation:
        "Overstocked or slow-moving inventory locks cash in shelves instead of the bank.",
    },
    {
      title: "Paying Suppliers Faster Than Customers Pay You",
      purpose:
        "Explains a timing mismatch most owners never frame as a cash flow issue.",
      explanation:
        "Mismatched payment terms mean cash leaves before it arrives, creating a structural float problem.",
    },
    {
      title: "No Cash Reserve Buffer",
      purpose: "Points to a missing habit rather than a spending problem.",
      explanation:
        "Operating without a reserve means any slow month or unexpected expense immediately creates a crisis.",
    },
    {
      title: "Unplanned Tax Obligations",
      purpose: "Highlights a predictable but commonly ignored cash shock.",
      explanation:
        "Owners who do not set aside tax payments throughout the year face a large lump-sum drain at filing time.",
    },
  ],
  slideOutline: [
    {
      position: 1,
      role: "hook",
      objective:
        "Confront owners with the paradox of being profitable but broke to earn an immediate stop-scroll.",
      recommendedVisual: "text",
    },
    {
      position: 2,
      role: "context",
      objective:
        "Clarify the difference between profit and cash flow so readers understand why revenue alone does not protect them.",
      recommendedVisual: "comparison",
    },
    {
      position: 3,
      role: "problem",
      objective:
        "Introduce slow invoicing and late collections as Cash Drain 1 with a concrete scenario.",
      recommendedVisual: "text",
    },
    {
      position: 4,
      role: "problem",
      objective:
        "Introduce dead inventory as Cash Drain 2 and show how it silently ties up working capital.",
      recommendedVisual: "diagram",
    },
    {
      position: 5,
      role: "problem",
      objective:
        "Introduce mismatched supplier and customer payment terms as Cash Drain 3.",
      recommendedVisual: "timeline",
    },
    {
      position: 6,
      role: "problem",
      objective:
        "Introduce operating without a cash reserve as Cash Drain 4 and frame it as a structural gap.",
      recommendedVisual: "text",
    },
    {
      position: 7,
      role: "problem",
      objective:
        "Introduce unplanned tax obligations as Cash Drain 5 and show the typical surprise timing.",
      recommendedVisual: "text",
    },
    {
      position: 8,
      role: "insight",
      objective:
        "Reframe the diagnosis: cash problems are usually a systems problem, not a sales problem.",
      recommendedVisual: "text",
    },
    {
      position: 9,
      role: "cta",
      objective:
        "Prompt owners to identify their biggest drain and comment or save for future reference.",
      recommendedVisual: "text",
    },
  ],
  layoutFamily: "breakdown",
  visualDirection:
    "Bold numbered drain labels on dark or deep-navy backgrounds with accent color callouts for the cash amount or timing gap on each slide.",
  imageDirection:
    "No stock photos; use minimal iconography and large typographic numbers to give each drain a distinct visual identity.",
  claimRisk: "medium",
  researchMode: "claim_verification",
  evidenceRequirements: [
    "Verify that slow invoicing is among the top cited cash flow problems for small businesses",
    "Confirm that a meaningful percentage of small business failures are linked to cash flow rather than profitability",
    "Check typical recommended cash reserve duration (commonly 3 to 6 months) before stating a specific figure",
    "Confirm that tax underpayment is a documented common issue for small business owners",
    "Verify payment term mismatch as a recognized working capital problem in small business finance literature",
  ],
  prohibitedClaims: [
    "Do not claim a specific percentage of small businesses fail due to cash flow without a verified source",
    "Do not claim any single drain is the number one cause of small business failure",
    "Do not promise that fixing these leaks guarantees business survival",
    "Do not state specific dollar thresholds for reserves without qualification",
    "Do not imply that profitability is irrelevant to business health",
  ],
  ctaDirection:
    "Ask readers to comment which drain hit closest to home, driving personalized engagement and saving.",
  scores: scoreCarouselCreativeBrief({
    relevance: 99,
    usefulness: 93,
    specificity: 88,
    visualPotential: 85,
    factualSafety: 74,
    originality: 72,
  }),
  confidence: 0.88,
};

export const OPEN_CASH_FLOW_USER_PROMPT =
  "Make me a carousel about why small businesses run out of cash.";

/** Corrected remake 67: cover + six drain items + closing. */
export function cashDrainsRemake67CorrectedBrief(): CarouselCreativeBrief {
  return {
    ...CASH_DRAINS_REMAKE_67_BRIEF,
    id: "brief_67_corrected",
    estimatedSlideCount: 8,
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective:
          "Confront owners with the paradox of being profitable but broke to earn an immediate stop-scroll.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 2,
        role: "problem",
        objective:
          "Introduce profit versus cash confusion as Cash Drain 1 and show why paper profit is not spendable cash.",
        recommendedVisual: "comparison",
        listItemIndex: 1,
      },
      {
        position: 3,
        role: "problem",
        objective:
          "Introduce slow invoicing and late collections as Cash Drain 2 with a concrete scenario.",
        recommendedVisual: "text",
        listItemIndex: 2,
      },
      {
        position: 4,
        role: "problem",
        objective:
          "Introduce dead inventory as Cash Drain 3 and show how it silently ties up working capital.",
        recommendedVisual: "diagram",
        listItemIndex: 3,
      },
      {
        position: 5,
        role: "problem",
        objective:
          "Introduce mismatched supplier and customer payment terms as Cash Drain 4.",
        recommendedVisual: "timeline",
        listItemIndex: 4,
      },
      {
        position: 6,
        role: "problem",
        objective:
          "Introduce operating without a cash reserve as Cash Drain 5 and frame it as a structural gap.",
        recommendedVisual: "text",
        listItemIndex: 5,
      },
      {
        position: 7,
        role: "problem",
        objective:
          "Introduce unplanned tax obligations as Cash Drain 6 and show the typical surprise timing.",
        recommendedVisual: "text",
        listItemIndex: 6,
      },
      {
        position: 8,
        role: "cta",
        objective:
          "Prompt owners to identify their biggest drain and comment or save for future reference.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
    ],
  };
}

export const CASH_DRAINS_REMAKE_67_SLIDE_IDS = [
  "slide_01",
  "slide_02",
  "slide_03",
  "slide_04",
  "slide_05",
  "slide_06",
  "slide_07",
  "slide_08",
];

export const CASH_DRAINS_REMAKE_67_CORRECTED_VALUES: CarouselCopySlotValues = {
  slide_01: {
    kicker: "CASH FLOW",
    headline: "Profitable on paper, empty at the bank",
    body: "The gap is usually a drain you can name, not a sales problem.",
    slideIntent: "content",
  },
  slide_02: {
    kicker: "01",
    headline: "Paper profit is not spendable cash",
    body: "A strong P and L can still hide a dry checking account.",
    slideIntent: "content",
  },
  slide_03: {
    kicker: "02",
    headline: "Slow invoicing delays the deposit",
    body: "Work can be done while payment is still weeks away.",
    slideIntent: "content",
  },
  slide_04: {
    kicker: "03",
    headline: "Dead stock traps working capital",
    body: "Unsold goods lock cash on the shelf instead of in the bank.",
    slideIntent: "content",
  },
  slide_05: {
    kicker: "04",
    headline: "You pay out faster than you collect",
    body: "Mismatched terms create a float problem owners rarely name.",
    slideIntent: "content",
  },
  slide_06: {
    kicker: "05",
    headline: "No reserve turns a slow week into a crisis",
    body: "A quiet month becomes urgent when there is no buffer.",
    slideIntent: "content",
  },
  slide_07: {
    kicker: "06",
    headline: "Tax season arrives as a lump-sum shock",
    body: "Money that was never set aside still comes due.",
    slideIntent: "content",
  },
  slide_08: {
    headline: "Which drain is hitting you now?",
    body: "Name it, comment it, and keep this list nearby.",
    slideIntent: "closing",
    closingType: "question",
  },
};

export const CASH_DRAINS_REMAKE_67_BAD_NUMBER_VALUES: CarouselCopySlotValues = {
  ...CASH_DRAINS_REMAKE_67_CORRECTED_VALUES,
  slide_03: {
    kicker: "04",
    headline: "Slow invoicing delays the deposit",
    body: "Work can be done while payment is still weeks away.",
    slideIntent: "content",
  },
};
