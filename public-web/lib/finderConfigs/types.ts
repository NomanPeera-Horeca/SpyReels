import type { Metadata } from "next";
import type { MarketingFaqItem } from "../../components/marketingFaqJsonLd";
import type { MarketingHowItWorksStep } from "../../components/MarketingHowItWorksSection";
import type { FinderProfileLookupResult } from "../../components/useFinderProfileLookup";

export type FinderPlatform = "instagram" | "tiktok" | "youtube";

export type FinderExamplesVariant = "tryRow" | "tryInline";

/** Profile meta line style in the confirmed-profile card. */
export type FinderProfileMetaKind = "followersFollowing" | "followersVideos";

export type FinderDemoItem = {
  id: number;
  caption: string;
  thumbnailUrl: string | null;
  viewCount: number;
  engagementRate: number;
};

export type FinderConfig = {
  platform: FinderPlatform;
  /** Root page path used for auth handoff navigation */
  pagePath: string;
  /** Anchor id wrapping the finder experience */
  experienceId: string;
  /** Results preview element id */
  resultsId: string;
  metadata: Metadata;
  hero: {
    eyebrow: string;
    /** Text before the accent word "viral" */
    titleBefore: string;
    /** Text after the accent word "viral" */
    titleAfter: string;
    lead: string;
  };
  howItWorks: {
    title: string;
    description?: string;
    steps: readonly [MarketingHowItWorksStep, MarketingHowItWorksStep, MarketingHowItWorksStep];
  };
  workspace: {
    toolsPage: "instagram" | "tiktok" | "youtube";
    title: string;
  };
  faq: {
    title: string;
    description: string;
    items: readonly MarketingFaqItem[];
  };
  finalCta: {
    title: string;
    body: string;
    buttonLabel: string;
    href: string;
  };
  jsonLd: {
    software: Record<string, unknown>;
    breadcrumb?: Record<string, unknown>;
  };
  search: {
    label: string;
    inputId: string;
    placeholder: string;
    submitLabel: string;
    profileLoadingLabel: string;
    profileErrorId: string;
    profileTestId: string;
    invalidHandleMessage: string;
    emptyHandleMessage: string;
    profileContinueAriaLabel: (username: string) => string;
    noValidate?: boolean;
    inputName?: string;
    spellCheck?: boolean;
    dataFinderReady?: boolean;
    examplesVariant: FinderExamplesVariant;
    examplesPrefix: string;
    demoHandles: readonly string[];
    platformLabel: string;
    profileMetaKind: FinderProfileMetaKind;
    normalizeHandle: (raw: string) => string;
    validHandle: (handle: string) => boolean;
    fetchProfile: (handle: string, signal: AbortSignal) => Promise<FinderProfileLookupResult>;
    demoUrl: (handle: string) => string;
    parseDemoPayload: (body: unknown, ok: boolean) => { handle: string; items: FinderDemoItem[] };
    demoUnavailableMessage: string;
    buildReturnTo: (handle: string) => string;
    revealResultsOnLoad?: boolean;
  };
};

export type { FinderProfileLookupResult };
