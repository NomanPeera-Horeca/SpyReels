import type { Metadata } from "next";
import Script from "next/script";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HomepageAuthGate } from "../components/HomepageAuthGate";
import { MarketingFooter, MarketingHeader } from "../components/MarketingChrome";
import {
  MarketingFaq,
  MarketingFinalCta,
  MarketingPlatformStrip,
  MarketingWorkspace,
} from "../components/MarketingPageSections";
import { buildFaqPageJsonLd, jsonLdScript } from "../components/marketingFaqJsonLd";
import "./homepage.css";

const title = "SpyReels | Research Viral Reels and Remake Scripts in Your Voice";
const description =
  "SpyReels helps creators find viral Reels on Instagram, TikTok, and YouTube Shorts, then turn proven ideas into original scripts ready to film. Research, remake, and create in one workspace.";
const url = "https://spyreels.ai/";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { type: "website", url, siteName: "SpyReels", title, description },
  twitter: { card: "summary_large_image", title, description },
};

const HOMEPAGE_PLATFORM_MARKER = "<!--REACT:PLATFORM_STRIP-->";
const HOMEPAGE_WORKSPACE_MARKER = "<!--REACT:WORKSPACE-->";
const HOMEPAGE_FAQ_MARKER = "<!--REACT:FAQ-->";
const HOMEPAGE_FINAL_CTA_MARKER = "<!--REACT:FINAL_CTA-->";

/** Live homepage FAQ copy (keep wording identical to prior HTML segment). */
const HOMEPAGE_FAQ_ITEMS = [
  {
    q: "What is SpyReels?",
    a: "SpyReels is a short-form content research and scripting platform for Instagram Reels, TikTok, and YouTube Shorts. It helps creators find viral videos in their niche, understand why they worked, and create original hooks and scripts in their own voice.",
  },
  {
    q: "How does the Viral Reel Finder work?",
    a: "Enter a public creator username. SpyReels compares recent post performance with that creator\u2019s normal baseline and surfaces unusually successful content, so you can study genuine breakout posts instead of sorting by raw views alone.",
  },
  {
    q: "What can I do for free?",
    a: "Start with the free Viral Reel Finder to explore standout Reels from a public creator. Sign up to bring your research and creative tools together in one workspace. Check the current plan details before choosing a subscription.",
  },
  {
    q: "Which platforms does SpyReels support?",
    a: "The Viral Reel Finder focuses on Instagram Reels. You can adapt the ideas and scripts you create for TikTok and YouTube Shorts. Platform-specific research features may differ, so check each tool for its current availability.",
  },
  {
    q: "Does SpyReels copy other creators?",
    a: "No. SpyReels helps you understand patterns such as hooks, formats, and topics. Its writing tools are intended to create original content adapted to your niche, voice, and audience.",
  },
] as const;

function loadHomepageSegments() {
  const raw = readFileSync(join(process.cwd(), "app", "homepage.html"), "utf8");
  const [beforePlatform, afterPlatform] = raw.split(HOMEPAGE_PLATFORM_MARKER);
  const [throughGrowthSteps, afterWorkspace] = afterPlatform.split(HOMEPAGE_WORKSPACE_MARKER);
  const [beforeFaq, afterFaq] = afterWorkspace.split(HOMEPAGE_FAQ_MARKER);
  const [beforeFinalCta, afterFinalCta] = (afterFaq ?? "").split(HOMEPAGE_FINAL_CTA_MARKER);
  if (
    !beforePlatform ||
    !throughGrowthSteps ||
    beforeFaq === undefined ||
    beforeFinalCta === undefined ||
    afterFinalCta === undefined
  ) {
    throw new Error("homepage.html is missing React segment markers");
  }
  return { beforePlatform, throughGrowthSteps, beforeFaq, beforeFinalCta, afterFinalCta };
}

const homepageSegments = loadHomepageSegments();
const homepageFaqJsonLd = buildFaqPageJsonLd(HOMEPAGE_FAQ_ITEMS);

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${url}#organization`, name: "SpyReels", url, logo: `${url}marketing/0a709293985f.png` },
    { "@type": "WebSite", "@id": `${url}#website`, name: "SpyReels", url, publisher: { "@id": `${url}#organization` } },
    {
      "@type": "SoftwareApplication",
      "@id": `${url}#software`,
      name: "SpyReels",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      url,
      description,
      provider: { "@id": `${url}#organization` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free tier available" },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(homepageFaqJsonLd) }} />
      <MarketingHeader />
      <main id="top">
        <div dangerouslySetInnerHTML={{ __html: homepageSegments.beforePlatform }} />
        <MarketingPlatformStrip />
        <div dangerouslySetInnerHTML={{ __html: homepageSegments.throughGrowthSteps }} />
        <MarketingWorkspace
          layout="embedded"
          toolsPage="homepage"
          title="Find it. Make it yours. Get ready to post."
          freeToolsId="free-tools"
        />
        <div dangerouslySetInnerHTML={{ __html: homepageSegments.beforeFaq }} />
        <MarketingFaq
          title="Everything you need to know about SpyReels."
          description="See how SpyReels finds promising content, helps you make it your own, and gets you ready to film."
          items={HOMEPAGE_FAQ_ITEMS}
        />
        <div dangerouslySetInnerHTML={{ __html: homepageSegments.beforeFinalCta }} />
        <MarketingFinalCta
          id="pricing"
          title="Your next viral idea starts here."
          body="Find proven Reels. Remake them in your voice."
          buttonLabel="Find viral Reels for free"
          href="/?auth=signup&returnTo=%2Fresearch"
        />
        <div dangerouslySetInnerHTML={{ __html: homepageSegments.afterFinalCta }} />
      </main>
      <MarketingFooter />
      <HomepageAuthGate />
      <Script src="/marketing/chrome.js" strategy="afterInteractive" />
      <Script src="/marketing/homepage.js" strategy="afterInteractive" />
    </>
  );
}
