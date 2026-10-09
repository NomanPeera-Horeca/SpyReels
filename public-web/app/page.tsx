import type { Metadata } from "next";
import Script from "next/script";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HomepageAuthGate } from "../components/HomepageAuthGate";
import { MarketingFooter, MarketingHeader } from "../components/MarketingChrome";
import {
  MarketingPlatformStrip,
  MarketingWorkspace,
} from "../components/MarketingPageSections";
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

function loadHomepageSegments() {
  const raw = readFileSync(join(process.cwd(), "app", "homepage.html"), "utf8");
  const [beforePlatform, afterPlatform] = raw.split(HOMEPAGE_PLATFORM_MARKER);
  const [throughGrowthSteps, afterWorkspace] = afterPlatform.split(HOMEPAGE_WORKSPACE_MARKER);
  if (!beforePlatform || !throughGrowthSteps || afterWorkspace === undefined) {
    throw new Error("homepage.html is missing React segment markers");
  }
  return { beforePlatform, throughGrowthSteps, afterWorkspace };
}

const homepageSegments = loadHomepageSegments();

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
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
        <div dangerouslySetInnerHTML={{ __html: homepageSegments.afterWorkspace }} />
      </main>
      <MarketingFooter />
      <HomepageAuthGate />
      <Script src="/marketing/chrome.js" strategy="afterInteractive" />
      <Script src="/marketing/homepage.js" strategy="afterInteractive" />
    </>
  );
}
