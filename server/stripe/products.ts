/**
 * Stripe Products & Pricing Configuration
 * 
 * All products and prices are created dynamically via the Stripe API.
 * This file defines the tier structure, feature limits, and pricing.
 */

export type PlanId = "free" | "starter" | "pro" | "business" | "agency";
export type BillingInterval = "monthly" | "yearly";

export interface PlanLimits {
  scrapesPerMonth: number;
  reelsPerScrape: number;
  searchesPerDay: number;
  urlIngestionLimit: number;
  transcriptionsPerMonth: number;
  recreatesPerMonth: number;
  rewritesPerScript: number;
  savedScripts: number;
  customTags: number;
  teamMembers: number;
  workspaces: number;
  // Feature flags
  hasSrtExport: boolean;
  hasAiCues: boolean;
  hasCalendar: boolean;
  hasKanban: boolean;
  hasVoiceTeleprompter: boolean;
  hasSmartTakes: boolean;
  hasCsvExport: boolean;
  hasGoogleSheets: boolean;
  hasGoogleDocs: boolean;
  hasPdfDocx: boolean;
  hasFullVersionHistory: boolean;
  hasApiAccess: boolean;
  hasWhiteLabel: boolean;
  hasPrioritySupport: boolean;
  // Extension limits
  extSortsPerDay: number;
  extSavesPerDay: number;
  extTranscribesPerMonth: number;
  extRecreatesPerMonth: number;
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number; // in cents (per month equivalent)
  yearlyTotal: number; // in cents (total annual)
  badge?: string; // "Most Popular", "Best Value", etc.
  limits: PlanLimits;
  features: string[]; // Marketing feature list for pricing page
  highlighted?: boolean; // Visual emphasis on pricing page
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    description: "Get started with basic reel analysis",
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyTotal: 0,
    limits: {
      scrapesPerMonth: 2,
      reelsPerScrape: 10,
      searchesPerDay: 3,
      urlIngestionLimit: 5,
      transcriptionsPerMonth: 3,
      recreatesPerMonth: 3,
      rewritesPerScript: 3,
      savedScripts: 5,
      customTags: 2,
      teamMembers: 1,
      workspaces: 1,
      hasSrtExport: false,
      hasAiCues: false,
      hasCalendar: false,
      hasKanban: false,
      hasVoiceTeleprompter: false,
      hasSmartTakes: false,
      hasCsvExport: false,
      hasGoogleSheets: false,
      hasGoogleDocs: false,
      hasPdfDocx: false,
      hasFullVersionHistory: false,
      hasApiAccess: false,
      hasWhiteLabel: false,
      hasPrioritySupport: false,
      extSortsPerDay: 5,
      extSavesPerDay: 3,
      extTranscribesPerMonth: 3,
      extRecreatesPerMonth: 3,
    },
    features: [
      "2 handle scrapes/month",
      "3 transcriptions/month",
      "3 AI re-creates/month",
      "3 Idea to Script/month",
      "5 saved scripts",
      "Basic teleprompter",
      "Chrome extension (limited)",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "For creators getting serious about content",
    monthlyPrice: 1900, // $19
    yearlyPrice: 1100, // $11/mo
    yearlyTotal: 13200, // $132/yr
    limits: {
      scrapesPerMonth: 10,
      reelsPerScrape: 50,
      searchesPerDay: 20,
      urlIngestionLimit: 20,
      transcriptionsPerMonth: 30,
      recreatesPerMonth: 15,
      rewritesPerScript: 2,
      savedScripts: 50,
      customTags: 10,
      teamMembers: 1,
      workspaces: 1,
      hasSrtExport: true,
      hasAiCues: false,
      hasCalendar: true,
      hasKanban: true,
      hasVoiceTeleprompter: false,
      hasSmartTakes: false,
      hasCsvExport: true,
      hasGoogleSheets: true,
      hasGoogleDocs: false,
      hasPdfDocx: false,
      hasFullVersionHistory: false,
      hasApiAccess: false,
      hasWhiteLabel: false,
      hasPrioritySupport: false,
      extSortsPerDay: 25,
      extSavesPerDay: 20,
      extTranscribesPerMonth: 15,
      extRecreatesPerMonth: 5,
    },
    features: [
      "10 handle scrapes/month",
      "30 transcriptions/month",
      "15 AI script re-creations",
      "Calendar & Kanban board",
      "CSV & Google Sheets export",
      "50 saved scripts",
      "SRT subtitle export",
      "Chrome extension (expanded)",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Everything you need to go viral consistently",
    monthlyPrice: 4900, // $49
    yearlyPrice: 2900, // $29/mo
    yearlyTotal: 34800, // $348/yr
    badge: "Most Popular",
    highlighted: true,
    limits: {
      scrapesPerMonth: 50,
      reelsPerScrape: 999999,
      searchesPerDay: 999999,
      urlIngestionLimit: 20,
      transcriptionsPerMonth: 200,
      recreatesPerMonth: 100,
      rewritesPerScript: 10,
      savedScripts: 500,
      customTags: 999999,
      teamMembers: 3,
      workspaces: 1,
      hasSrtExport: true,
      hasAiCues: true,
      hasCalendar: true,
      hasKanban: true,
      hasVoiceTeleprompter: true,
      hasSmartTakes: true,
      hasCsvExport: true,
      hasGoogleSheets: true,
      hasGoogleDocs: true,
      hasPdfDocx: true,
      hasFullVersionHistory: true,
      hasApiAccess: false,
      hasWhiteLabel: false,
      hasPrioritySupport: false,
      extSortsPerDay: 999999,
      extSavesPerDay: 999999,
      extTranscribesPerMonth: 100,
      extRecreatesPerMonth: 50,
    },
    features: [
      "50 handle scrapes/month",
      "200 transcriptions/month",
      "100 AI script re-creations",
      "AI delivery cues & coaching",
      "Voice-driven teleprompter",
      "Smart take tracking",
      "Google Docs, PDF & DOCX export",
      "Full version history",
      "Up to 3 team members",
      "Unlimited tags & searches",
      "Chrome extension (unlimited)",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    description: "Scale your content team with powerful tools",
    monthlyPrice: 9900, // $99
    yearlyPrice: 5900, // $59/mo
    yearlyTotal: 70800, // $708/yr
    badge: "Best for Teams",
    limits: {
      scrapesPerMonth: 200,
      reelsPerScrape: 999999,
      searchesPerDay: 999999,
      urlIngestionLimit: 20,
      transcriptionsPerMonth: 1000,
      recreatesPerMonth: 500,
      rewritesPerScript: 999999,
      savedScripts: 999999,
      customTags: 999999,
      teamMembers: 10,
      workspaces: 3,
      hasSrtExport: true,
      hasAiCues: true,
      hasCalendar: true,
      hasKanban: true,
      hasVoiceTeleprompter: true,
      hasSmartTakes: true,
      hasCsvExport: true,
      hasGoogleSheets: true,
      hasGoogleDocs: true,
      hasPdfDocx: true,
      hasFullVersionHistory: true,
      hasApiAccess: true,
      hasWhiteLabel: false,
      hasPrioritySupport: true,
      extSortsPerDay: 999999,
      extSavesPerDay: 999999,
      extTranscribesPerMonth: 500,
      extRecreatesPerMonth: 250,
    },
    features: [
      "200 handle scrapes/month",
      "1,000 transcriptions/month",
      "500 AI script re-creations",
      "Unlimited rewrites per script",
      "Up to 10 team members",
      "3 workspaces",
      "API access",
      "Priority chat support",
      "Everything in Pro",
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    description: "For agencies managing multiple brands at scale",
    monthlyPrice: 19900, // $199
    yearlyPrice: 11900, // $119/mo
    yearlyTotal: 142800, // $1,428/yr
    badge: "Enterprise",
    limits: {
      scrapesPerMonth: 999999,
      reelsPerScrape: 999999,
      searchesPerDay: 999999,
      urlIngestionLimit: 20,
      transcriptionsPerMonth: 999999,
      recreatesPerMonth: 999999,
      rewritesPerScript: 999999,
      savedScripts: 999999,
      customTags: 999999,
      teamMembers: 25,
      workspaces: 10,
      hasSrtExport: true,
      hasAiCues: true,
      hasCalendar: true,
      hasKanban: true,
      hasVoiceTeleprompter: true,
      hasSmartTakes: true,
      hasCsvExport: true,
      hasGoogleSheets: true,
      hasGoogleDocs: true,
      hasPdfDocx: true,
      hasFullVersionHistory: true,
      hasApiAccess: true,
      hasWhiteLabel: true,
      hasPrioritySupport: true,
      extSortsPerDay: 999999,
      extSavesPerDay: 999999,
      extTranscribesPerMonth: 999999,
      extRecreatesPerMonth: 999999,
    },
    features: [
      "Unlimited everything",
      "25 team members",
      "10 workspaces",
      "White-label reports",
      "Dedicated account manager",
      "API access",
      "Custom onboarding",
      "Everything in Business",
    ],
  },
};

/** Get plan config by ID */
export function getPlanConfig(planId: PlanId): PlanConfig {
  return PLANS[planId] || PLANS.free;
}

/** Get limits for a plan */
export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId]?.limits || PLANS.free.limits;
}

/** Check if a value is effectively unlimited (>= 999999) */
export function isUnlimited(value: number): boolean {
  return value >= 999999;
}

/** Plan hierarchy for comparison */
const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "business", "agency"];

/** Check if planA is higher tier than planB */
export function isHigherTier(planA: PlanId, planB: PlanId): boolean {
  return PLAN_ORDER.indexOf(planA) > PLAN_ORDER.indexOf(planB);
}

/** Get the minimum plan required for a feature */
export function getMinPlanForFeature(feature: keyof PlanLimits): PlanId {
  for (const planId of PLAN_ORDER) {
    const limits = PLANS[planId].limits;
    const value = limits[feature];
    if (typeof value === "boolean" && value) return planId;
    if (typeof value === "number" && value > 0) return planId;
  }
  return "agency";
}

/** All plan IDs in order */
export const PLAN_IDS = PLAN_ORDER;

/** Stripe product metadata key */
export const STRIPE_PLAN_METADATA_KEY = "plan_id";
export const STRIPE_INTERVAL_METADATA_KEY = "billing_interval";
